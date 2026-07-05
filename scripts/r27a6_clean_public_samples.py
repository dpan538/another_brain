#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.public_corpus.clean_public_corpus import clean_record
from src.training.public_corpus.license_admission import write_json
from src.training.public_corpus.fetch_public_samples import write_jsonl

ART = ROOT / "artifacts/r27a6"


def read_jsonl(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").split("\n") if line.strip()]


def main():
    source_counts, language_counts, reject_reasons = {}, {}, {}
    clean_total = 0
    input_total = 0
    for raw_path in sorted((ART / "raw_public_samples").glob("*/raw.jsonl")):
        dataset_id = raw_path.parent.name
        rows = read_jsonl(raw_path)
        input_total += len(rows)
        clean_rows = []
        for row in rows:
            cleaned, reason = clean_record(row)
            if cleaned:
                clean_rows.append(cleaned)
                lang = cleaned.get("language") or cleaned.get("language_hint") or "mixed"
                language_counts[lang] = language_counts.get(lang, 0) + 1
            else:
                reject_reasons[reason] = reject_reasons.get(reason, 0) + 1
        source_counts[dataset_id] = len(clean_rows)
        clean_total += len(clean_rows)
        write_jsonl(ART / "clean_public_samples" / dataset_id / "clean.jsonl", clean_rows)
    report = {"ok": True, "input_rows": input_total, "clean_rows": clean_total, "language_counts": language_counts, "source_counts": source_counts, "reject_reasons": reject_reasons}
    write_json(ART / "reports/cleaning_report.json", report)
    (ROOT / "docs/r27/R27A6_PUBLIC_CORPUS_EXPANSION.md").write_text(
        "# R27A6 Public Corpus Expansion\n\n"
        f"Input rows: `{input_total}`. Clean rows: `{clean_total}`. Language counts: `{language_counts}`.\n\n"
        "Raw and cleaned public text remains ignored under `artifacts/r27a6/`. Product training, phase_4, release weights, and raw corpus commit remain false.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
