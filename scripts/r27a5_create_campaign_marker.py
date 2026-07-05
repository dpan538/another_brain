#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKER = ROOT / "training/from_scratch/APPROVE_R27A5_SUSTAINED_PILOT_DISTILLATION_V1.json"


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a5_sustained_pilot_distillation_v1")
    ap.add_argument("--max-total-steps", type=int, default=12000)
    ap.add_argument("--max-total-train-tokens", type=int, default=24000000)
    ap.add_argument("--max-stage-count", "--allowed-stage-count", dest="allowed_stage_count", type=int, default=4)
    args = ap.parse_args()
    if args.max_total_steps > 12000 or args.max_total_train_tokens > 24000000 or args.allowed_stage_count > 4:
        raise SystemExit("r27a5_campaign_caps_exceeded")
    marker = {
        "approved": True,
        "scope": "sustained_pilot_distillation_engineering_only",
        "reviewer": "user",
        "phase": "phase_3_engineering_model_lab",
        "run_id": args.campaign_id,
        "campaign_id": args.campaign_id,
        "allow_public_corpus_metadata_fetch": True,
        "allow_public_corpus_bounded_download": True,
        "allow_public_corpus_cleaning": True,
        "allow_tokenizer_training": False,
        "allow_tokenizer_reuse": True,
        "allow_engineering_training": True,
        "allow_decoder_training": True,
        "allow_campaign_resume": True,
        "allow_hyperparameter_sweep": False,
        "allow_product_model_training": False,
        "allow_phase_4_scaled_training": False,
        "allow_long_term_training": False,
        "allow_release_checkpoint": False,
        "allow_weight_commit": False,
        "allow_external_llm_api": False,
        "allow_doubao_call": False,
        "allow_remote_model_weight_download": False,
        "max_total_steps": args.max_total_steps,
        "max_total_train_tokens": args.max_total_train_tokens,
        "allowed_stage_count": args.allowed_stage_count,
        "consumed": False,
        "allow_additional_runs": False,
        "created_at_utc": now_utc(),
        "notes": "R27A5 sustained engineering campaign marker. Allows one bounded multi-stage pilot only; not product training, not formal decoder training, not phase_4, not release.",
    }
    MARKER.parent.mkdir(parents=True, exist_ok=True)
    MARKER.write_text(json.dumps(marker, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({"ok": True, "marker": str(MARKER.relative_to(ROOT)), "active_training_approval_count": 1}, indent=2))


if __name__ == "__main__":
    main()
