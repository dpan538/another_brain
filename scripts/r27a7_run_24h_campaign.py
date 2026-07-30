#!/usr/bin/env python3
import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a7_autonomous_controller import LEDGER, append_stage, load_json, now_utc, write_json
from src.training.campaign.r27a7_early_stop import should_stop
from src.training.campaign.r27a7_segment_scheduler import schedule_for_caps
from src.training.campaign.regression_guard import safety_probe_summary
from src.training.model_lab.train_campaign import run_campaign


ART = ROOT / "artifacts/r27a7"
MARKER = ROOT / "training/from_scratch/APPROVE_R27A7_MPS_24H_LARGE_DECODER_V1.json"


def require_marker(campaign_id):
    marker = load_json(MARKER)
    if not marker.get("approved") or marker.get("consumed") or marker.get("campaign_id") != campaign_id:
        raise SystemExit("r27a7_active_campaign_marker_required")
    return marker


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a7_mps_24h_large_decoder_v1")
    ap.add_argument("--lineage", default="auto")
    ap.add_argument("--model-scale", default="auto_largest_safe")
    ap.add_argument("--prefer-device", default="mps")
    ap.add_argument("--wall-clock-cap-hours", type=float, default=24)
    ap.add_argument("--max-total-steps", type=int, default=100000)
    ap.add_argument("--max-total-train-tokens", type=int, default=250000000)
    ap.add_argument("--max-segments", type=int, default=24)
    ap.add_argument("--run-label", default="r27a7_mps_24h_large_decoder_v1")
    args = ap.parse_args()
    require_marker(args.campaign_id)
    baseline = load_json(ART / "reports/r27a6_baseline.json")
    decision = load_json(ART / "reports/model_scale_decision.json")
    streams = load_json(ART / "reports/training_streams_manifest.json")
    probe = load_json(ART / "reports/mps_device_probe.json")
    if not baseline.get("r27a6_completed"):
        raise SystemExit("r27a7_blocked_missing_completed_r27a6_baseline")
    if not decision.get("ok"):
        raise SystemExit("r27a7_model_scale_decision_required")
    if not streams.get("ok"):
        raise SystemExit("r27a7_training_streams_required")
    model_size = decision["train_model_size"]
    tokenizer = decision.get("tokenizer_path") or baseline["tokenizer_path"]
    resume_checkpoint = None
    lineage_decision = decision["lineage"]
    if decision.get("resume_r27a6_checkpoint"):
        resume_checkpoint = str(ROOT / decision["r27a6_best_checkpoint_path"])
    schedule = schedule_for_caps(args.max_segments, args.max_total_steps, args.max_total_train_tokens)
    ledger = load_json(LEDGER, {"campaign_id": args.campaign_id, "stages": []})
    completed = len(ledger.get("stages", []))
    total_steps = sum(int(s.get("steps", 0)) for s in ledger.get("stages", []))
    total_tokens = sum(int(s.get("train_tokens", 0)) for s in ledger.get("stages", []))
    latest_checkpoint = resume_checkpoint
    if completed:
        latest_checkpoint = str(ROOT / ledger["stages"][-1]["checkpoint_path"])
    started_wall = time.time()
    for idx, seg in enumerate(schedule[completed:], start=completed):
        if total_steps >= args.max_total_steps or total_tokens >= args.max_total_train_tokens:
            ledger["stop_reason"] = "step_or_token_cap_reached"
            break
        if (time.time() - started_wall) / 3600.0 >= args.wall_clock_cap_hours:
            ledger["stop_reason"] = "wall_clock_cap_reached"
            break
        stream = ART / "training_mix" / seg["stream"]
        started = now_utc()
        try:
            report = run_campaign(
                campaign_id=args.campaign_id,
                model_size=model_size,
                tokenizer_path=tokenizer,
                train_stream=stream,
                dev_stream=ART / "training_mix/dev.jsonl",
                heldout_stream=ART / "training_mix/stratified_heldout.jsonl",
                max_total_steps=min(seg["steps"], args.max_total_steps - total_steps),
                max_total_train_tokens=min(seg["tokens"], args.max_total_train_tokens - total_tokens),
                context_length=int(decision.get("context_length") or 256),
                run_label=f"{args.run_label}_seg{idx + 1}_{seg['stage_id']}",
                artifact_root="artifacts/r27a7",
                resume_checkpoint=latest_checkpoint,
                lineage_decision=lineage_decision,
                learning_rate=seg["learning_rate"],
            )
        except Exception as exc:
            ledger["stop_reason"] = f"training_exception_{type(exc).__name__}"
            ledger["stop_error"] = repr(exc)
            write_json(LEDGER, ledger)
            raise
        probes = safety_probe_summary(report)
        stage = {
            "campaign_id": args.campaign_id,
            "segment_index": idx + 1,
            "stage_id": seg["stage_id"],
            "started_at_utc": started,
            "ended_at_utc": now_utc(),
            "steps": report["total_steps"],
            "train_tokens": report["total_train_tokens"],
            "checkpoint_input_path": latest_checkpoint,
            "checkpoint_path": report["checkpoint_path"],
            "tokenizer_path": tokenizer,
            "selected_scale": decision["selected_scale"],
            "model_lineage": lineage_decision,
            "prefer_device": args.prefer_device,
            "mps_available": bool(probe.get("mps_is_available")),
            "device": report.get("device"),
            "fallback_reason": decision.get("reason", "") if decision.get("fallback_used") else "",
            "train_loss": report.get("train_loss_end"),
            "dev_loss": report.get("dev_loss"),
            "stratified_heldout_loss": report.get("heldout_loss"),
            "dev_perplexity": report.get("dev_perplexity"),
            "stratified_heldout_perplexity": report.get("heldout_perplexity"),
            "curriculum_token_mix": report.get("actual_curriculum_token_mix", {}),
            "parameter_count": report.get("parameter_count"),
            **probes,
        }
        ledger = append_stage(stage)
        latest_checkpoint = str(ROOT / report["checkpoint_path"])
        total_steps += report["total_steps"]
        total_tokens += report["total_train_tokens"]
        stop, reason = should_stop(ledger, stage)
        if stop:
            ledger["stop_reason"] = reason
            write_json(LEDGER, ledger)
            break
    ledger = load_json(LEDGER, {"campaign_id": args.campaign_id, "stages": []})
    ledger.update({
        "ok": True,
        "campaign_id": args.campaign_id,
        "selected_scale": decision.get("selected_scale"),
        "model_lineage": lineage_decision,
        "checkpoint_resumed": bool(resume_checkpoint),
        "wall_clock_cap_hours": args.wall_clock_cap_hours,
        "observed_wall_clock_seconds": round(time.time() - started_wall, 3),
        "total_steps": sum(int(s.get("steps", 0)) for s in ledger.get("stages", [])),
        "total_train_tokens": sum(int(s.get("train_tokens", 0)) for s in ledger.get("stages", [])),
        "segment_count": len(ledger.get("stages", [])),
        "mps_available": bool(probe.get("mps_is_available")),
        "device_result": probe.get("device"),
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
        "weights_committed": False,
    })
    write_json(LEDGER, ledger)
    (ROOT / "docs/r27/R27A7_MPS_24H_LONGRUN.md").write_text(
        "# R27A7 MPS 24H Longrun\n\n"
        f"- Campaign id: `{args.campaign_id}`\n"
        f"- Selected scale: `{ledger.get('selected_scale')}`\n"
        f"- Lineage: `{ledger.get('model_lineage')}`\n"
        f"- MPS available: `{ledger.get('mps_available')}`\n"
        f"- Device result: `{ledger.get('device_result')}`\n"
        f"- Segments: `{ledger.get('segment_count')}`\n"
        f"- Steps: `{ledger.get('total_steps')}`\n"
        f"- Train tokens: `{ledger.get('total_train_tokens')}`\n"
        f"- Stop reason: `{ledger.get('stop_reason', '')}`\n"
        f"- Observed wall clock seconds: `{ledger.get('observed_wall_clock_seconds')}`\n\n"
        "The 24h wall-clock value is a hard upper bound, not a promise to run until exhaustion. R27A7 remains engineering/pilot training only.\n",
        encoding="utf-8",
    )
    print(json.dumps(ledger, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
