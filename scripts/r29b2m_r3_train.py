#!/usr/bin/env python3
"""Bounded R3 training segment and independent checkpoint verifier."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_daily_eval import frozen_sessions  # noqa: E402
from src.training.mlx.r29b2m_r3_campaign import CAMPAIGN_ID, atomic_json, utc_now  # noqa: E402
from src.training.mlx.r29b2m_r3_checkpoint import CheckpointManager, verify_checkpoint_contents  # noqa: E402
from src.training.mlx.r29b2m_r3_evaluator import generate_session  # noqa: E402
from src.training.mlx.r29b2m_r3_loader import load_admitted_dataset, sha256_file  # noqa: E402
from src.training.mlx.r29b2m_r3_optimizer import OPTIMIZER_CONFIG, mask_sha256  # noqa: E402
from src.training.mlx.r29b2m_r3_trainer import R29B2MTrainer  # noqa: E402
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer, wrapper_for_messages  # noqa: E402


def _read(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected_json_object:{path}")
    return value


def _lineage(args: argparse.Namespace, dataset_manifest_sha: str, adopted: dict[str, Any], *, created_from: str | None, start_kind: str) -> dict[str, Any]:
    return {
        "parent_seed_kind": "r28m1_q4_recovered_seed",
        "parent_seed_sha256": adopted["parent_seed"]["sha256"],
        "source_fp32_checkpoint_loaded": False,
        "source_checkpoint_parity_claim": False,
        "architecture_fingerprint": adopted["architecture_fingerprint"],
        "tokenizer_sha256": adopted["repository_hashes"]["tokenizer"],
        "dataset_manifest_sha256": dataset_manifest_sha,
        "eval_v2_manifest_sha256": adopted["repository_hashes"]["eval_v2_manifest"],
        "eval_v2_sessions_sha256": adopted["repository_hashes"]["eval_v2_sessions"],
        "scenario_schema_sha256": adopted["repository_hashes"]["scenario_schema"],
        "validator_sha256": adopted["repository_hashes"]["validator_source"],
        "optimizer_configuration": OPTIMIZER_CONFIG,
        "created_from_checkpoint_id": created_from,
        "training_start_kind": start_kind,
        "warm_start": False,
    }


def verify_mode(args: argparse.Namespace) -> int:
    input_ids = [int(value) for value in args.generation_input_ids.split(",") if value] if args.generation_input_ids else None
    result = verify_checkpoint_contents(args.verify_checkpoint.resolve(), generation_input_ids=input_ids)
    result["independent_process"] = True
    print(json.dumps(result, sort_keys=True), flush=True)
    return 0


def _smoke_generations(trainer: R29B2MTrainer, tokenizer: ExactRuntimeTokenizer) -> dict[str, Any]:
    sessions = frozen_sessions()[::6]
    rows: list[dict[str, Any]] = []
    for session in sessions:
        adapted = session | {
            "expected_action": session.get("question_type"),
            "maximum_answer_length": 96,
            "active_constraints": session.get("explicit_constraints", []),
            "correction_truth": session.get("correction_event"),
            "referent_truth": session.get("referent"),
        }
        rows.append(generate_session(trainer.model, tokenizer, adapted))
    structural_keys = ("mojibake", "role_prefix_leakage", "repeated_output", "repeated_ngram")
    failures = {key: sum(bool(row["deterministic_family_validator_result"][key]) for row in rows) for key in structural_keys}
    systematic = any(value > max(2, len(rows) // 4) for value in failures.values())
    return {"session_count": len(rows), "failure_counts": failures, "systematic_structural_collapse": systematic, "sessions": rows}


def train_mode(args: argparse.Namespace) -> int:
    import mlx.core as mx

    artifact_root = args.artifact_root.resolve()
    dataset = load_admitted_dataset(args.dataset_root.resolve())
    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer.resolve())
    adopted = _read(artifact_root / "reports" / "adopted_evidence.json")
    if args.resume_from:
        trainer = R29B2MTrainer.from_checkpoint(checkpoint_dir=args.resume_from.resolve(), tokenizer=tokenizer, dataset=dataset, artifact_root=artifact_root)
        created_from = args.resume_from.name
        start_kind = "state_exact_resume"
    else:
        trainer = R29B2MTrainer.from_seed(seed_path=args.seed.resolve(), tokenizer=tokenizer, dataset=dataset, artifact_root=artifact_root)
        created_from = None
        start_kind = "new_campaign_from_q4_recovered_seed"
    if args.maximum_updates is not None and args.maximum_updates <= 0:
        raise ValueError("maximum_updates_must_be_positive")
    updates: list[dict[str, Any]] = []
    while trainer.progress.assistant_target_tokens < args.target_assistant_tokens:
        if args.maximum_updates is not None and len(updates) >= args.maximum_updates:
            break
        update = trainer.train_one_update()
        updates.append(update)
        atomic_json(artifact_root / "training_progress.json", {
            "campaign_id": CAMPAIGN_ID,
            "updated_at": utc_now(),
            **trainer.progress.state_fields(),
            "peak_mlx_memory_bytes": int(mx.get_peak_memory()),
            "last_update": update,
        })
        print(json.dumps({"event": "optimizer_update", "global_optimizer_step": trainer.progress.global_optimizer_step, "assistant_target_tokens": trainer.progress.assistant_target_tokens, "optimizer_tokens": trainer.progress.optimizer_tokens, "train_loss": trainer.progress.current_train_loss, "peak_mlx_memory_bytes": int(mx.get_peak_memory())}, sort_keys=True), flush=True)
    if not updates:
        raise ValueError("training_segment_executed_no_updates")
    base_state = _read(args.state_file.resolve())
    state = trainer.campaign_state_snapshot(base_state) | {
        "state": args.stage,
        "active_checkpoint": args.checkpoint_id,
        "resume_status": "RESUMED_EXACT" if args.resume_from else "STARTED_FROM_PARENT_SEED",
    }
    cursor = trainer.cursor_state()
    generation_wrapper = wrapper_for_messages([{"role": "user", "content": "你好。"}])
    generation_input_ids = tokenizer.encode(generation_wrapper, max_tokens=256, add_bos=True)
    manager_root = artifact_root / ("smoke" if args.smoke else "checkpoints")
    manager = CheckpointManager(manager_root)
    lineage = _lineage(args, dataset.manifest_sha256, adopted, created_from=created_from, start_kind=start_kind)
    metrics = {
        "stage": args.stage,
        "segment_update_count": len(updates),
        "last_update": updates[-1],
        "best_metrics": base_state.get("best_behaviour_metrics"),
        "patience_state": base_state.get("patience_state", {"evaluations_without_meaningful_improvement": 0}),
        "current_decision": base_state.get("current_decision"),
        "mask_sha256_before": trainer.mask_sha_before,
        "mask_sha256_after": mask_sha256(trainer.model),
    }
    verifier = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--verify-checkpoint",
        "{checkpoint}",
        "--generation-input-ids",
        ",".join(str(value) for value in generation_input_ids),
    ]
    checkpoint_path, verification = manager.save(
        args.checkpoint_id,
        model=trainer.model,
        optimizer=trainer.optimizer,
        campaign_state=state,
        data_cursor=cursor,
        metrics=metrics,
        lineage=lineage,
        projected_checkpoint_bytes=args.projected_checkpoint_bytes,
        verifier_command=verifier,
        generation_input_ids=generation_input_ids,
        protected_checkpoint_ids={value for value in (base_state.get("candidate_checkpoint"), base_state.get("rollback_checkpoint"), created_from) if value},
    )
    result = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "stage": args.stage,
        "checkpoint_id": args.checkpoint_id,
        "checkpoint_path": str(checkpoint_path),
        "checkpoint_verification": verification,
        "progress": trainer.progress.state_fields(),
        "parameter_tree": trainer.parameter_report,
        "mask_sha256_before": trainer.mask_sha_before,
        "mask_sha256_after": mask_sha256(trainer.model),
        "peak_mlx_memory_bytes": int(mx.get_peak_memory()),
        "training_updates_executed": len(updates),
        "optimizer_state_finite": True,
        "strict_load": True,
        "warm_start": False,
    }
    if args.smoke:
        if trainer.progress.assistant_target_tokens > 8_000:
            raise ValueError("sft_smoke_target_token_cap_exceeded")
        generation = _smoke_generations(trainer, tokenizer)
        result.update({
            "smoke_generation": generation,
            "smoke_pass": not generation["systematic_structural_collapse"] and int(mx.get_peak_memory()) <= 12_000_000_000,
            "tokens_count_toward_stage_a": False,
        })
        atomic_json(args.result.resolve(), result)
        shutil.rmtree(checkpoint_path)
        result["temporary_checkpoint_deleted"] = not checkpoint_path.exists()
        atomic_json(args.result.resolve(), result)
    else:
        atomic_json(args.result.resolve(), result)
    print(json.dumps({"valid": True, "checkpoint_id": args.checkpoint_id, "global_optimizer_step": trainer.progress.global_optimizer_step, "assistant_target_tokens": trainer.progress.assistant_target_tokens, "optimizer_tokens": trainer.progress.optimizer_tokens, "peak_mlx_memory_bytes": int(mx.get_peak_memory()), "checkpoint_verified": verification.get("valid"), "smoke": bool(args.smoke)}, sort_keys=True), flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-checkpoint", type=Path)
    parser.add_argument("--generation-input-ids")
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--artifact-root", type=Path)
    parser.add_argument("--dataset-root", type=Path)
    parser.add_argument("--tokenizer", type=Path)
    parser.add_argument("--seed", type=Path)
    parser.add_argument("--resume-from", type=Path)
    parser.add_argument("--state-file", type=Path)
    parser.add_argument("--stage")
    parser.add_argument("--target-assistant-tokens", type=int)
    parser.add_argument("--maximum-updates", type=int)
    parser.add_argument("--checkpoint-id")
    parser.add_argument("--projected-checkpoint-bytes", type=int)
    parser.add_argument("--result", type=Path)
    args = parser.parse_args()
    if args.verify_checkpoint:
        return verify_mode(args)
    required = ("artifact_root", "dataset_root", "tokenizer", "state_file", "stage", "target_assistant_tokens", "checkpoint_id", "projected_checkpoint_bytes", "result")
    if not args.run or any(getattr(args, name) is None for name in required) or (not args.seed and not args.resume_from):
        parser.error("bounded training requires --run, all paths/config fields, and --seed or --resume-from")
    return train_mode(args)


if __name__ == "__main__":
    raise SystemExit(main())
