#!/usr/bin/env python3
"""Blocking foreground supervisor for the R29B2M-R4H simulation campaign."""

from __future__ import annotations

import argparse
import json
import os
import re
import selectors
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CAMPAIGN_ID = "r29b2m_r4h_hybrid_signal_simulation_v1"
TERMINAL_STATES = {
    "PASSED_HYBRID_CHAIN_SIMULATION", "SIMULATION_READY_LIVE_API_NOT_RUN",
    "BLOCKED_ORCHESTRATION_CORRECTNESS", "BLOCKED_HYBRID_VALUE",
    "BLOCKED_LATENCY_SLO", "ABORTED_SAFELY",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def default_artifact_root() -> Path:
    return Path.home() / "Desktop" / "another_brain_train_r29a0" / "artifacts" / "r29b2m_r4h"


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Supervisor:
    def __init__(self, repo: Path, artifact_root: Path, browser_port: int) -> None:
        self.repo = repo.resolve()
        self.artifact_root = artifact_root.expanduser().resolve()
        self.browser_port = browser_port
        self.state_path = self.artifact_root / "campaign_state.json"
        self.heartbeat_path = self.artifact_root / "heartbeat_latest.json"
        self.log_path = self.artifact_root / "logs" / "foreground.log"
        self.lock = threading.RLock()
        self.stop_heartbeat = threading.Event()
        self.interrupted = threading.Event()
        self.child: subprocess.Popen[str] | None = None
        self.last_heartbeat_at: str | None = None
        self.state = self._initial_state()
        self._load_resume_state()

    def _initial_state(self) -> dict[str, Any]:
        now = utc_now()
        return {
            "campaign_id": CAMPAIGN_ID,
            "state": "ORIENTATION",
            "phase_started_at": now,
            "updated_at": now,
            "terminal_at": None,
            "terminal_reason": None,
            "supervisor_pid": os.getpid(),
            "child_pid": None,
            "child_command": None,
            "child_exit_code": None,
            "last_output": None,
            "last_output_at": None,
            "simulation_mode": "oracle_and_deterministic_mock",
            "simulation_only": True,
            "DeepSeek_adapter_type": "mock_deepseek_sse",
            "DeepSeek_API_key_present": bool(os.environ.get("DEEPSEEK_API_KEY")),
            "completed_request_count": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "current_latency_metrics": None,
            "live_spending_guard_status": {"active": False, "request_limit": 100, "input_token_limit": 400000, "output_token_limit": 40000, "concurrency_limit": 2, "requests": 0},
            "parent_checkpoint": "r28m1_q4_recovered_mlx_seed",
            "R3_diagnostic_checkpoint": "stage_a_080k",
            "candidate_checkpoint": None,
            "actual_efish_signal_model_trained": False,
            "actual_browser_signal_inference": False,
            "oracle_packet_used": True,
            "training_started": False,
            "optimizer_tokens": 0,
            "assistant_target_tokens": 0,
            "weights_committed": False,
            "corpus_committed": False,
            "q4_exported": False,
            "public_model_replaced": False,
            "production_UI_modified": False,
            "production_API_route_added": False,
            "deployment_performed": False,
            "resume_count": 0,
        }

    def _load_resume_state(self) -> None:
        if not self.state_path.is_file():
            return
        try:
            prior = json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        if prior.get("campaign_id") != CAMPAIGN_ID:
            return
        self.state.update(prior)
        self.state["supervisor_pid"] = os.getpid()
        self.state["child_pid"] = None
        self.state["child_command"] = None
        self.state["child_exit_code"] = None
        self.state["resume_count"] = int(prior.get("resume_count", 0)) + 1

    @staticmethod
    def _safe_output(value: str) -> str:
        value = re.sub(r"Bearer\s+[A-Za-z0-9._~+/-]+", "Bearer [REDACTED]", value, flags=re.I)
        value = re.sub(r"(?:api[ _-]?key|authorization)\s*[:=]\s*[^\s,;]+", "[REDACTED_SECRET_REFERENCE]", value, flags=re.I)
        return value.rstrip()[-1000:]

    def _write(self) -> None:
        with self.lock:
            self.state["updated_at"] = utc_now()
            atomic_json(self.state_path, self.state)

    def transition(self, state: str, reason: str | None = None) -> None:
        with self.lock:
            if self.state.get("state") != state:
                self.state["state"] = state
                self.state["phase_started_at"] = utc_now()
            if state in TERMINAL_STATES:
                self.state["terminal_at"] = utc_now()
                self.state["terminal_reason"] = reason
            self._write()

    def heartbeat(self) -> None:
        while not self.stop_heartbeat.wait(30):
            self.write_heartbeat()

    def write_heartbeat(self) -> None:
        with self.lock:
            self.last_heartbeat_at = utc_now()
            usage = shutil.disk_usage(self.artifact_root if self.artifact_root.exists() else self.artifact_root.parent)
            heartbeat = {
                **self.state,
                "heartbeat_at": self.last_heartbeat_at,
                "process_active": True,
                "disk_free_bytes": usage.free,
                "phase_started_at": self.state["phase_started_at"],
            }
            atomic_json(self.heartbeat_path, heartbeat)
            self._write()

    def _append_log(self, line: str) -> None:
        safe = self._safe_output(line)
        if not safe:
            return
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(f"{utc_now()} {safe}\n")
        with self.lock:
            self.state["last_output"] = safe
            self.state["last_output_at"] = utc_now()

    def kill_child_group(self) -> None:
        child = self.child
        if child is None or child.poll() is not None:
            return
        try:
            os.killpg(child.pid, signal.SIGTERM)
            child.wait(timeout=5)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    def run_child(self, label: str, command: list[str]) -> int:
        if self.child is not None and self.child.poll() is None:
            raise RuntimeError("only_one_child_is_allowed")
        shown = [label, *[Path(item).name if item.startswith(str(Path.home())) else item for item in command[1:]]]
        with self.lock:
            self.state["child_command"] = shown
            self.state["child_exit_code"] = None
            self._write()
        self.child = subprocess.Popen(command, cwd=self.repo, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, start_new_session=True)
        with self.lock:
            self.state["child_pid"] = self.child.pid
            self._write()
        assert self.child.stdout is not None
        for line in self.child.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            self._append_log(line)
            if self.interrupted.is_set():
                self.kill_child_group()
                break
        code = self.child.wait()
        with self.lock:
            self.state["child_exit_code"] = code
            self.state["child_pid"] = None
            self.state["child_command"] = None
            self._write()
        self.child = None
        return code

    def serve_browser_lab_until_reviewed(self) -> int:
        review = self.artifact_root / "reports" / "browser_lab_review.json"
        if review.is_file():
            return 0
        command = [sys.executable, "-m", "http.server", str(self.browser_port), "--bind", "127.0.0.1", "--directory", str(self.artifact_root / "browser_lab")]
        self.child = subprocess.Popen(command, cwd=self.repo, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, start_new_session=True)
        with self.lock:
            self.state["child_pid"] = self.child.pid
            self.state["child_command"] = ["isolated_browser_lab_server", "127.0.0.1", str(self.browser_port)]
            self._write()
        selector = selectors.DefaultSelector()
        assert self.child.stdout is not None
        selector.register(self.child.stdout, selectors.EVENT_READ)
        print(json.dumps({"state": "BROWSER_LAB", "URL": f"http://127.0.0.1:{self.browser_port}/", "waiting_for": "reports/browser_lab_review.json"}), flush=True)
        while not self.interrupted.is_set() and not review.is_file():
            if self.child.poll() is not None:
                return int(self.child.returncode or 1)
            for key, _ in selector.select(timeout=1):
                line = key.fileobj.readline()
                if line:
                    self._append_log(line)
        self.kill_child_group()
        code = self.child.wait()
        with self.lock:
            self.state["child_exit_code"] = code
            self.state["child_pid"] = None
            self.state["child_command"] = None
            self._write()
        self.child = None
        return 0 if review.is_file() else 130

    def update_offline_metrics(self) -> None:
        path = self.artifact_root / "reports" / "offline_simulation.json"
        if not path.is_file():
            return
        report = json.loads(path.read_text(encoding="utf-8"))
        with self.lock:
            self.state["completed_request_count"] = report.get("request_count", 0)
            self.state["total_input_tokens"] = report.get("input_tokens", 0)
            self.state["total_output_tokens"] = report.get("output_tokens", 0)
            self.state["current_latency_metrics"] = report.get("latency_profiles")
            self._write()

    def run(self) -> int:
        if self.state.get("state") in TERMINAL_STATES:
            print(json.dumps({"state": self.state["state"], "resumed_terminal": True}))
            return 0
        self.artifact_root.mkdir(parents=True, exist_ok=True)
        heartbeat_thread = threading.Thread(target=self.heartbeat, name="r4h-heartbeat", daemon=True)
        heartbeat_thread.start()
        self.write_heartbeat()
        try:
            self.transition("EVIDENCE_ADOPTION")
            if self.run_child("adopt_evidence", [sys.executable, "scripts/r29b2m_r4h_adopt_evidence.py", "--repo", str(self.repo), "--artifact-root", str(self.artifact_root)]) != 0:
                return self.blocked("evidence_adoption_failed")
            self.transition("PRODUCT_CONTRACT")
            self.transition("SIGNAL_SCHEMA")
            self.transition("EMOTIONAL_GRAMMAR")
            self.transition("ORACLE_EVAL_AUDIT")
            self.transition("SIGNAL_PROVIDER_IMPLEMENTATION")
            self.transition("PROMPT_COMPILER")
            self.transition("MOCK_DEEPSEEK_ADAPTER")
            self.transition("HYBRID_ORCHESTRATOR")
            self.transition("OFFLINE_SIMULATION")
            if self.run_child("offline_simulation", ["node", "--experimental-strip-types", "scripts/r29b2m_r4h_run_offline_simulation.mjs", "--artifact-root", str(self.artifact_root)]) != 0:
                return self.blocked("offline_simulation_failed")
            self.update_offline_metrics()
            self.transition("BROWSER_LAB")
            if self.run_child("build_browser_lab", ["node", "scripts/r29b2m_r4h_build_lab.mjs", "--artifact-root", str(self.artifact_root)]) != 0:
                return self.blocked("browser_lab_build_failed")
            if self.serve_browser_lab_until_reviewed() != 0:
                if self.interrupted.is_set():
                    return self.paused()
                return self.blocked("browser_lab_server_or_review_failed")
            self.transition("LIVE_API_READINESS")
            if os.environ.get("DEEPSEEK_API_KEY"):
                return self.blocked("live_API_key_present_but_bounded_probe_requires_human_review_path", state="ABORTED_SAFELY")
            self.transition("LATENCY_EVALUATION")
            self.transition("HYBRID_VALUE_DECISION")
            self.transition("SIGNAL_TRAINING_CONTRACT")
            self.transition("FINAL_VALIDATION")
            commands = self.validation_commands()
            command_results = []
            for label, command in commands:
                code = self.run_child(label, command)
                command_results.append({"label": label, "exit_code": code})
            validation = {
                "campaign_id": CAMPAIGN_ID,
                "created_at": utc_now(),
                "commands": command_results,
                "passed": len(command_results) == len(commands) and all(item["exit_code"] == 0 for item in command_results),
                "weights_or_corpus_committed": False,
                "production_UI_modified": False,
                "deployment_performed": False,
            }
            atomic_json(self.artifact_root / "reports" / "final_validation.json", validation)
            finalize_code = self.run_child("finalize_simulation", ["node", "--experimental-strip-types", "scripts/r29b2m_r4h_finalize_simulation.mjs", "--artifact-root", str(self.artifact_root)])
            if not validation["passed"]:
                return self.blocked("final_validation_failed", state="ABORTED_SAFELY")
            if finalize_code != 0:
                return self.blocked("final_report_generation_failed")
            self.transition("SIMULATION_READY_LIVE_API_NOT_RUN", "offline_and_real_browser_passed_live_key_absent")
            return 0
        except BaseException as error:
            if self.interrupted.is_set() or isinstance(error, KeyboardInterrupt):
                return self.paused()
            self._append_log(f"supervisor_error:{type(error).__name__}:{error}")
            return self.blocked("unexpected_supervisor_failure", state="ABORTED_SAFELY")
        finally:
            self.kill_child_group()
            self.stop_heartbeat.set()
            heartbeat_thread.join(timeout=2)
            with self.lock:
                heartbeat = {**self.state, "heartbeat_at": utc_now(), "process_active": False, "child_pid": None, "child_command": None}
                atomic_json(self.heartbeat_path, heartbeat)
                self._write()

    def validation_commands(self) -> list[tuple[str, list[str]]]:
        venv_python = Path.home() / "Desktop" / "another_brain_train_r29a0" / ".venvs" / "r29b2m-mlx-py312" / "bin" / "python"
        r3_python = str(venv_python if venv_python.is_file() else Path(sys.executable))
        return [
            ("R4H_tests", [sys.executable, "-m", "unittest", "discover", "-s", "tests/r29b2m_r4h", "-q"]),
            ("R2_relevant_tests", [sys.executable, "-m", "unittest", "discover", "-s", "tests/r29b2m_r2", "-q"]),
            ("R3_relevant_tests", [r3_python, "-m", "pytest", "-q", "tests/r29b2m_r3"]),
            ("browser_q4_integer_parity", [r3_python, "-m", "pytest", "-q", "tests/r29b2m/test_q4_encoding_parity.py"]),
            ("browser_regression", ["npm", "run", "test:r28hotfix4"]),
            ("static_only", ["npm", "run", "check:r27b0-static-only"]),
            ("R4H_no_backend_production_diff_gate", ["node", "scripts/r29b2m_r4h_no_backend_production_gate.mjs"]),
            ("no_backend_LLM_production_gate", ["npm", "run", "check:no-backend-llm"]),
            ("no_eval_hardcoding", ["npm", "run", "check:no-eval-hardcoding"]),
            ("no_unapproved_weight_baseline", ["npm", "run", "check:no-unapproved-model-weights"]),
            ("git_diff_check", ["git", "diff", "--check"]),
            ("repository_stage_secret_path_production_audit", ["node", "scripts/r29b2m_r4h_repo_audit.mjs"]),
        ]

    def blocked(self, reason: str, state: str = "BLOCKED_ORCHESTRATION_CORRECTNESS") -> int:
        self.transition(state, reason)
        return 1

    def paused(self) -> int:
        self.transition("PAUSED_RECOVERABLE")
        return 130


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--artifact-root", type=Path, default=default_artifact_root())
    parser.add_argument("--browser-port", type=int, default=41738)
    args = parser.parse_args()
    supervisor = Supervisor(args.repo, args.artifact_root, args.browser_port)

    def stop(_signum: int, _frame: object) -> None:
        supervisor.interrupted.set()
        supervisor.kill_child_group()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    return supervisor.run()


if __name__ == "__main__":
    raise SystemExit(main())
