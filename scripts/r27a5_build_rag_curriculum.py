#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
from src.training.curriculum.rag_evidence_builder import build_rag_rows
from src.training.distillation.candidate_queue import write_jsonl

def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").split("\n") if line.strip()] if Path(path).exists() else []

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--target-rows", type=int, default=8000); args = ap.parse_args()
    cards = []
    for p in sorted((ROOT / "knowledge_sources/cards").glob("*.jsonl"))[:20]:
        cards.extend(read_jsonl(p))
    rows = build_rag_rows(cards, args.target_rows)
    write_jsonl(ROOT / "artifacts/r27a5/curriculum/rag_evidence.jsonl", rows)
    report = {"ok": len(rows) >= args.target_rows, "rows": len(rows)}
    (ROOT / "artifacts/r27a5/reports").mkdir(parents=True, exist_ok=True)
    (ROOT / "artifacts/r27a5/reports/rag_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    with (ROOT / "docs/r27/R27A5_VALUE_RAG_REASONING_EXPANSION.md").open("a", encoding="utf-8") as handle:
        handle.write(f"\nRAG/evidence rows built: `{len(rows)}`. Knowledge source cards are evidence packets, not answer banks. Rows cover sufficient, insufficient, conflict, premise, and malicious-evidence cases.\n")
    print(json.dumps(report, indent=2))
if __name__ == "__main__": main()
