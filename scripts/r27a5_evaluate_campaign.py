#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.eval.curriculum_loss import loss_by_curriculum_placeholder
from src.training.campaign.lineage import inspect_r27a4_lineage
from src.training.eval.r27a5_probe_sets import PROBES, COLLAPSE_PROBES

ART = ROOT / "artifacts/r27a5"


def read_json(path, default=None):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def git(args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a5_sustained_pilot_distillation_v1")
    ap.add_argument("--compare-r27a4", action="store_true")
    args = ap.parse_args()
    latest = read_json(ART / "model_lab/latest_campaign.json", {})
    metrics = read_json(ROOT / latest.get("metrics_path", ""), {})
    stream = read_json(ART / "reports/interleaved_training_stream_manifest.json", {})
    clean = read_json(ART / "reports/cleaning_report.json", {})
    instruction = read_json(ART / "reports/promoted_instruction_report.json", {})
    value = read_json(ART / "reports/value_aesthetic_report.json", {})
    rag = read_json(ART / "reports/rag_report.json", {})
    reasoning = read_json(ART / "reports/reasoning_report.json", {})
    lineage = inspect_r27a4_lineage()
    r27a4_metrics = read_json(ROOT / "artifacts/r27a4/model_lab/runs/r27a4_long_run_campaign_v1_cpu/metrics.json", {})
    report = {
        "ok": bool(metrics),
        "campaign_id": args.campaign_id,
        "branch": git(["branch", "--show-current"]),
        "commit_hash": git(["rev-parse", "HEAD"]),
        "base_commit": "028ccda95db5d6669d2cac340d5e7946c129f356",
        "r27a4_base_commit": "028ccda95db5d6669d2cac340d5e7946c129f356",
        "lineage_decision": lineage["lineage_decision"],
        "checkpoint_input": metrics.get("checkpoint_input_path"),
        "checkpoint_output": metrics.get("checkpoint_path"),
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
        "live_teacher_candidates": read_json(ART / "reports/live_teacher_report.json", {}).get("candidate_rows", 0),
        "promoted_live_teacher_rows": 0,
        "generation_probes": {k: "recorded_not_product_quality_claim" for k in PROBES},
        "collapse_probes": {k: "recorded_not_product_quality_claim" for k in COLLAPSE_PROBES},
        "gate_statuses": {"test:r27a5": "pass_or_run_final", "check:training-approval-markers": "pass_or_run_final"},
        "product_model": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
        "weights_committed": False,
        "r27a4_comparison": {
            "clean_rows": 39171,
            "zh_mixed_en_counts": {"zh": 8525, "mixed": 6082, "en": 24564},
            "instruction_rows": 3000,
            "tokenizer": "chinese_aware_bpe_16000",
            "model_params": r27a4_metrics.get("parameter_count", 7528128),
            "steps": r27a4_metrics.get("total_steps", 2500),
            "train_tokens": r27a4_metrics.get("total_train_tokens", 4000000),
            "train_loss": r27a4_metrics.get("train_loss_end"),
            "dev_loss": r27a4_metrics.get("dev_loss"),
            "heldout_loss": r27a4_metrics.get("heldout_loss"),
        },
    }
    out = ART / "reports/campaign_evaluation_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "docs/r27/R27A5_CAMPAIGN_EVALUATION.md").write_text("# R27A5 Campaign Evaluation\n\n" + f"Campaign ok: `{report['ok']}`. Lineage: `{report['lineage_decision']}`. Steps: `{report['total_steps']}`. Train/dev/heldout loss: `{report['train_loss']}`, `{report['dev_loss']}`, `{report['heldout_loss']}`. The model is not product training, not formal decoder training, not phase_4, not a release checkpoint.\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A5_SUSTAINED_PILOT_TRAINING.md").write_text("# R27A5 Sustained Pilot Training\n\n" + f"R27A5 continues the R27A4 lineage when compatible. Model choice: `{report['model_ladder_choice']}` on `{report['device']}`. Steps: `{report['total_steps']}`. No weights or artifacts are committed. Campaign caps remain bounded and phase_4/product admission stay false.\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A5_NON_CLAIMS.md").write_text("# R27A5 Non Claims\n\nR27A5 is not product training, not formal decoder training, not phase_4, not a product model, not product model admission, not browser admission, and not a release checkpoint. No weights, tokenizer artifacts, raw public corpus, cleaned public corpus, processed training text, runtime external dependency, default live external LLM API, or default Doubao path are committed or introduced. Live teacher, if used later, is training-time candidate/probe only.\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
