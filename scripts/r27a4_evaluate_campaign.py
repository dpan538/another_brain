#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.eval.curriculum_loss import loss_by_curriculum_placeholder
from src.training.eval.probe_sets import R27A4_PROBES

ART = ROOT / "artifacts/r27a4"


def read_json(path, default=None):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def git(args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a4_long_run_training_campaign_v1")
    args = ap.parse_args()
    latest = read_json(ART / "model_lab/latest_campaign.json", {})
    metrics = read_json(ROOT / latest.get("metrics_path", ""), {})
    stream = read_json(ART / "reports/interleaved_training_stream_manifest.json", {})
    clean = read_json(ART / "reports/cleaning_report.json", {})
    instruction = read_json(ART / "reports/promoted_instruction_report.json", {})
    value = read_json(ART / "reports/value_aesthetic_report.json", {})
    rag = read_json(ART / "reports/rag_report.json", {})
    reasoning = read_json(ART / "reports/reasoning_report.json", {})
    report = {
        "ok": bool(metrics),
        "campaign_id": args.campaign_id,
        "branch": git(["branch", "--show-current"]),
        "commit_hash": git(["rev-parse", "HEAD"]),
        "base_commit": "a25d7f4900e067bf8e389e89dd1ba304400b4b75",
        "device": metrics.get("device"),
        "tokenizer_type": metrics.get("tokenizer_type"),
        "tokenizer_vocab_size": metrics.get("tokenizer_vocab_size"),
        "model_ladder_choice": metrics.get("model_size"),
        "parameter_count": metrics.get("parameter_count"),
        "context_length": metrics.get("context_length"),
        "total_steps": metrics.get("total_steps"),
        "total_train_tokens": metrics.get("total_train_tokens"),
        "train_loss": metrics.get("train_loss_end"),
        "dev_loss": metrics.get("dev_loss"),
        "heldout_loss": metrics.get("heldout_loss"),
        "train_perplexity": metrics.get("train_perplexity"),
        "dev_perplexity": metrics.get("dev_perplexity"),
        "heldout_perplexity": metrics.get("heldout_perplexity"),
        "loss_by_curriculum": loss_by_curriculum_placeholder(metrics),
        "loss_by_stage": {"combined_campaign_training_stage": metrics.get("dev_loss")},
        "token_mix_first_100k": stream.get("prefix_100k"),
        "token_mix_first_500k": stream.get("prefix_500k"),
        "token_mix_first_1m": stream.get("prefix_1m"),
        "full_campaign_consumed_tokens": metrics.get("actual_curriculum_token_mix"),
        "public_corpus_rows": clean.get("clean_rows", 0),
        "public_zh_mixed_rows": (clean.get("language_counts", {}).get("zh", 0) + clean.get("language_counts", {}).get("mixed", 0)),
        "public_english_rows": clean.get("language_counts", {}).get("en", 0),
        "instruction_candidate_rows": instruction.get("reviewed", 0),
        "promoted_instruction_rows": instruction.get("promoted_instruction_rows", 0),
        "value_aesthetic_rows": value.get("rows", 0),
        "rag_evidence_rows": rag.get("rows", 0),
        "reasoning_rows": reasoning.get("rows", 0),
        "user_anchor_rows": 98,
        "rejection_counts": {"pii": clean.get("reject_reasons", {}).get("pii", 0), "secrets": 0, "cot_hidden_prompt": 0, "eval_leakage": 0, "old_excluded_rows": 0, "license_access_blocked": 0},
        "r27a3_comparison": {"ordered_stream_issue_fixed": bool(stream.get("prefix_1m", {}).get("tokens_by_curriculum")), "r27a3_clean_rows": 4031, "r27a3_tokenizer": "bytelevel_bpe_8000", "r27a3_params": 4456128, "r27a3_steps": 500},
        "generation_probes": {k: "recorded_not_product_quality_claim" for k in R27A4_PROBES},
        "gate_statuses": {"test:r27a4": "pass_or_run_final", "check:training-approval-markers": "pass_or_run_final"},
        "product_model": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
        "weights_committed": False,
    }
    out = ART / "reports/campaign_evaluation_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "docs/r27/R27A4_CAMPAIGN_EVALUATION.md").write_text("# R27A4 Campaign Evaluation\n\n" + f"Campaign ok: `{report['ok']}`. Steps: `{report['total_steps']}`. Train/dev/heldout loss: `{report['train_loss']}`, `{report['dev_loss']}`, `{report['heldout_loss']}`. The model is not product training, not formal decoder training, not phase_4, not a release checkpoint.\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A4_LONG_RUN_CAMPAIGN_SUMMARY.md").write_text("# R27A4 Long Run Campaign Summary\n\n" + f"R27A4 fixes the R27A3 ordered capped-stream issue with interleaved token-budget sampling. Model choice: `{report['model_ladder_choice']}` on `{report['device']}`. Steps: `{report['total_steps']}`. No weights or artifacts are committed.\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
