#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.campaign.campaign_ledger import append_stage, now_utc
from src.training.campaign.campaign_policy import load_policy
from src.training.model_lab.train_campaign import run_campaign


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a4_long_run_training_campaign_v1")
    ap.add_argument("--model-size", default="auto")
    ap.add_argument("--tokenizer", default="artifacts/r27a4/model_lab/tokenizer/tokenizer.json")
    ap.add_argument("--train-stream", default="artifacts/r27a4/training_mix/interleaved_train.jsonl")
    ap.add_argument("--dev-stream", default="artifacts/r27a4/training_mix/dev.jsonl")
    ap.add_argument("--heldout-stream", default="artifacts/r27a4/training_mix/heldout.jsonl")
    ap.add_argument("--max-total-steps", type=int, default=6000)
    ap.add_argument("--max-total-train-tokens", type=int, default=12000000)
    ap.add_argument("--context-length", type=int, default=512)
    ap.add_argument("--run-label", default="r27a4_long_run_campaign_v1")
    args = ap.parse_args()
    policy = load_policy()
    if args.max_total_steps > policy["max_total_steps"] or args.max_total_train_tokens > policy["max_total_train_tokens"]:
        raise SystemExit("r27a4_campaign_hard_cap_exceeded")
    marker_path = ROOT / "training/from_scratch/APPROVE_R27A4_LONG_RUN_TRAINING_CAMPAIGN_V1.json"
    marker = json.loads(marker_path.read_text(encoding="utf-8"))
    if not marker.get("approved") or marker.get("consumed"):
        raise SystemExit("r27a4_active_campaign_marker_required")
    started = now_utc()
    report = run_campaign(
        args.campaign_id,
        args.model_size,
        str(ROOT / args.tokenizer),
        ROOT / args.train_stream,
        ROOT / args.dev_stream,
        ROOT / args.heldout_stream,
        args.max_total_steps,
        args.max_total_train_tokens,
        args.context_length,
        args.run_label,
    )
    append_stage({
        "stage_id": "interleaved_pretraining_and_instruction_value_rag_stage",
        "command": " ".join(sys.argv),
        "started_at_utc": started,
        "ended_at_utc": now_utc(),
        "steps": report["total_steps"],
        "train_tokens": report["total_train_tokens"],
        "checkpoint_path": report["checkpoint_path"],
        "artifact_path": f"artifacts/r27a4/model_lab/runs/{args.run_label}/metrics.json",
        "train_loss": report.get("train_loss_end"),
        "dev_loss": report.get("dev_loss"),
        "heldout_loss": report.get("heldout_loss"),
        "actual_curriculum_token_mix": report["actual_curriculum_token_mix"],
        "resumed": False,
        "approval_marker_consumed": False,
    })
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
