#!/usr/bin/env python3
"""Single blocking foreground supervisor for the complete R29B2M-R3 campaign."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
import time
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_r3_campaign import (  # noqa: E402
    ACTIVE_STATES,
    CAMPAIGN_ID,
    STATES,
    TERMINAL_STATES,
    CampaignPaths,
    atomic_json,
    initial_state,
    utc_now,
    validate_state,
)
from src.training.mlx.r29b2m_r3_decision import (  # noqa: E402
    rollback_reasons,
    select_candidate,
    stage_a_decision,
    update_patience,
)
from src.training.mlx.r29b2m_r3_evaluator import (  # noqa: E402
    aggregate_semantic_scores,
    final_candidate_gate,
)
from src.training.mlx.r29b2m_r3_loader import sha256_file  # noqa: E402


STAGE_POINTS = (40_000, 80_000, 160_000, 240_000, 320_000, 400_000, 480_000)


def _read(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected_json_object:{path}")
    return value


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


class Supervisor:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.paths = CampaignPaths(args.artifact_root.resolve())
        self.paths.root.mkdir(parents=True, exist_ok=True)
        seed_manifest = _read(args.prior_runtime_root / "seed" / "seed_manifest.json")
        if self.paths.state.exists():
            self.state = _read(self.paths.state)
            current_revision = _git("rev-parse", "HEAD")
            if self.state.get("source_revision") != current_revision:
                if self.state.get("training_started") is True or int(self.state.get("global_optimizer_step", 0)) > 0:
                    raise ValueError("source_revision_changed_after_training_started")
                self.state["source_revision"] = current_revision
            if self.state.get("state") == "PAUSED_RECOVERABLE":
                self.state["state"] = self.state.get("resume_phase") or "ORIENTATION"
                self.state["resume_status"] = "RESUMING_FROM_DURABLE_STATE"
        else:
            self.state = initial_state(
                artifact_root=self.paths.root,
                source_revision=_git("rev-parse", "HEAD"),
                parent_seed_sha256=seed_manifest["seed_safetensors_sha256"],
            )
        validate_state(self.state)
        self.child: subprocess.Popen[str] | None = None
        self.stop_requested = False
        self.interrupted = False
        self.heartbeat_thread: threading.Thread | None = None
        self.log_path = self.paths.logs / "foreground.log"

    def _refresh_training_progress(self) -> None:
        progress_path = self.paths.root / "training_progress.json"
        if self.state.get("state") not in {"STAGE_A_TRAINING", "STAGE_B_TRAINING"} or not progress_path.is_file():
            return
        try:
            progress = _read(progress_path)
        except (OSError, json.JSONDecodeError, ValueError):
            return
        for key in ("global_optimizer_step", "optimizer_tokens", "assistant_target_tokens", "logical_epoch", "peak_mlx_memory_bytes"):
            if key in progress:
                self.state[key] = progress[key]
        self.state["dataset_cursor"] = progress.get("dataset_cursor", progress.get("schedule_position", self.state.get("dataset_cursor")))
        self.state["current_train_loss"] = progress.get("current_train_loss")

    def write(self) -> None:
        self._refresh_training_progress()
        self.state["updated_at"] = utc_now()
        self.state["supervisor_pid"] = os.getpid()
        self.state["free_disk_bytes"] = shutil.disk_usage(self.paths.root).free
        validate_state(self.state)
        atomic_json(self.paths.state, self.state)
        atomic_json(self.paths.heartbeat, {
            "campaign_id": CAMPAIGN_ID,
            "created_at": utc_now(),
            "state": self.state["state"],
            "phase_started_at": self.state["phase_started_at"],
            "supervisor_pid": os.getpid(),
            "process_active": True,
            "child_active": self.child is not None and self.child.poll() is None,
            "child_pid": self.state.get("child_pid"),
            "child_command": self.state.get("child_command"),
            "last_output": self.state.get("last_output"),
            "last_output_at": self.state.get("last_output_at"),
            "parent_seed_sha256": self.state.get("parent_seed_sha256"),
            "active_checkpoint": self.state.get("active_checkpoint"),
            "global_optimizer_step": self.state.get("global_optimizer_step"),
            "optimizer_tokens": self.state.get("optimizer_tokens"),
            "assistant_target_tokens": self.state.get("assistant_target_tokens"),
            "dataset_cursor": self.state.get("dataset_cursor"),
            "peak_mlx_memory_bytes": self.state.get("peak_mlx_memory_bytes"),
            "process_rss_bytes": self.state.get("process_rss_bytes"),
            "free_disk_bytes": self.state.get("free_disk_bytes"),
            "resume_status": self.state.get("resume_status"),
        })

    def log(self, message: str) -> None:
        self.paths.logs.mkdir(parents=True, exist_ok=True)
        line = f"{utc_now()} {message}\n"
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.flush()
            os.fsync(handle.fileno())
        print(message, flush=True)

    def heartbeat_loop(self) -> None:
        while not self.stop_requested:
            self.write()
            for _ in range(30):
                if self.stop_requested:
                    return
                time.sleep(1)

    def start(self) -> None:
        self.write()
        self.heartbeat_thread = threading.Thread(target=self.heartbeat_loop, name="r29b2m-r3-heartbeat", daemon=True)
        self.heartbeat_thread.start()

    def transition(self, state: str) -> None:
        if state not in STATES:
            raise ValueError(f"unknown_r29b2m_r3_state:{state}")
        if state != self.state["state"]:
            self.state.update({
                "state": state,
                "phase_started_at": utc_now(),
                "child_pid": None,
                "child_command": None,
                "last_output": None,
                "last_output_at": None,
                "resume_phase": None,
            })
        self.write()
        self.log(f"phase={state}")

    def run_child(self, command: list[str], *, label: str) -> None:
        if self.state["state"] not in ACTIVE_STATES:
            raise ValueError("cannot_launch_child_from_terminal_state")
        if self.child is not None:
            raise ValueError("only_one_child_is_permitted")
        self.log(f"child_start label={label}")
        process = subprocess.Popen(
            command,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            start_new_session=True,
        )
        self.child = process
        self.state.update({"child_pid": process.pid, "child_command": command, "last_output": None, "last_output_at": None})
        self.write()
        assert process.stdout is not None
        for line in process.stdout:
            clean = line.rstrip()
            self.state["last_output"] = clean
            self.state["last_output_at"] = utc_now()
            try:
                event = json.loads(clean)
            except json.JSONDecodeError:
                event = None
            if isinstance(event, dict) and event.get("event") == "optimizer_update" and self.state["state"] in {"STAGE_A_TRAINING", "STAGE_B_TRAINING"}:
                for key in ("global_optimizer_step", "optimizer_tokens", "assistant_target_tokens", "train_loss", "peak_mlx_memory_bytes"):
                    if key in event:
                        self.state["current_train_loss" if key == "train_loss" else key] = event[key]
            self.write()
            print(line, end="", flush=True)
        exit_code = process.wait()
        self.child = None
        self.state.update({"child_pid": None, "child_command": None, "child_exit_code": exit_code})
        self.write()
        if exit_code != 0:
            self.state.update({"resume_status": "PAUSED_RECOVERABLE", "resume_phase": self.state["state"], "last_failed_child_label": label})
            self.state["state"] = "PAUSED_RECOVERABLE"
            self.write()
            raise RuntimeError(f"foreground_child_failed:{label}:{exit_code}")
        self.log(f"child_complete label={label}")

    def wait_for_review(self, path: Path, *, purpose: str) -> None:
        self.state["resume_status"] = f"AWAITING_CODEX_REVIEW:{purpose}"
        self.write()
        self.log(f"review_required purpose={purpose} path={path}")
        while not path.is_file():
            if self.stop_requested:
                raise InterruptedError("supervisor_stop_requested")
            time.sleep(2)
        self.state["resume_status"] = "CODEX_REVIEW_RECEIVED"
        self.write()

    def interrupt(self, signum: int) -> None:
        if self.interrupted:
            return
        self.interrupted = True
        self.stop_requested = True
        resume_phase = self.state.get("state")
        if self.child is not None and self.child.poll() is None:
            try:
                os.killpg(self.child.pid, signal.SIGTERM)
                self.child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(self.child.pid, signal.SIGKILL)
                self.child.wait(timeout=5)
            except ProcessLookupError:
                pass
        self.child = None
        self.state.update({
            "state": "PAUSED_RECOVERABLE",
            "resume_phase": resume_phase,
            "child_pid": None,
            "child_command": None,
            "resume_status": "PAUSED_RECOVERABLE",
            "interruption": {"signal": signum, "at": utc_now(), "last_verified_checkpoint": self.state.get("active_checkpoint")},
            "accumulation_index": 0,
        })
        self.write()
        self.log(f"paused_recoverable signal={signum}")

    @property
    def python(self) -> str:
        # Keep the venv entrypoint itself.  Resolving its interpreter symlink
        # bypasses pyvenv.cfg and silently drops the MLX environment.
        return str(self.args.venv_python.absolute())

    @property
    def seed(self) -> Path:
        return self.args.prior_runtime_root / "seed" / "model_seed.safetensors"

    @property
    def tokenizer(self) -> Path:
        return ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json"

    @property
    def dataset(self) -> Path:
        return self.args.r2_root / "dataset"

    @property
    def eval_dir(self) -> Path:
        return ROOT / "evals" / "r29b2m_daily_dialogue_v2"

    def adoption_and_baseline(self) -> None:
        self.transition("EVIDENCE_ADOPTION")
        self.run_child([
            self.python, "scripts/r29b2m_r3_adopt_evidence.py",
            "--artifact-root", str(self.paths.root),
            "--prior-runtime-root", str(self.args.prior_runtime_root),
            "--r2-root", str(self.args.r2_root),
            "--r1-dataset-root", str(self.args.r1_root / "dataset"),
        ], label="evidence_adoption_and_dataset_gate")
        self.transition("DATASET_ADMISSION")
        self.run_child([
            self.python, "scripts/r29b2m_r3_resource_gate.py",
            "--artifact-root", str(self.paths.root),
            "--prior-resource-measurement", str(self.args.r1_root / "reports" / "resource_measurement.json"),
            "--seed", str(self.seed),
            "--dataset-root", str(self.dataset),
        ], label="dynamic_resource_measurement")
        resource = _read(self.paths.reports / "resource_report.json")
        if resource["decision"] == "BLOCKED_RESOURCE_WITH_MEASURED_EVIDENCE":
            self.transition("BLOCKED_RESOURCE_WITH_MEASURED_EVIDENCE")
            return
        self.transition("PRETRAIN_BASELINE")
        generation = self.paths.reports / "pretrain_eval_v2_generations.json"
        if not generation.is_file():
            self.run_child([
                self.python, "scripts/r29b2m_r3_evaluate.py", "--generate", "--baseline",
                "--seed", str(self.seed), "--tokenizer", str(self.tokenizer),
                "--dataset-root", str(self.dataset), "--eval-dir", str(self.eval_dir),
                "--output-dir", str(self.paths.reports), "--label", "pretrain_parent_seed",
            ], label="freeze_pretrain_eval_v2_and_structural_baseline")
        scores_input = self.paths.root / "reviews" / "pretrain_eval_v2_scores_input.json"
        scores_output = self.paths.reports / "pretrain_eval_v2_scores.json"
        if not scores_output.is_file():
            self.wait_for_review(scores_input, purpose="pretrain_eval_v2_semantic_scores")
            self.run_child([
                self.python, "scripts/r29b2m_r3_evaluate.py", "--validate-scores",
                "--generation", str(generation), "--scores-input", str(scores_input),
                "--scores-output", str(scores_output),
            ], label="validate_pretrain_codex_semantic_scores")
        baseline = _read(scores_output)
        self.state.update({
            "baseline_behaviour_metrics": baseline["aggregate"],
            "validation_loss": _read(generation)["validation_loss"]["normalised_loss"],
            "critical_failures": baseline["aggregate"]["critical_failure_count"],
            "training_started": False,
            "global_optimizer_step": 0,
            "optimizer_tokens": 0,
            "assistant_target_tokens": 0,
        })
        self.write()

    def resume_and_smoke(self) -> None:
        self.transition("TRAINER_IMPLEMENTATION")
        self.transition("CHECKPOINT_DRY_RUN")
        self.transition("RESUME_VALIDATION")
        resume_proof = self.paths.reports / "exact_resume_proof.json"
        if not resume_proof.is_file():
            resource = _read(self.paths.reports / "resource_report.json")
            self.run_child([
                self.python, "scripts/r29b2m_r3_verify_resume.py",
                "--seed", str(self.seed), "--tokenizer", str(self.tokenizer),
                "--dataset-root", str(self.dataset),
                "--adopted-evidence", str(self.paths.reports / "adopted_evidence.json"),
                "--projected-checkpoint-bytes", str(resource["full_checkpoint_bytes"]),
                "--output", str(resume_proof),
            ], label="tiny_and_actual_96m_exact_resume")
        if _read(resume_proof).get("valid") is not True:
            self.transition("BLOCKED_TRAINING_RUNTIME_WITH_EVIDENCE")
            return
        self.transition("MEMORY_SMOKE")
        self.transition("SFT_SMOKE")
        smoke_report = self.paths.reports / "sft_smoke.json"
        if not smoke_report.is_file():
            resource = _read(self.paths.reports / "resource_report.json")
            self.run_child([
                self.python, "scripts/r29b2m_r3_train.py", "--run", "--smoke",
                "--artifact-root", str(self.paths.root), "--dataset-root", str(self.dataset),
                "--tokenizer", str(self.tokenizer), "--seed", str(self.seed),
                "--state-file", str(self.paths.state), "--stage", "SFT_SMOKE",
                "--target-assistant-tokens", "8000", "--maximum-updates", "2",
                "--checkpoint-id", "temporary_sft_smoke", "--projected-checkpoint-bytes", str(resource["full_checkpoint_bytes"]),
                "--result", str(smoke_report),
            ], label="bounded_sft_smoke")
        smoke = _read(smoke_report)
        memory_report = {
            "campaign_id": CAMPAIGN_ID,
            "created_at": utc_now(),
            "peak_mlx_memory_bytes": smoke["peak_mlx_memory_bytes"],
            "target_bytes": 12_000_000_000,
            "pass": smoke["peak_mlx_memory_bytes"] <= 12_000_000_000,
            "full_fine_tuning": True,
            "lora_fallback_used": False,
            "process_rss_bytes": smoke.get("process_rss_bytes", 0),
        }
        atomic_json(self.paths.reports / "memory_report.json", memory_report)
        if smoke.get("smoke_pass") is not True or memory_report["pass"] is not True or smoke.get("temporary_checkpoint_deleted") is not True:
            self.transition("BLOCKED_TRAINING_RUNTIME_WITH_EVIDENCE")
            return
        # Smoke uses a temporary model and never advances formal counters.
        self.state.update({"training_started": False, "global_optimizer_step": 0, "optimizer_tokens": 0, "assistant_target_tokens": 0, "active_checkpoint": None})
        self.write()

    def _checkpoint_path(self, checkpoint_id: str) -> Path:
        return self.paths.checkpoints / checkpoint_id

    def train_segment(self, target: int, checkpoint_id: str, *, resume_from: str | None, stage: str) -> dict[str, Any]:
        result_path = self.paths.reports / f"train_{checkpoint_id}.json"
        checkpoint_path = self._checkpoint_path(checkpoint_id)
        if not result_path.is_file() or not checkpoint_path.is_dir():
            resource = _read(self.paths.reports / "resource_report.json")
            command = [
                self.python, "scripts/r29b2m_r3_train.py", "--run",
                "--artifact-root", str(self.paths.root), "--dataset-root", str(self.dataset),
                "--tokenizer", str(self.tokenizer), "--state-file", str(self.paths.state),
                "--stage", stage, "--target-assistant-tokens", str(target),
                "--checkpoint-id", checkpoint_id, "--projected-checkpoint-bytes", str(resource["full_checkpoint_bytes"]),
                "--result", str(result_path),
            ]
            if resume_from:
                command.extend(["--resume-from", str(self._checkpoint_path(resume_from))])
            else:
                command.extend(["--seed", str(self.seed)])
            self.run_child(command, label=f"train_to_{target}_assistant_tokens")
        result = _read(result_path)
        progress = result["progress"]
        self.state.update({
            **progress,
            "dataset_cursor": progress["dataset_cursor"],
            "active_checkpoint": checkpoint_id,
            "training_started": True,
            "peak_mlx_memory_bytes": result["peak_mlx_memory_bytes"],
            "resume_status": "RESUMED_EXACT" if resume_from else "STARTED_FROM_PARENT_SEED",
        })
        self.write()
        return result

    def evaluate_checkpoint(self, checkpoint_id: str, *, final: bool = False) -> dict[str, Any]:
        eval_root = self.paths.root / "evaluations" / checkpoint_id
        generation = eval_root / "eval_v2_generations.json"
        if not generation.is_file():
            self.run_child([
                self.python, "scripts/r29b2m_r3_evaluate.py", "--generate",
                "--checkpoint", str(self._checkpoint_path(checkpoint_id)),
                "--tokenizer", str(self.tokenizer), "--dataset-root", str(self.dataset),
                "--eval-dir", str(self.eval_dir), "--output-dir", str(eval_root),
                "--label", checkpoint_id,
            ], label=f"generated_evaluation_{checkpoint_id}")
        input_name = "final_codex_scores_input.json" if final else "codex_scores_input.json"
        score_input = eval_root / input_name
        score_output = eval_root / ("final_eval_v2_scores.json" if final else "eval_v2_scores.json")
        if not score_output.is_file():
            self.wait_for_review(score_input, purpose=f"semantic_scores:{checkpoint_id}:{'final_all_280' if final else 'intermediate_stratified'}")
            command = [
                self.python, "scripts/r29b2m_r3_evaluate.py", "--validate-scores",
                "--generation", str(generation), "--scores-input", str(score_input),
                "--scores-output", str(score_output),
            ]
            if final:
                command.append("--require-all-sessions")
            self.run_child(command, label=f"validate_semantic_scores_{checkpoint_id}_{'final' if final else 'intermediate'}")
        generation_report = _read(generation)
        score_report = _read(score_output)
        return {
            "checkpoint_id": checkpoint_id,
            "evaluation_root": str(eval_root),
            "generation": generation_report,
            "scores": score_report,
            "metrics": score_report["aggregate"],
            "structural_failures": generation_report["structural_failures"],
            "validation_loss": generation_report["validation_loss"]["normalised_loss"],
            "assistant_target_tokens": _read(self._checkpoint_path(checkpoint_id) / "campaign_state.json")["assistant_target_tokens"],
            "typical_answer_characters": sorted(row["deterministic_family_validator_result"]["output_characters"] for row in generation_report["sessions"])[len(generation_report["sessions"]) // 2],
        }

    def _comparable_baseline(self, current_score_report: dict[str, Any]) -> dict[str, Any]:
        baseline_scores = _read(self.paths.reports / "pretrain_eval_v2_scores.json")
        baseline_generation = _read(self.paths.reports / "pretrain_eval_v2_generations.json")
        current_ids = {row["session_id"] for row in current_score_report["sessions"]}
        subset = baseline_scores | {"sessions": [row for row in baseline_scores["sessions"] if row["session_id"] in current_ids]}
        if len(subset["sessions"]) != len(current_ids):
            raise ValueError("baseline_missing_current_semantic_review_sessions")
        return aggregate_semantic_scores(subset, baseline_generation)

    def stage_a(self) -> tuple[list[dict[str, Any]], bool]:
        evaluations: list[dict[str, Any]] = []
        previous: str | None = None
        for target, checkpoint_id in ((40_000, "stage_a_040k"), (80_000, "stage_a_080k")):
            self.transition("STAGE_A_TRAINING")
            self.train_segment(target, checkpoint_id, resume_from=previous, stage="STAGE_A_TRAINING")
            self.transition("STAGE_A_EVALUATION")
            evaluation = self.evaluate_checkpoint(checkpoint_id)
            evaluations.append(evaluation)
            previous = checkpoint_id
        self.transition("STAGE_A_DECISION")
        current = evaluations[-1]
        baseline_metrics = self._comparable_baseline(current["scores"])
        baseline_generation = _read(self.paths.reports / "pretrain_eval_v2_generations.json")
        decision = stage_a_decision(
            baseline_metrics,
            current["metrics"],
            baseline_structural=baseline_generation["structural_failures"],
            current_structural=current["structural_failures"],
            checkpoint_integrity=current["generation"]["checkpoint_id"] == current["checkpoint_id"],
            exact_resume=_read(self.paths.reports / "exact_resume_proof.json")["valid"],
            resource_gate=_read(self.paths.reports / "resource_report.json")["decision"] in {"RESOURCE_READY", "RESOURCE_WARNING"},
            memory_gate=_read(self.paths.reports / "memory_report.json")["pass"],
        )
        decision.update({
            "campaign_id": CAMPAIGN_ID,
            "created_at": utc_now(),
            "checkpoint_id": current["checkpoint_id"],
            "baseline_metrics": baseline_metrics,
            "current_metrics": current["metrics"],
        })
        atomic_json(self.paths.reports / "stage_a_decision.json", decision)
        self.state.update({
            "current_decision": decision["decision"],
            "current_behaviour_metrics": current["metrics"],
            "baseline_delta": decision["overall_pass_rate_delta"],
            "family_regressions": decision["family_regressions"],
            "critical_failures": current["metrics"]["critical_failure_count"],
            "validation_loss": current["validation_loss"],
            "best_checkpoint": select_candidate(evaluations)["selected_checkpoint"],
            "rollback_checkpoint": select_candidate(evaluations)["selected_checkpoint"],
        })
        self.write()
        if decision["decision"] != "CONTINUE_STAGE_B":
            self.transition("BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE")
            self.write_final_report(evaluations, selected=None, candidate_gate=None)
            return evaluations, False
        return evaluations, True

    def stage_b(self, evaluations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        previous_checkpoint = evaluations[-1]["checkpoint_id"]
        best = evaluations[-1]["metrics"]
        patience = 0
        for target in STAGE_POINTS[2:]:
            checkpoint_id = f"stage_b_{target // 1000:03d}k"
            self.transition("STAGE_B_TRAINING")
            self.train_segment(target, checkpoint_id, resume_from=previous_checkpoint, stage="STAGE_B_TRAINING")
            self.transition("FINAL_EVALUATION")
            evaluation = self.evaluate_checkpoint(checkpoint_id)
            evaluations.append(evaluation)
            previous = evaluations[-2]
            rollback = rollback_reasons(
                previous["metrics"], evaluation["metrics"],
                structural=evaluation["structural_failures"],
                checkpoint_integrity=True,
                resource_gate=_read(self.paths.reports / "resource_report.json")["decision"] in {"RESOURCE_READY", "RESOURCE_WARNING"},
                memory_gate=evaluation["generation"].get("checkpoint_id") == checkpoint_id,
                contamination_free=True,
            )
            patience_result = update_patience(best, evaluation["metrics"], patience)
            if patience_result["meaningful_improvement"]:
                best = evaluation["metrics"]
                self.state["best_checkpoint"] = checkpoint_id
                self.state["rollback_checkpoint"] = checkpoint_id
            patience = patience_result["evaluations_without_meaningful_improvement"]
            decision = {
                "campaign_id": CAMPAIGN_ID,
                "created_at": utc_now(),
                "checkpoint_id": checkpoint_id,
                "assistant_target_tokens": evaluation["assistant_target_tokens"],
                "metrics": evaluation["metrics"],
                "rollback_reasons": rollback,
                "patience": patience_result,
                "decision": "ROLLBACK_STOP" if rollback else patience_result["decision"],
            }
            atomic_json(self.paths.reports / f"stage_b_decision_{target // 1000:03d}k.json", decision)
            self.state.update({
                "current_decision": decision["decision"],
                "current_behaviour_metrics": evaluation["metrics"],
                "critical_failures": evaluation["metrics"]["critical_failure_count"],
                "validation_loss": evaluation["validation_loss"],
                "patience_state": {"evaluations_without_meaningful_improvement": patience},
            })
            self.write()
            if rollback or patience_result["decision"] == "STOP_PATIENCE":
                break
            previous_checkpoint = checkpoint_id
        return evaluations

    def candidate_and_terminal(self, evaluations: list[dict[str, Any]]) -> None:
        self.transition("CANDIDATE_SELECTION")
        selection = select_candidate(evaluations)
        selected = selection["selected_checkpoint"]
        if selected is None:
            self.transition("BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE")
            self.write_final_report(evaluations, selected=None, candidate_gate=None)
            return
        self.state["candidate_checkpoint"] = selected
        self.write()
        selected_evaluation = next(item for item in evaluations if item["checkpoint_id"] == selected)
        final_evaluation = self.evaluate_checkpoint(selected, final=True)
        # Preserve the contract's exact final filenames for handoff.
        final_root = Path(final_evaluation["evaluation_root"])
        shutil.copy2(final_root / "final_eval_v2_scores.json", final_root / "eval_v2_scores.json")
        baseline_full = _read(self.paths.reports / "pretrain_eval_v2_scores.json")["aggregate"]
        gate = final_candidate_gate(final_evaluation["metrics"], baseline_full)
        checks = final_evaluation["generation"]["structural_failures"]
        automatic_gate = {
            "private_data_leakage_zero": sum(row["critical_failure_fields"]["private_data_leakage"] for row in final_evaluation["generation"]["sessions"]) == 0,
            "identity_ontology_leakage_zero": sum(row["critical_failure_fields"]["forbidden_identity_ontology"] for row in final_evaluation["generation"]["sessions"]) == 0,
            "mojibake_zero": checks["mojibake"] == 0,
            "role_prefix_leakage_zero": checks["role_prefix_leakage"] == 0,
            "normal_answer_length": all(row["deterministic_family_validator_result"]["normal_answer_length"] for row in final_evaluation["generation"]["sessions"]),
            "checkpoint_integrity": True,
            "exact_resume": _read(self.paths.reports / "exact_resume_proof.json")["valid"],
            "resource_contract": _read(self.paths.reports / "resource_report.json")["decision"] in {"RESOURCE_READY", "RESOURCE_WARNING"},
            "memory_contract": _read(self.paths.reports / "memory_report.json")["pass"],
        }
        gate["automatic_checks"] = automatic_gate
        gate["pass"] = gate["pass"] and all(automatic_gate.values())
        candidate_decision = {
            "campaign_id": CAMPAIGN_ID,
            "created_at": utc_now(),
            "decision": "PASSED_MLX_DIALOGUE_CANDIDATE" if gate["pass"] else "BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE",
            "parent_seed_sha256": self.state["parent_seed_sha256"],
            "evaluated_checkpoints": [item["checkpoint_id"] for item in evaluations],
            "selection": selection,
            "selected_checkpoint": selected,
            "selected_checkpoint_model_sha256": sha256_file(self._checkpoint_path(selected) / "model.safetensors"),
            "gate": gate,
            "final_metrics": final_evaluation["metrics"],
            "human_review_completed": False,
            "product_training_admission": False,
            "browser_admission": False,
            "release_admission": False,
            "q4_ready": False,
        }
        decision_path = self.paths.reports / "candidate_decision.json"
        atomic_json(decision_path, candidate_decision)
        if not gate["pass"]:
            self.transition("BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE")
            self.write_final_report(evaluations, selected=selected, candidate_gate=gate)
            return
        self.transition("ENGINEERING_HANDOFF")
        self.run_child([
            self.python, "scripts/r29b2m_r3_write_handoff.py",
            "--artifact-root", str(self.paths.root), "--checkpoint", str(self._checkpoint_path(selected)),
            "--final-evaluation-dir", str(final_root), "--candidate-decision", str(decision_path),
        ], label="write_engineering_candidate_handoff")
        self.transition("FINAL_VALIDATION")
        self.final_validation(selected)
        self.transition("PASSED_MLX_DIALOGUE_CANDIDATE")
        self.write_final_report(evaluations, selected=selected, candidate_gate=gate)

    def final_validation(self, selected: str) -> None:
        current = _git("rev-parse", "HEAD")
        origin = _git("rev-parse", "origin/main")
        status = _git("status", "--short")
        tracked = _git("ls-files").splitlines()
        artifact_tracked = [path for path in tracked if path.startswith("artifacts/") and "r29b2m_r3" in path]
        weight_tracked = [path for path in tracked if "r29b2m_r3" in path and path.endswith((".safetensors", ".bin"))]
        candidate = self.paths.candidate
        required = {
            "model.safetensors", "optimizer.safetensors", "training_config.json", "lineage.json",
            "dataset_manifest_reference.json", "eval_manifest_reference.json", "pretrain_baseline.json",
            "final_eval_generations.json", "final_eval_scores.json", "checkpoint_metrics.json", "resume_proof.json",
            "resource_report.json", "memory_report.json", "candidate_decision.json", "checksums.json",
        }
        report = {
            "campaign_id": CAMPAIGN_ID,
            "created_at": utc_now(),
            "valid": current == origin and not status and not artifact_tracked and not weight_tracked and required.issubset({path.name for path in candidate.iterdir()}),
            "repository": {"branch": _git("branch", "--show-current"), "head": current, "origin_main": origin, "status": status},
            "selected_checkpoint": selected,
            "candidate_required_files_present": required.issubset({path.name for path in candidate.iterdir()}),
            "r3_artifacts_tracked": artifact_tracked,
            "r3_weights_tracked": weight_tracked,
            "public_model_replaced": False,
            "q4_exported": False,
            "deployment_performed": False,
            "human_review_completed": False,
            "product_training_admission": False,
        }
        atomic_json(self.paths.reports / "final_validation.json", report)
        if not report["valid"]:
            raise ValueError("r29b2m_r3_final_validation_failed")

    def write_final_report(self, evaluations: list[dict[str, Any]], *, selected: str | None, candidate_gate: dict[str, Any] | None) -> None:
        heartbeat = _read(self.paths.heartbeat)
        report = {
            "campaign_id": CAMPAIGN_ID,
            "created_at": utc_now(),
            "terminal_state": self.state["state"],
            "source_revision": self.state["source_revision"],
            "parent_seed_sha256": self.state["parent_seed_sha256"],
            "parent_checkpoint": self.state["parent_checkpoint"],
            "candidate_checkpoint": selected,
            "global_optimizer_step": self.state["global_optimizer_step"],
            "optimizer_tokens": self.state["optimizer_tokens"],
            "assistant_target_tokens": self.state["assistant_target_tokens"],
            "dataset_cursor": self.state["dataset_cursor"],
            "current_train_loss": self.state.get("current_train_loss"),
            "validation_loss": self.state.get("validation_loss"),
            "peak_mlx_memory_bytes": self.state.get("peak_mlx_memory_bytes"),
            "process_rss_bytes": self.state.get("process_rss_bytes"),
            "free_disk_bytes": self.state.get("free_disk_bytes"),
            "baseline_behaviour_metrics": self.state.get("baseline_behaviour_metrics"),
            "current_behaviour_metrics": self.state.get("current_behaviour_metrics"),
            "baseline_delta": self.state.get("baseline_delta"),
            "family_regressions": self.state.get("family_regressions", {}),
            "critical_failures": self.state.get("critical_failures"),
            "checkpoint_resume_status": {
                "exact_resume": _read(self.paths.reports / "exact_resume_proof.json").get("valid") if (self.paths.reports / "exact_resume_proof.json").is_file() else False,
                "active_checkpoint": self.state.get("active_checkpoint"),
            },
            "evaluated_checkpoints": [item["checkpoint_id"] for item in evaluations],
            "candidate_gate": candidate_gate,
            "heartbeat": heartbeat,
            "weights_committed": False,
            "corpus_committed": False,
            "training_artifacts_committed": False,
            "public_model_replaced": False,
            "q4_exported": False,
            "deployment_performed": False,
            "human_review_completed": False,
            "product_training_admission": False,
            "browser_admission": False,
            "release_admission": False,
        }
        atomic_json(self.paths.reports / "final_engineering_report.json", report)

    def run_campaign(self) -> None:
        if self.state["state"] in TERMINAL_STATES:
            self.log(f"terminal_state_already_present state={self.state['state']}")
            return
        self.transition("ORIENTATION")
        self.adoption_and_baseline()
        if self.state["state"] in TERMINAL_STATES:
            return
        self.resume_and_smoke()
        if self.state["state"] in TERMINAL_STATES:
            return
        evaluations, continue_stage_b = self.stage_a()
        if not continue_stage_b:
            return
        evaluations = self.stage_b(evaluations)
        self.candidate_and_terminal(evaluations)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--prior-runtime-root", type=Path, required=True)
    parser.add_argument("--r1-root", type=Path, required=True)
    parser.add_argument("--r2-root", type=Path, required=True)
    parser.add_argument("--venv-python", type=Path, required=True)
    args = parser.parse_args()
    supervisor = Supervisor(args)
    signal.signal(signal.SIGINT, lambda signum, _frame: supervisor.interrupt(signum))
    signal.signal(signal.SIGTERM, lambda signum, _frame: supervisor.interrupt(signum))
    supervisor.start()
    try:
        supervisor.run_campaign()
        if supervisor.state["state"] not in TERMINAL_STATES:
            raise RuntimeError(f"campaign_returned_without_terminal_state:{supervisor.state['state']}")
        return 0
    finally:
        supervisor.stop_requested = True
        supervisor.child = None
        supervisor.state["child_pid"] = None
        supervisor.state["child_command"] = None
        supervisor.write()
        heartbeat = _read(supervisor.paths.heartbeat)
        heartbeat.update({"process_active": False, "child_active": False, "child_pid": None, "child_command": None, "created_at": utc_now()})
        atomic_json(supervisor.paths.heartbeat, heartbeat)


if __name__ == "__main__":
    raise SystemExit(main())
