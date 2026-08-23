#!/usr/bin/env python3
"""Run exactly one bounded R30J1A foreground training segment and exit."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import mlx.core as mx  # noqa: E402

from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer  # noqa: E402
from src.training.mlx.r30j1a_supervision import (  # noqa: E402
    build_failed_segment_receipt,
    incomplete_segments_without_parent_decision,
    resource_stop_reason,
)
from src.training.mlx.r30j1a_training import (  # noqa: E402
    CAMPAIGN_ID,
    DEFAULT_LOSS_WEIGHTS,
    ForegroundTrainer,
    TrainingState,
    append_jsonl,
    atomic_json,
    calibration_report,
    checkpoint_storage_projection,
    create_model,
    create_optimizer,
    evaluate_dev,
    load_checkpoint,
    load_dataset,
    resource_snapshot,
    save_checkpoint,
    utc_now,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--dataset-root", type=Path, default=ROOT / "artifacts" / "r30j1a" / "dataset")
    parser.add_argument("--tokenizer", type=Path, default=ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json")
    parser.add_argument("--lineage-path", type=Path, required=True)
    parser.add_argument("--lineage-label", choices=("r28m1_q4_recovered", "r3_stage_a_080k"), required=True)
    parser.add_argument("--attention", choices=("causal", "bidirectional"), required=True)
    parser.add_argument("--scope", choices=("probe", "last_one", "last_two"), required=True)
    parser.add_argument("--segment-id", required=True)
    parser.add_argument("--phase", choices=("RESOURCE_REHEARSAL", "PROBE", "MAIN", "RESUME_PROOF"), required=True)
    parser.add_argument("--steps", type=int, required=True)
    parser.add_argument("--resume-checkpoint", type=Path)
    parser.add_argument("--calibrate", action="store_true")
    parser.add_argument("--skip-dev-eval", action="store_true", help="Allowed only for isolated exact-resume proof branches.")
    args = parser.parse_args()
    if args.steps < 0 or args.steps > 100:
        raise ValueError("segment_steps_out_of_bounds")
    if args.skip_dev_eval and args.phase != "RESUME_PROOF":
        raise ValueError("dev_eval_may_only_be_skipped_for_resume_proof")
    return args


def initial_manifest(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "schema_version": "r30j1a.segment-manifest.v1",
        "campaign_id": CAMPAIGN_ID,
        "segment_id": args.segment_id,
        "phase": args.phase,
        "status": "INITIALIZING",
        "planned_steps": args.steps,
        "starting_global_optimizer_step": 0,
        "starting_training_state": TrainingState().as_dict(),
        "resumed": bool(args.resume_checkpoint),
        "foreground_training": True,
        "background_training": False,
        "automation_used": False,
        "detached_process_used": False,
        "tmux_used": False,
        "nohup_used": False,
        "cron_used": False,
        "heldout_opened": False,
        "raw_text_logging": False,
        "architecture": None,
        "resource_before": None,
        "created_at": utc_now(),
    }


def running_state(
    *,
    args: argparse.Namespace,
    state: TrainingState,
    checkpoint_logical_path: str | None,
) -> dict[str, Any]:
    return {
        "campaign_id": CAMPAIGN_ID,
        "state": args.phase,
        **state.as_dict(),
        "current_process": os.getpid(),
        "active_segment": args.segment_id,
        "active_checkpoint": checkpoint_logical_path,
        "training_started": state.global_optimizer_step > 0,
        "heldout_opened": False,
        "descriptive_bootstrap_authorized": True,
        "normative_persona_training_authorized": False,
        "final_persona_training_authorized": False,
        "foreground_training": True,
        "background_training": False,
        "parent_decision_pending": False,
        "updated_at": utc_now(),
    }


def persist_failure(
    *,
    args: argparse.Namespace,
    artifact_root: Path,
    segment_root: Path,
    error: BaseException,
) -> None:
    receipt_path = segment_root / "segment_receipt.json"
    if receipt_path.exists():
        return
    receipt = build_failed_segment_receipt(
        segment_root=segment_root,
        error=error,
        failure_source="foreground_supervisor_exception",
        checkpoint_root=artifact_root / "checkpoints" / args.segment_id,
    )
    receipt["failed_at"] = utc_now()
    atomic_json(receipt_path, receipt)
    append_jsonl(artifact_root / "training_flight_recorder" / "timeline.jsonl", {
        "event": "SEGMENT_FAILED",
        "segment_id": args.segment_id,
        "failure_code": receipt["failure_code"],
        "attempted_optimizer_updates": receipt["attempted_optimizer_updates"],
        "durable_global_optimizer_step": receipt["durable_global_optimizer_step"],
        "checkpoint_verified": receipt["checkpoint_verified"],
        "at": utc_now(),
    })
    attempted = receipt["attempted_training_state"]
    durable = receipt.get("durable_training_state") or {
        "global_optimizer_step": receipt["durable_global_optimizer_step"],
        "examples_seen": 0,
        "optimizer_tokens": 0,
        "representation_target_examples": 0,
        "assistant_target_tokens": 0,
    }
    checkpoint_path = None
    if receipt["checkpoint_verified"]:
        checkpoint_path = f"artifacts/r30j1a/checkpoints/{args.segment_id}/{receipt['checkpoint']['checkpoint_id']}"
    atomic_json(artifact_root / "campaign_state.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": "SEGMENT_AUDIT",
        **durable,
        "current_process": None,
        "active_segment": args.segment_id,
        "active_checkpoint": checkpoint_path,
        "training_started": int(attempted["global_optimizer_step"]) > 0,
        "attempted_training_state": attempted,
        "discarded_uncheckpointed_optimizer_updates": receipt["discarded_uncheckpointed_optimizer_updates"],
        "heldout_opened": False,
        "descriptive_bootstrap_authorized": True,
        "normative_persona_training_authorized": False,
        "final_persona_training_authorized": False,
        "foreground_training": True,
        "background_training": False,
        "parent_decision_pending": True,
        "last_segment_failed": True,
        "failure_code": receipt["failure_code"],
        "updated_at": utc_now(),
    })
    atomic_json(artifact_root / "heartbeat_latest.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": "SEGMENT_AUDIT",
        "current_process": None,
        "process_running": False,
        "training_running": False,
        "segment_id": args.segment_id,
        "durable_global_optimizer_step": receipt["durable_global_optimizer_step"],
        "attempted_ending_global_optimizer_step": receipt["attempted_ending_global_optimizer_step"],
        "parent_decision_pending": True,
        "failure_code": receipt["failure_code"],
        "updated_at": utc_now(),
    })
    print(json.dumps({
        "event": "SEGMENT_FAILED",
        "segment_id": args.segment_id,
        "failure_code": receipt["failure_code"],
        "attempted_updates": receipt["attempted_optimizer_updates"],
        "durable_step": receipt["durable_global_optimizer_step"],
        "checkpoint_verified": receipt["checkpoint_verified"],
        "parent_decision_pending": True,
    }, sort_keys=True), flush=True)


def run_segment(args: argparse.Namespace, artifact_root: Path, segment_root: Path) -> int:
    dataset = load_dataset(args.dataset_root, open_heldout=False)
    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer.resolve())
    before = resource_snapshot(artifact_root)
    initial_stop = resource_stop_reason(before, before)
    if initial_stop is not None:
        raise MemoryError(initial_stop)
    if before["free_disk_bytes"] < 2_000_000_000:
        raise OSError("pre_segment_filesystem_safety_reserve_failed")
    if args.resume_checkpoint:
        model, optimizer, state, architecture, lineage = load_checkpoint(
            args.resume_checkpoint.resolve(),
            dataset=dataset,
            lineage_path=args.lineage_path.resolve(),
        )
        if architecture["attention_mode"] != args.attention or architecture["trainable_scope"] != args.scope:
            raise ValueError("resume_architecture_argument_mismatch")
        resumed = True
        checkpoint_at_start = f"resume_checkpoint:{args.resume_checkpoint.name}"
    else:
        model, architecture = create_model(
            lineage_path=args.lineage_path,
            lineage_label=args.lineage_label,
            attention_mode=args.attention,
            trainable_scope=args.scope,
            register_labels=dataset.register_labels,
        )
        optimizer = create_optimizer(model)
        state = TrainingState()
        lineage = architecture
        resumed = False
        checkpoint_at_start = None
    architecture_receipt = {
        "architecture_sha256": architecture["architecture_sha256"],
        "attention_mode": args.attention,
        "trainable_scope": args.scope,
        "lineage_label": args.lineage_label,
        "parameter_report": architecture["parameter_report"],
        "lm_head_absent": True,
        "autoregressive_decode": False,
    }
    manifest = initial_manifest(args) | {
        "status": "ACTIVE",
        "starting_global_optimizer_step": state.global_optimizer_step,
        "starting_training_state": state.as_dict(),
        "resumed": resumed,
        "architecture": architecture_receipt,
        "resource_before": before,
    }
    atomic_json(segment_root / "segment_manifest.json", manifest)
    atomic_json(artifact_root / "campaign_state.json", running_state(
        args=args,
        state=state,
        checkpoint_logical_path=checkpoint_at_start,
    ))
    atomic_json(artifact_root / "heartbeat_latest.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": args.phase,
        "current_process": os.getpid(),
        "process_running": True,
        "training_running": False,
        "segment_id": args.segment_id,
        "global_optimizer_step": state.global_optimizer_step,
        "heldout_opened": False,
        "updated_at": utc_now(),
    })
    if args.calibrate:
        calibration = calibration_report(model=model, dataset=dataset, output_path=segment_root / "loss_calibration.json")
        print(json.dumps({"event": "CALIBRATION_COMPLETE", "gradient_norm_mean": calibration["gradient_norm_mean"], "optimizer_updates": 0}, sort_keys=True), flush=True)
    trainer = ForegroundTrainer(
        model=model,
        optimizer=optimizer,
        dataset=dataset,
        loss_weights=DEFAULT_LOSS_WEIGHTS,
        state=state,
    )
    starting_step = state.global_optimizer_step
    print(json.dumps({"event": "SEGMENT_START", "segment_id": args.segment_id, "steps": args.steps, "starting_step": starting_step, "foreground": True}, sort_keys=True), flush=True)
    peak_rss = before["process_rss_bytes"]
    for _ in range(args.steps):
        event = trainer.train_one_update()
        append_jsonl(segment_root / "train_events.jsonl", event)
        resource = resource_snapshot(artifact_root)
        resource["global_optimizer_step"] = event["global_optimizer_step"]
        append_jsonl(segment_root / "resource_events.jsonl", resource)
        peak_rss = max(peak_rss, int(resource["process_rss_bytes"]))
        atomic_json(artifact_root / "heartbeat_latest.json", {
            "campaign_id": CAMPAIGN_ID,
            "state": args.phase,
            "current_process": os.getpid(),
            "process_running": True,
            "training_running": True,
            "segment_id": args.segment_id,
            "global_optimizer_step": event["global_optimizer_step"],
            "optimizer_tokens": event["optimizer_tokens"],
            "examples_seen": event["examples_seen"],
            "heldout_opened": False,
            "resource": resource,
            "updated_at": utc_now(),
        })
        print(json.dumps({
            "event": "OPTIMIZER_STEP",
            "step": event["global_optimizer_step"],
            "combined_loss": round(event["combined_loss"], 6),
            "gradient_norm": round(event["gradient_norm"], 6),
            "mlx_peak_bytes": resource["mlx_peak_memory_bytes"],
            "rss_bytes": resource["process_rss_bytes"],
            "memory_pressure_state": resource["memory_pressure"]["state"],
            "swap_growth_bytes": int(resource["swap"]["used_bytes"]) - int(before["swap"]["used_bytes"]),
            "step_seconds": round(event["step_time_seconds"], 4),
        }, sort_keys=True), flush=True)
        stop_reason = resource_stop_reason(before, resource)
        if stop_reason is not None:
            raise MemoryError(stop_reason)
    if trainer.state.global_optimizer_step != starting_step + args.steps:
        raise AssertionError("bounded_segment_step_count_mismatch")
    if args.skip_dev_eval:
        dev_eval: dict[str, Any] = {"skipped": True, "reason": "isolated_exact_resume_proof", "heldout_opened": False}
    else:
        print(json.dumps({"event": "DEV_EVAL_START", "examples": len(dataset.dev)}, sort_keys=True), flush=True)
        dev_eval = evaluate_dev(model=model, dataset=dataset, tokenizer=tokenizer, output_path=segment_root / "dev_eval.json")
        print(json.dumps({
            "event": "DEV_EVAL_COMPLETE",
            "domain_macro_f1": round(dev_eval["domain"]["macro_f1"], 6),
            "register_macro_f1": round(dev_eval["register"]["macro_f1"], 6),
            "mechanics_macro_f1": round(dev_eval["mechanics"]["macro_f1"], 6),
            "matched_style": round(dev_eval["representation"]["matched_style_contrast_accuracy"], 6),
        }, sort_keys=True), flush=True)
    checkpoint_id = f"{args.segment_id}-step-{trainer.state.global_optimizer_step:06d}"
    checkpoint, receipt = save_checkpoint(
        artifact_root / "checkpoints" / args.segment_id,
        checkpoint_id,
        model=model,
        optimizer=optimizer,
        state=trainer.state,
        dataset=dataset,
        architecture=architecture_receipt,
        lineage=lineage,
        metrics=dev_eval,
    )
    storage = checkpoint_storage_projection(receipt)
    after = resource_snapshot(artifact_root)
    final_stop = resource_stop_reason(before, after)
    if final_stop is not None:
        raise MemoryError(final_stop)
    swap_delta = int(after["swap"]["used_bytes"]) - int(before["swap"]["used_bytes"])
    completion = {
        "schema_version": "r30j1a.segment-receipt.v1",
        "campaign_id": CAMPAIGN_ID,
        "segment_id": args.segment_id,
        "phase": args.phase,
        "completed": True,
        "failed": False,
        "exact_bounded_steps": args.steps,
        "starting_global_optimizer_step": starting_step,
        "ending_global_optimizer_step": trainer.state.global_optimizer_step,
        "training_state": trainer.state.as_dict(),
        "checkpoint": receipt,
        "checkpoint_created": True,
        "checkpoint_verified": receipt["verified"],
        "checkpoint_logical_path": f"artifacts/r30j1a/checkpoints/{args.segment_id}/{checkpoint.name}",
        "storage_projection": storage,
        "resource_before": before,
        "resource_after": after,
        "resource_telemetry_complete": True,
        "swap_delta_bytes": swap_delta,
        "peak_process_rss_bytes": peak_rss,
        "peak_mlx_memory_bytes": int(mx.get_peak_memory()),
        "heldout_opened": False,
        "foreground_training": True,
        "background_training": False,
        "parent_decision_pending": True,
        "raw_text_persisted": False,
        "completed_at": utc_now(),
    }
    atomic_json(segment_root / "segment_receipt.json", completion)
    atomic_json(segment_root / "checkpoint_receipt.json", receipt)
    append_jsonl(artifact_root / "training_flight_recorder" / "timeline.jsonl", {
        "event": "SEGMENT_COMPLETED",
        "segment_id": args.segment_id,
        "ending_global_optimizer_step": trainer.state.global_optimizer_step,
        "checkpoint_logical_path": completion["checkpoint_logical_path"],
        "at": utc_now(),
    })
    atomic_json(artifact_root / "campaign_state.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": "SEGMENT_AUDIT",
        **trainer.state.as_dict(),
        "current_process": None,
        "active_segment": args.segment_id,
        "active_checkpoint": completion["checkpoint_logical_path"],
        "training_started": trainer.state.global_optimizer_step > 0,
        "heldout_opened": False,
        "descriptive_bootstrap_authorized": True,
        "normative_persona_training_authorized": False,
        "final_persona_training_authorized": False,
        "foreground_training": True,
        "background_training": False,
        "parent_decision_pending": True,
        "last_segment_failed": False,
        "updated_at": utc_now(),
    })
    atomic_json(artifact_root / "heartbeat_latest.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": "SEGMENT_AUDIT",
        "current_process": None,
        "process_running": False,
        "training_running": False,
        "segment_id": args.segment_id,
        "global_optimizer_step": trainer.state.global_optimizer_step,
        "parent_decision_pending": True,
        "updated_at": utc_now(),
    })
    print(json.dumps({
        "event": "SEGMENT_COMPLETE",
        "segment_id": args.segment_id,
        "ending_step": trainer.state.global_optimizer_step,
        "checkpoint_bytes": receipt["checkpoint_bytes"],
        "peak_mlx_bytes": completion["peak_mlx_memory_bytes"],
        "swap_delta_bytes": swap_delta,
        "parent_decision_pending": True,
    }, sort_keys=True), flush=True)
    return 0


def main() -> int:
    args = parse_args()
    artifact_root = args.artifact_root.resolve()
    recorder = artifact_root / "training_flight_recorder"
    existing_segments = sorted((recorder / "segments").iterdir()) if (recorder / "segments").is_dir() else []
    pending = incomplete_segments_without_parent_decision(existing_segments)
    if pending:
        raise RuntimeError("prior_segment_parent_decision_missing:" + ",".join(pending))
    segment_root = recorder / "segments" / args.segment_id
    if segment_root.exists():
        raise FileExistsError("segment_artifact_already_exists")
    segment_root.mkdir(parents=True, exist_ok=False, mode=0o700)
    atomic_json(segment_root / "segment_manifest.json", initial_manifest(args))
    try:
        return run_segment(args, artifact_root, segment_root)
    except BaseException as error:
        persist_failure(
            args=args,
            artifact_root=artifact_root,
            segment_root=segment_root,
            error=error,
        )
        raise


if __name__ == "__main__":
    raise SystemExit(main())
