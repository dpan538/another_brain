#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
from src.training.curriculum.reasoning_symbolic_builder import build_reasoning_rows
from src.training.distillation.candidate_queue import write_jsonl

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--target-rows", type=int, default=12000); args = ap.parse_args()
    rows = build_reasoning_rows(args.target_rows)
    write_jsonl(ROOT / "artifacts/r27a6/curriculum/reasoning_symbolic.jsonl", rows)
    report = {"ok": len(rows) >= args.target_rows, "rows": len(rows)}
    (ROOT / "artifacts/r27a6/reports").mkdir(parents=True, exist_ok=True)
    (ROOT / "artifacts/r27a6/reports/reasoning_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    with (ROOT / "docs/r27/R27A6_VALUE_RAG_REASONING_EXPANSION.md").open("a", encoding="utf-8") as handle:
        handle.write(f"\nReasoning rows built: `{len(rows)}` across arithmetic, dates, contradiction, set inclusion, relation graph, evidence sufficiency, premise challenge, and unknown-vs-unsupported families. No chain-of-thought is stored.\n")
    print(json.dumps(report, indent=2))
if __name__ == "__main__": main()
