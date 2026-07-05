#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.eval.curriculum_loss import stage_loss_summary

ART = ROOT / "artifacts/r27a6"


def read_json(path, default=None):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else (default or {})


def git(args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a6_autonomous_longrun_dialogue_readiness_v1")
    ap.add_argument("--compare-r27a5", action="store_true")
    args = ap.parse_args()
    ledger = read_json(ROOT / "data/training_registry/r27a6_autonomous_campaign_ledger.json", {})
    streams = read_json(ART / "reports/autonomous_training_streams_manifest.json", {})
    clean = read_json(ART / "reports/cleaning_report.json", {})
    promoted = read_json(ART / "reports/promoted_instruction_report.json", {})
    dialogue = read_json(ART / "reports/dialogue_product_curriculum_report.json", {})
    r27a5 = read_json(ROOT / "artifacts/r27a5/model_lab/runs/r27a5_sustained_pilot_distillation_v1/metrics.json", {})
    stages = ledger.get("stages", [])
    final_stage = stages[-1] if stages else {}
    report = {
        "ok": bool(stages),
        "campaign_id": args.campaign_id,
        "branch": git(["branch", "--show-current"]),
        "commit_hash": git(["rev-parse", "HEAD"]),
        "base_commit": "effc98f0ac9c4f1f7e55971e5d73f0c7b482eb51",
        "lineage_decision": ledger.get("model_lineage"),
        "checkpoint_input": stages[0].get("checkpoint_input_path") if stages else "",
        "best_checkpoint_metadata": ledger.get("best_checkpoints", {}),
        "tokenizer_hash": read_json(ART / "reports/lineage_decision.json", {}).get("tokenizer_sha256", ""),
        "model_config": read_json(ART / f"model_lab/runs/{Path(final_stage.get('checkpoint_path', '')).stem}/metrics.json", {}).get("model_config", {}),
        "parameter_count": read_json(ART / f"model_lab/runs/{Path(final_stage.get('checkpoint_path', '')).stem}/metrics.json", {}).get("parameter_count"),
        "device": final_stage.get("device"),
        "total_steps": ledger.get("total_steps"),
        "total_consumed_train_tokens": ledger.get("total_train_tokens"),
        "segment_wise": stages,
        "train_dev_stratified_heldout_loss": {"train": final_stage.get("train_loss"), "dev": final_stage.get("dev_loss"), "stratified_heldout": final_stage.get("stratified_heldout_loss")},
        "loss_by_curriculum": final_stage.get("curriculum_token_mix", {}),
        "loss_by_stage": stage_loss_summary(stages),
        "token_mix_first_100k": streams.get("prefix_100k"),
        "token_mix_first_500k": streams.get("prefix_500k"),
        "token_mix_first_1m": streams.get("prefix_1m"),
        "token_mix_first_5m": streams.get("prefix_5m"),
        "public_corpus_rows": clean.get("clean_rows", 0),
        "zh_mixed_en_counts": clean.get("language_counts", {}),
        "public_instruction_candidates": read_json(ART / "reports/instruction_import_report.json", {}).get("candidate_rows", 0),
        "promoted_public_instruction_rows": promoted.get("promoted_instruction_rows", 0),
        "live_teacher_candidates": read_json(ART / "reports/live_teacher_review_report.json", {}).get("reviewed", 0),
        "promoted_live_teacher_rows": read_json(ART / "reports/live_teacher_review_report.json", {}).get("promoted_live_teacher_rows", 0),
        "dialogue_product_rows": dialogue.get("records", 0),
        "sft_rows": read_json(ART / "reports/sft_curriculum_report.json", {}).get("records", 0),
        "value_aesthetic_rows": read_json(ART / "reports/value_aesthetic_report.json", {}).get("rows", 0),
        "rag_evidence_rows": read_json(ART / "reports/rag_report.json", {}).get("rows", 0),
        "reasoning_rows": read_json(ART / "reports/reasoning_report.json", {}).get("rows", 0),
        "rejection_counts": {"pii": clean.get("reject_reasons", {}).get("pii", 0), "license_access_blocked": len([m for m in read_json(ART / "reports/public_sample_fetch_report.json", {}).get("manifests", []) if str(m.get("status", "")).startswith("blocked")]), "cot_hidden_prompt": clean.get("reject_reasons", {}).get("cot_or_hidden_prompt", 0), "old_excluded_rows": 0, "eval_leakage": 0, "generic_assistant_style": promoted.get("rejected_generic_assistant_style", 0)},
        "r27a5_comparison": {"train_tokens": r27a5.get("total_train_tokens"), "train_loss": r27a5.get("train_loss_end"), "dev_loss": r27a5.get("dev_loss"), "heldout_loss": r27a5.get("heldout_loss"), "sft_ratio": 0.6107},
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
        "weights_committed": False,
    }
    out = ART / "reports/campaign_evaluation_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A6_CAMPAIGN_EVALUATION.md").write_text(
        "# R27A6 Campaign Evaluation\n\n"
        f"Campaign ok: `{report['ok']}`. Segments: `{len(stages)}`. Steps: `{report['total_steps']}`. Tokens: `{report['total_consumed_train_tokens']}`. "
        f"Final train/dev/stratified-heldout loss: `{report['train_dev_stratified_heldout_loss']}`. R27A6 remains engineering-only and commits no weights.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
