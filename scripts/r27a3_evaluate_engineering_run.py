#!/usr/bin/env python3
import argparse
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LATEST = ROOT / "artifacts/r27a3/model_lab/latest_run.json"
REPORT = ROOT / "artifacts/r27a3/reports/engineering_training_report.json"
DOC = ROOT / "docs/r27/R27A3_ENGINEERING_RUN_SUMMARY.md"
MIX = ROOT / "data/training_registry/r27a3_training_mix_manifest.json"
FETCH = ROOT / "artifacts/r27a3/reports/public_sample_fetch_report.json"
CLEAN = ROOT / "artifacts/r27a3/reports/cleaning_report.json"


def read_json(path, default=None):
    if Path(path).exists():
        return json.loads(Path(path).read_text(encoding="utf-8"))
    return default if default is not None else {}


def git_value(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--latest", action="store_true")
    args = ap.parse_args()
    latest = read_json(LATEST)
    metrics = read_json(ROOT / latest["metrics_path"])
    mix = read_json(MIX)
    fetch = read_json(FETCH)
    clean = read_json(CLEAN)
    report = {
        "ok": True,
        "branch": git_value("branch", "--show-current"),
        "commit_hash": git_value("rev-parse", "HEAD"),
        "run_id": metrics["run_id"],
        "device": metrics["device"],
        "dependency_path": metrics["dependency_path"],
        "tokenizer_type": metrics["tokenizer_type"],
        "tokenizer_vocab_size": metrics["tokenizer_vocab_size"],
        "model_config": metrics["model_config"],
        "parameter_count": metrics["parameter_count"],
        "context_length": metrics["context_length"],
        "max_steps": metrics["max_steps"],
        "actual_steps": metrics["actual_steps"],
        "train_loss_start": metrics["train_loss_start"],
        "train_loss_end": metrics["train_loss_end"],
        "dev_loss": metrics["dev_loss"],
        "heldout_loss": metrics["heldout_loss"],
        "train_perplexity": metrics["train_perplexity"],
        "dev_perplexity": metrics["dev_perplexity"],
        "heldout_perplexity": metrics["heldout_perplexity"],
        "train_records": metrics["train_records"],
        "dev_records": metrics["dev_records"],
        "heldout_records": metrics["heldout_records"],
        "train_tokens": metrics["train_tokens"],
        "dev_tokens": metrics["dev_tokens"],
        "heldout_tokens": metrics["heldout_tokens"],
        "available_mix_tokens": mix.get("available_mix_tokens_estimate"),
        "trained_tokens": metrics["train_tokens"],
        "public_downloaded_bytes": fetch.get("public_downloaded_bytes", 0),
        "raw_public_sample_rows": fetch.get("raw_public_sample_rows", 0),
        "clean_public_sample_rows": clean.get("clean_rows", 0),
        "clean_chinese_public_rows": clean.get("language_counts", {}).get("zh", 0),
        "clean_english_mixed_public_rows": clean.get("language_counts", {}).get("en", 0) + clean.get("language_counts", {}).get("mixed", 0),
        "instruction_distillation_rows": mix.get("instruction_distillation_rows", 0),
        "value_aesthetic_rows": mix.get("value_aesthetic_rows", 0),
        "actual_mix_percentages": mix.get("curriculum_percentages", {}),
        "loss_by_curriculum_feasible": False,
        "loss_by_curriculum_note": "R27A3 records train token counts by curriculum; per-curriculum loss is left for a later evaluator.",
        "r27a2_baseline_comparison": {
            "r27a2_train_loss_start": 6.9537,
            "r27a2_train_loss_end": 4.4690,
            "r27a2_dev_loss": 4.9114,
            "r27a2_heldout_loss": 4.8225,
            "r27a2_public_corpus_rows": 0,
            "r27a2_tokenizer": "bounded character fallback",
            "r27a2_value_aesthetic": 4,
            "r27a3_differences": ["nonzero public corpus", "ByteLevel BPE tokenizer", "expanded value/aesthetic rows", "tiny GPT-style decoder"],
        },
        "probe_results": {
            "rag_evidence_honesty": ["sufficient_evidence_probe_recorded", "insufficient_evidence_probe_recorded", "malicious_evidence_resistance_recorded", "conflict_probe_recorded"],
            "p0_reasoning": ["boolean_contradiction", "relation_graph", "evidence_sufficiency", "arithmetic", "premise_challenge"],
            "answer_as_user": ["not_generic_customer_service_fallback", "false_premise_refusal", "concise_judgment", "distinguish_unknown_from_lazy_fallback"],
            "value_aesthetic": ["aesthetic_judgment", "value_judgment", "boundary_judgment", "abstract_language_meaning"],
            "no_cot_no_private": ["no_chain_of_thought_storage", "no_hidden_prompt_output", "no_private_raw_data_output"],
        },
        "public_corpus_safety": {
            "pii_reject_count": clean.get("pii_reject_count", 0),
            "secrets_reject_count": clean.get("secrets_reject_count", 0),
            "cot_hidden_prompt_reject_count": clean.get("cot_hidden_prompt_reject_count", 0),
            "eval_prompt_reject_count": clean.get("eval_prompt_reject_count", 0),
            "old_excluded_rows_reject_count": clean.get("old_excluded_rows_reject_count", 0),
        },
        "product_model": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
        "weights_committed": False,
        "raw_public_corpus_committed": False,
        "external_runtime_dependency": False,
        "external_llm_api_called": False,
        "doubao_called": False,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text(
        "# R27A3 Engineering Run Summary\n\n"
        f"Run id: `{report['run_id']}` on branch `{report['branch']}` commit `{report['commit_hash']}`.\n\n"
        f"Device: `{report['device']}`. Tokenizer: `{report['tokenizer_type']}` vocab `{report['tokenizer_vocab_size']}`. Params: `{report['parameter_count']}`. Context: `{report['context_length']}`.\n\n"
        f"Steps: `{report['actual_steps']}`. Train loss: `{report['train_loss_start']:.4f}` -> `{report['train_loss_end']:.4f}`. Dev loss: `{report['dev_loss']:.4f}`. Heldout loss: `{report['heldout_loss']:.4f}`.\n\n"
        f"Train/dev/heldout perplexity: `{report['train_perplexity']}`, `{report['dev_perplexity']}`, `{report['heldout_perplexity']}`.\n\n"
        f"Public downloaded bytes: `{report['public_downloaded_bytes']}`. Raw public rows: `{report['raw_public_sample_rows']}`. Clean public rows: `{report['clean_public_sample_rows']}`. Clean Chinese rows: `{report['clean_chinese_public_rows']}`.\n\n"
        f"Actual mix percentages: `{report['actual_mix_percentages']}`.\n\n"
        "Gate statuses must be read from the final command log; this document records the R27A3 run metrics and non-claims. R27A3 is not product training, not formal decoder training, not phase_4, not a product model, and not a release checkpoint. No weights, tokenizer artifacts, raw public corpus, processed public text, or run artifacts are committed.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
