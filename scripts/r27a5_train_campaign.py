#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.campaign.lineage import inspect_r27a4_lineage
from src.training.campaign.r27a5_campaign_ledger import append_stage, now_utc
from src.training.campaign.r27a5_campaign_policy import load_policy
from src.training.model_lab.train_campaign import run_campaign


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a5_sustained_pilot_distillation_v1")
    ap.add_argument("--lineage", default="auto")
    ap.add_argument("--resume-from-r27a4-if-compatible", action="store_true")
    ap.add_argument("--model-size", default="auto")
    ap.add_argument("--tokenizer", default="")
    ap.add_argument("--train-stream", default="artifacts/r27a5/training_mix/interleaved_train.jsonl")
    ap.add_argument("--dev-stream", default="artifacts/r27a5/training_mix/dev.jsonl")
    ap.add_argument("--heldout-stream", default="artifacts/r27a5/training_mix/heldout.jsonl")
    ap.add_argument("--max-total-steps", type=int, default=12000)
    ap.add_argument("--max-total-train-tokens", type=int, default=24000000)
    ap.add_argument("--context-length", default="auto")
    ap.add_argument("--run-label", default="r27a5_sustained_pilot_distillation_v1")
    args = ap.parse_args()
    policy = load_policy()
    if args.max_total_steps > policy["max_total_steps"] or args.max_total_train_tokens > policy["max_total_train_tokens"]:
        raise SystemExit("r27a5_campaign_hard_cap_exceeded")
    marker_path = ROOT / "training/from_scratch/APPROVE_R27A5_SUSTAINED_PILOT_DISTILLATION_V1.json"
    marker = json.loads(marker_path.read_text(encoding="utf-8"))
    if not marker.get("approved") or marker.get("consumed"):
        raise SystemExit("r27a5_active_campaign_marker_required")
    lineage = inspect_r27a4_lineage()
    resume_checkpoint = ""
    tokenizer = args.tokenizer
    model_size = args.model_size
    context_length = 256 if args.context_length == "auto" else int(args.context_length)
    if (args.lineage in {"auto", "resume_r27a4_mini8m"}) and args.resume_from_r27a4_if_compatible and lineage["compatible_for_resume"]:
        resume_checkpoint = str(ROOT / lineage["checkpoint_path"])
        tokenizer = str(ROOT / lineage["tokenizer_path"])
        model_size = "mini_8m"
        context_length = 256
    elif not tokenizer:
        tokenizer = str(ROOT / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json")
    started = now_utc()
    report = run_campaign(
        args.campaign_id,
        model_size,
        str(ROOT / tokenizer) if not str(tokenizer).startswith(str(ROOT)) else str(tokenizer),
        ROOT / args.train_stream,
        ROOT / args.dev_stream,
        ROOT / args.heldout_stream,
        args.max_total_steps,
        args.max_total_train_tokens,
        context_length,
        args.run_label,
        artifact_root="artifacts/r27a5",
        resume_checkpoint=resume_checkpoint or None,
        lineage_decision=lineage["lineage_decision"],
        learning_rate=0.00025 if resume_checkpoint else 0.0006,
    )
    append_stage({
        "campaign_id": args.campaign_id,
        "stage_id": "r27a5_continued_pretraining_sft_distillation_value_rag",
        "command": " ".join(sys.argv),
        "started_at_utc": started,
        "ended_at_utc": now_utc(),
        "steps": report["total_steps"],
        "train_tokens": report["total_train_tokens"],
        "resumed_from_checkpoint": bool(resume_checkpoint),
        "checkpoint_input_path": resume_checkpoint,
        "checkpoint_output_path": report["checkpoint_path"],
        "checkpoint_path": report["checkpoint_path"],
        "tokenizer_path": tokenizer,
        "model_lineage": lineage["lineage_decision"],
        "artifact_path": f"artifacts/r27a5/model_lab/runs/{args.run_label}/metrics.json",
        "train_loss": report.get("train_loss_end"),
        "dev_loss": report.get("dev_loss"),
        "heldout_loss": report.get("heldout_loss"),
        "curriculum_token_mix": report["actual_curriculum_token_mix"],
        "actual_curriculum_token_mix": report["actual_curriculum_token_mix"],
        "train_perplexity": report.get("train_perplexity"),
        "dev_perplexity": report.get("dev_perplexity"),
        "heldout_perplexity": report.get("heldout_perplexity"),
        "checkpoint_count": 1,
        "resumed": bool(resume_checkpoint),
        "approval_marker_consumed": False,
    })
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
