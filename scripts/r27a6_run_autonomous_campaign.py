#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.autonomous_controller import append_stage, load_json, now_utc, write_json
from src.training.campaign.early_stop import should_stop
from src.training.campaign.lineage import inspect_r27a5_lineage
from src.training.campaign.regression_guard import safety_probe_summary
from src.training.campaign.segment_scheduler import schedule_for_caps
from src.training.model_lab.train_campaign import run_campaign

ART = ROOT / "artifacts/r27a6"
MARKER = ROOT / "training/from_scratch/APPROVE_R27A6_AUTONOMOUS_LONGRUN_DIALOGUE_READINESS_V1.json"
LEDGER = ROOT / "data/training_registry/r27a6_autonomous_campaign_ledger.json"


def require_marker(campaign_id):
    marker = load_json(MARKER)
    if not marker.get("approved") or marker.get("consumed") or marker.get("campaign_id") != campaign_id:
        raise SystemExit("r27a6_active_autonomous_campaign_marker_required")
    return marker


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a6_autonomous_longrun_dialogue_readiness_v1")
    ap.add_argument("--lineage", default="resume_r27a5_if_compatible")
    ap.add_argument("--max-total-steps", type=int, default=30000)
    ap.add_argument("--max-total-train-tokens", type=int, default=50000000)
    ap.add_argument("--max-segments", type=int, default=10)
    ap.add_argument("--run-label", default="r27a6_autonomous_longrun_dialogue_readiness_v1")
    args = ap.parse_args()
    require_marker(args.campaign_id)
    audit = load_json(ART / "reports/r27a5_evidence_audit.json")
    if audit and not audit.get("proceed_to_longrun"):
        raise SystemExit("r27a6_blocked_by_r27a5_evidence_audit")
    lineage = inspect_r27a5_lineage(ROOT)
    if args.lineage == "resume_r27a5_if_compatible" and lineage["compatible_for_resume"]:
        checkpoint = str(ROOT / lineage["checkpoint_path"])
        tokenizer = str(ROOT / lineage["tokenizer_path"])
        model_size = "mini_8m"
        lineage_decision = lineage["lineage_decision"]
    else:
        checkpoint = None
        tokenizer = str(ROOT / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json")
        model_size = "mini_8m"
        lineage_decision = "new_r27a6_lineage"
    schedule = schedule_for_caps(args.max_segments, args.max_total_steps, args.max_total_train_tokens)
    ledger = load_json(LEDGER, {"campaign_id": args.campaign_id, "stages": []})
    total_steps = sum(int(s.get("steps", 0)) for s in ledger.get("stages", []))
    total_tokens = sum(int(s.get("train_tokens", 0)) for s in ledger.get("stages", []))
    completed = len(ledger.get("stages", []))
    latest_checkpoint = checkpoint
    if completed:
        latest_checkpoint = str(ROOT / ledger["stages"][-1]["checkpoint_path"])
    for idx, seg in enumerate(schedule[completed:], start=completed):
        if total_steps >= args.max_total_steps or total_tokens >= args.max_total_train_tokens:
            break
        stream = ART / "training_mix" / seg["stream"]
        started = now_utc()
        report = run_campaign(
            campaign_id=args.campaign_id,
            model_size=model_size,
            tokenizer_path=tokenizer,
            train_stream=stream,
            dev_stream=ART / "training_mix/dev.jsonl",
            heldout_stream=ART / "training_mix/stratified_heldout.jsonl",
            max_total_steps=min(seg["steps"], args.max_total_steps - total_steps),
            max_total_train_tokens=min(seg["tokens"], args.max_total_train_tokens - total_tokens),
            context_length=256,
            run_label=f"{args.run_label}_seg{idx + 1}_{seg['stage_id']}",
            artifact_root="artifacts/r27a6",
            resume_checkpoint=latest_checkpoint,
            lineage_decision=lineage_decision,
            learning_rate=seg["learning_rate"],
        )
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
            "model_lineage": lineage_decision,
            "device": report.get("device"),
            "train_loss": report.get("train_loss_end"),
            "dev_loss": report.get("dev_loss"),
            "stratified_heldout_loss": report.get("heldout_loss"),
            "dev_perplexity": report.get("dev_perplexity"),
            "stratified_heldout_perplexity": report.get("heldout_perplexity"),
            "curriculum_token_mix": report.get("actual_curriculum_token_mix", {}),
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
    ledger = load_json(LEDGER, {})
    ledger.update({
        "ok": True,
        "campaign_id": args.campaign_id,
        "model_lineage": lineage_decision,
        "checkpoint_resumed": bool(checkpoint),
        "total_steps": sum(int(s.get("steps", 0)) for s in ledger.get("stages", [])),
        "total_train_tokens": sum(int(s.get("train_tokens", 0)) for s in ledger.get("stages", [])),
        "segment_count": len(ledger.get("stages", [])),
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
        "weights_committed": False,
    })
    write_json(LEDGER, ledger)
    (ROOT / "docs/r27/R27A6_AUTONOMOUS_CAMPAIGN_CONTROLLER.md").write_text(
        "# R27A6 Autonomous Campaign Controller\n\n"
        f"Campaign `{args.campaign_id}` ran `{ledger['segment_count']}` bounded segments for `{ledger['total_steps']}` steps and `{ledger['total_train_tokens']}` train tokens. "
        "Each segment verifies the active marker, stays within caps, writes checkpoints under ignored artifacts, evaluates dev/stratified-heldout, records probe metadata, and updates best-checkpoint metadata only.\n",
        encoding="utf-8",
    )
    print(json.dumps(ledger, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
