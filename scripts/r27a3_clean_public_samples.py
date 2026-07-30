#!/usr/bin/env python3
import json
from collections import Counter
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.public_corpus.clean_public_corpus import clean_record, read_jsonl, write_jsonl

RAW = ROOT / "artifacts/r27a3/raw_public_samples"
CLEAN = ROOT / "artifacts/r27a3/clean_public_samples"
REPORT = ROOT / "artifacts/r27a3/reports/cleaning_report.json"
DOC = ROOT / "docs/r27/R27A3_PUBLIC_CORPUS_ACTIVATION.md"


def main():
    stats = {
        "input_rows": 0,
        "clean_rows": 0,
        "rejected_rows": 0,
        "reject_reasons": Counter(),
        "language_counts": Counter(),
        "source_counts": Counter(),
        "dedup_counts": {"exact": 0},
        "pii_reject_count": 0,
        "secrets_reject_count": 0,
        "cot_hidden_prompt_reject_count": 0,
        "old_excluded_rows_reject_count": 0,
        "eval_prompt_reject_count": 0,
    }
    seen = {}
    for path in RAW.glob("*/raw.jsonl"):
        dataset_id = path.parent.name
        cleaned_rows = []
        for record in read_jsonl(path):
            stats["input_rows"] += 1
            row, reason = clean_record(record)
            if reason:
                stats["rejected_rows"] += 1
                stats["reject_reasons"][reason] += 1
                if reason == "pii":
                    stats["pii_reject_count"] += 1
                if reason == "secret":
                    stats["secrets_reject_count"] += 1
                if reason == "cot_or_hidden_prompt":
                    stats["cot_hidden_prompt_reject_count"] += 1
                if reason == "old_excluded_question_pack_rows":
                    stats["old_excluded_rows_reject_count"] += 1
                if reason == "eval_prompt_leakage":
                    stats["eval_prompt_reject_count"] += 1
                continue
            digest = row["normalized_sha256"]
            if digest in seen:
                stats["rejected_rows"] += 1
                stats["reject_reasons"]["dedup_exact"] += 1
                stats["dedup_counts"]["exact"] += 1
                continue
            seen[digest] = dataset_id
            row["source_dataset_id"] = dataset_id
            row["detector_name"] = row.get("detector_name", "heuristic_zh_en_mixed")
            row["language_score"] = row.get("language_score", 1.0)
            cleaned_rows.append(row)
            stats["language_counts"][row.get("language", "mixed")] += 1
        write_jsonl(CLEAN / dataset_id / "clean.jsonl", cleaned_rows)
        stats["source_counts"][dataset_id] = len(cleaned_rows)
        stats["clean_rows"] += len(cleaned_rows)
    stats["reject_reasons"] = dict(stats["reject_reasons"])
    stats["language_counts"] = dict(stats["language_counts"])
    stats["source_counts"] = dict(stats["source_counts"])
    stats["ok"] = stats["clean_rows"] > 0
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text(
        "# R27A3 Public Corpus Activation\n\n"
        "R27A2 was insufficient because public downloaded bytes and public cleaned rows were `0`, so the training scaffold never exercised real public text.\n\n"
        "R27A3 adds engineering-only license admission, bounded source sampling, public cleaning, and artifact-only storage. It does not approve product training, phase_4, release, raw corpus commit, tokenizer artifact commit, or weight commit.\n\n"
        f"Input rows: `{stats['input_rows']}`. Clean public rows: `{stats['clean_rows']}`. Language counts: `{stats['language_counts']}`. Source counts: `{stats['source_counts']}`.\n",
        encoding="utf-8",
    )
    print(json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
