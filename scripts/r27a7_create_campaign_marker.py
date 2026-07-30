#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a7_autonomous_controller import default_policy, now_utc, write_json, write_policy


MARKER = ROOT / "training/from_scratch/APPROVE_R27A7_MPS_24H_LARGE_DECODER_V1.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a7_mps_24h_large_decoder_v1")
    ap.add_argument("--wall-clock-cap-hours", type=float, default=24)
    ap.add_argument("--max-total-steps", type=int, default=100000)
    ap.add_argument("--max-total-train-tokens", type=int, default=250000000)
    ap.add_argument("--max-segments", type=int, default=24)
    args = ap.parse_args()
    policy = default_policy(args.campaign_id)
    policy.update({
        "wall_clock_cap_hours": args.wall_clock_cap_hours,
        "max_total_steps": args.max_total_steps,
        "max_total_train_tokens": args.max_total_train_tokens,
        "max_segments": args.max_segments,
    })
    write_policy(policy)
    marker = {
        "approved": True,
        "reviewer": "user",
        "phase": "phase_3_engineering_model_lab",
        "scope": "bounded_mps_first_24h_cap_large_decoder_engineering_pilot",
        "run_id": args.campaign_id,
        "campaign_id": args.campaign_id,
        "created_at_utc": now_utc(),
        "consumed": False,
        "allow_engineering_training": True,
        "allow_segmented_autonomous_training": True,
        "allow_decoder_training": True,
        "allow_resume": True,
        "allow_best_checkpoint_selection": True,
        "allow_product_model_training": False,
        "allow_phase_4_scaled_training": False,
        "allow_release_checkpoint": False,
        "allow_tokenizer_training": False,
        "allow_remote_model_weight_download": False,
        "allow_external_llm_api": False,
        "allow_doubao_call": False,
        "allow_weight_commit": False,
        "allow_raw_corpus_commit": False,
        "allow_processed_text_commit": False,
        "wall_clock_cap_hours": args.wall_clock_cap_hours,
        "max_total_steps": args.max_total_steps,
        "max_total_train_tokens": args.max_total_train_tokens,
        "max_segments": args.max_segments,
        "notes": "One bounded R27A7 autonomous engineering campaign only; not product training, not formal decoder training, not phase_4, not release.",
    }
    write_json(MARKER, marker)
    print(json.dumps(marker, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
