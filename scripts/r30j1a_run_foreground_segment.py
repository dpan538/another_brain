#!/usr/bin/env python3
"""Run exactly one bounded R30J1A foreground training segment and exit."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import mlx.core as mx  # noqa: E402

from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer  # noqa: E402
from src.training.mlx.r30j1a_training import (  # noqa: E402
    CAMPAIGN_ID,
    DEFAULT_LOSS_WEIGHTS,
    ForegroundTrainer,
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


def directory_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file()) if path.exists() else 0


def main() -> int:
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
    artifact_root = args.artifact_root.resolve()
    recorder = artifact_root / "training_flight_recorder"
    segment_root = recorder / "segments" / args.segment_id
    if segment_root.exists():
        raise FileExistsError("segment_artifact_already_exists")
    segment_root.mkdir(parents=True, exist_ok=False, mode=0o700)
    dataset = load_dataset(args.dataset_root, open_heldout=False)
    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer.resolve())
    before = resource_snapshot(artifact_root)
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
    else:
        model, architecture = create_model(
            lineage_path=args.lineage_path,
            lineage_label=args.lineage_label,
            attention_mode=args.attention,
            trainable_scope=args.scope,
            register_labels=dataset.register_labels,
        )
        optimizer = create_optimizer(model)
        from src.training.mlx.r30j1a_training import TrainingState

        state = TrainingState()
        lineage = architecture
        resumed = False
    architecture_receipt = {
        "architecture_sha256": architecture["architecture_sha256"],
        "attention_mode": args.attention,
        "trainable_scope": args.scope,
        "lineage_label": args.lineage_label,
        "parameter_report": architecture["parameter_report"],
        "lm_head_absent": True,
        "autoregressive_decode": False,
    }
    atomic_json(segment_root / "segment_manifest.json", {
        "schema_version": "r30j1a.segment-manifest.v1",
        "campaign_id": CAMPAIGN_ID,
        "segment_id": args.segment_id,
        "phase": args.phase,
        "planned_steps": args.steps,
        "starting_global_optimizer_step": state.global_optimizer_step,
        "resumed": resumed,
        "foreground_training": True,
        "background_training": False,
        "automation_used": False,
        "detached_process_used": False,
        "tmux_used": False,
        "nohup_used": False,
        "cron_used": False,
        "heldout_opened": False,
        "raw_text_logging": False,
        "architecture": architecture_receipt,
        "resource_before": before,
        "created_at": utc_now(),
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
        print(json.dumps({
            "event": "OPTIMIZER_STEP",
            "step": event["global_optimizer_step"],
            "combined_loss": round(event["combined_loss"], 6),
            "gradient_norm": round(event["gradient_norm"], 6),
            "mlx_peak_bytes": event["MLX_peak_memory_bytes"],
            "rss_bytes": event["process_rss_bytes"],
            "step_seconds": round(event["step_time_seconds"], 4),
        }, sort_keys=True), flush=True)
        if int(resource["MLX_peak_memory_bytes"]) > 6_500_000_000:
            raise MemoryError("j1a_mlx_hard_stop_exceeded")
        swap_growth = int(resource["swap"]["used_bytes"]) - int(before["swap"]["used_bytes"])
        if swap_growth > 1_000_000_000:
            raise MemoryError("j1a_sustained_swap_growth_stop")
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
    swap_delta = int(after["swap"]["used_bytes"]) - int(before["swap"]["used_bytes"])
    completion = {
        "schema_version": "r30j1a.segment-receipt.v1",
        "campaign_id": CAMPAIGN_ID,
        "segment_id": args.segment_id,
        "phase": args.phase,
        "completed": True,
        "exact_bounded_steps": args.steps,
        "starting_global_optimizer_step": starting_step,
        "ending_global_optimizer_step": trainer.state.global_optimizer_step,
        "training_state": trainer.state.as_dict(),
        "checkpoint": receipt,
        "checkpoint_logical_path": f"artifacts/r30j1a/checkpoints/{args.segment_id}/{checkpoint.name}",
        "storage_projection": storage,
        "resource_before": before,
        "resource_after": after,
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
    append_jsonl(recorder / "timeline.jsonl", {
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
        "background_training": False,
        "updated_at": utc_now(),
    })
    atomic_json(artifact_root / "heartbeat_latest.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": "SEGMENT_AUDIT",
        "current_process": None,
        "segment_id": args.segment_id,
        "global_optimizer_step": trainer.state.global_optimizer_step,
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


if __name__ == "__main__":
    raise SystemExit(main())
