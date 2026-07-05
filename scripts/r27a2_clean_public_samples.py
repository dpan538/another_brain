#!/usr/bin/env python3
import json
from collections import Counter
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.public_corpus.clean_public_corpus import clean_record, read_jsonl, write_jsonl

RAW = ROOT / "artifacts/r27a2/raw_public_samples"
CLEAN = ROOT / "artifacts/r27a2/clean_public_samples"
REPORT = ROOT / "artifacts/r27a2/reports/cleaning_report.json"
DOC = ROOT / "docs/r27/R27A2_PUBLIC_CORPUS_CLEANING_SUMMARY.md"


def main():
    stats = {"input_rows": 0, "clean_rows": 0, "rejected_rows": 0, "rejected_by_reason": Counter(), "datasets": {}, "old_excluded_rows_detected": 0, "eval_prompt_leakage_detected": 0}
    seen_hashes = {}
    for path in RAW.glob("**/*.jsonl"):
        dataset_id = path.parent.name
        cleaned = []
        for record in read_jsonl(path):
            stats["input_rows"] += 1
            row, reason = clean_record(record)
            if reason:
                stats["rejected_rows"] += 1
                stats["rejected_by_reason"][reason] += 1
                if reason == "old_excluded_question_pack_rows":
                    stats["old_excluded_rows_detected"] += 1
                if reason == "eval_prompt_leakage":
                    stats["eval_prompt_leakage_detected"] += 1
                continue
            digest = row["normalized_sha256"]
            if digest in seen_hashes:
                stats["rejected_rows"] += 1
                stats["rejected_by_reason"]["dedup"] += 1
                continue
            seen_hashes[digest] = str(path.relative_to(ROOT))
            cleaned.append(row)
        out = CLEAN / dataset_id / "clean.jsonl"
        write_jsonl(out, cleaned)
        stats["clean_rows"] += len(cleaned)
        stats["datasets"][dataset_id] = {"clean_rows": len(cleaned), "path": str(out.relative_to(ROOT))}
    stats["rejected_by_reason"] = dict(stats["rejected_by_reason"])
    stats["ok"] = True
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text(
        "# R27A2 Public Corpus Cleaning Summary\n\n"
        f"Input rows: `{stats['input_rows']}`. Clean rows: `{stats['clean_rows']}`. Rejected rows: `{stats['rejected_rows']}`.\n\n"
        "The cleaner drops PII, secrets, CoT/hidden prompt markers, toxic snippets, old excluded question-pack rows, and over/under-length rows. "
        "Cleaned public samples stay under ignored `artifacts/r27a2/clean_public_samples/`.\n",
        encoding="utf-8"
    )
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
