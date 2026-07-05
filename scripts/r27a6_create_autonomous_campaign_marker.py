#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKER = ROOT / "training/from_scratch/APPROVE_R27A6_AUTONOMOUS_LONGRUN_DIALOGUE_READINESS_V1.json"
POLICY = ROOT / "data/training_registry/r27a6_autonomous_campaign_policy.json"


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a6_autonomous_longrun_dialogue_readiness_v1")
    ap.add_argument("--max-total-steps", type=int, default=30000)
    ap.add_argument("--max-total-train-tokens", type=int, default=50000000)
    ap.add_argument("--max-segments", type=int, default=10)
    args = ap.parse_args()
    marker = {
        "approved": True,
        "consumed": False,
        "reviewer": "user",
        "phase": "phase_3_engineering_model_lab",
        "run_id": args.campaign_id,
        "campaign_id": args.campaign_id,
        "scope": "bounded_autonomous_engineering_pilot_dialogue_readiness",
        "allow_segmented_autonomous_training": True,
        "allow_resume": True,
        "allow_best_checkpoint_selection": True,
        "allow_decoder_training": True,
        "allow_engineering_training": True,
        "allow_product_model_training": False,
        "allow_phase_4_scaled_training": False,
        "allow_release_checkpoint": False,
        "allow_remote_model_weight_download": False,
        "allow_tokenizer_training": False,
        "allow_weight_commit": False,
        "allow_raw_corpus_commit": False,
        "allow_processed_text_commit": False,
        "allow_external_llm_api": False,
        "allow_doubao_call": False,
        "allow_hyperparameter_sweep": False,
        "max_total_steps": args.max_total_steps,
        "max_total_train_tokens": args.max_total_train_tokens,
        "max_segments": args.max_segments,
        "created_at_utc": now_utc(),
        "notes": "One bounded R27A6 autonomous engineering campaign only; not product training, not formal decoder training, not phase_4, not release.",
    }
    policy = {
        "campaign_id": args.campaign_id,
        "campaign_type": "autonomous_engineering_pilot",
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "product_model_admission": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "allow_resume_from_r27a5_checkpoint": True,
        "allow_new_lineage_if_r27a5_artifacts_missing": True,
        "allow_segmented_autonomous_training": True,
        "max_total_steps": args.max_total_steps,
        "max_total_train_tokens": args.max_total_train_tokens,
        "accelerator_max_total_steps": 60000,
        "accelerator_max_total_train_tokens": 120000000,
        "max_segments": args.max_segments,
        "max_steps_per_segment": 4000,
        "max_tokens_per_segment": 8000000,
        "max_checkpoint_count": 12,
        "allow_resume": True,
        "allow_best_checkpoint_selection": True,
        "allow_hyperparameter_sweep": False,
        "allow_remote_model_weights": False,
        "allow_weight_commit": False,
        "allow_raw_corpus_commit": False,
        "allow_processed_text_commit": False,
        "allow_live_teacher_by_default": False,
        "active_approval_after_completion": 0,
    }
    write_json(MARKER, marker)
    write_json(POLICY, policy)
    print(json.dumps({"ok": True, "marker": str(MARKER.relative_to(ROOT)), "policy": str(POLICY.relative_to(ROOT)), "active_training_approval_count": 1}, indent=2))


if __name__ == "__main__":
    main()
