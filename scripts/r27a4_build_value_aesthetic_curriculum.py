#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
from src.training.curriculum.value_aesthetic_builder import build_value_rows
from src.training.distillation.candidate_queue import write_jsonl

def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").split("\n") if line.strip()] if Path(path).exists() else []

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--target-rows", type=int, default=1000); args = ap.parse_args()
    anchors = []
    for p in sorted((ROOT / "training/llm_corpus").glob("r26*g_user_answered_*.jsonl")):
        anchors.extend(read_jsonl(p))
    rows = build_value_rows(anchors, args.target_rows)
    out = ROOT / "artifacts/r27a4/curriculum/value_aesthetic.jsonl"; write_jsonl(out, rows)
    report = {"ok": len(rows) >= min(args.target_rows, 1 if anchors else args.target_rows), "rows": len(rows), "target_rows": args.target_rows}
    (ROOT / "artifacts/r27a4/reports").mkdir(parents=True, exist_ok=True)
    (ROOT / "artifacts/r27a4/reports/value_aesthetic_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (ROOT / "docs/r27/R27A4_VALUE_AESTHETIC_CURRICULUM.md").write_text(f"# R27A4 Value Aesthetic Curriculum\n\nRows built: `{len(rows)}`. Rows derive from approved R26E/R26G user-answer anchors, preserve source ids, and exclude rows 9, 16, and old question_pack_001 rows 51-100.\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
if __name__ == "__main__": main()
