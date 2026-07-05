#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.eval.r27a7_baseline import intake_r27a6_evidence


def main():
    report = intake_r27a6_evidence(ROOT)
    out = ROOT / "artifacts/r27a7/reports/r27a6_baseline.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    doc = ROOT / "docs/r27/R27A7_R27A6_BASELINE.md"
    doc.write_text(
        "# R27A7 R27A6 Baseline\n\n"
        f"- R27A6 completed: `{report['r27a6_completed']}`\n"
        f"- R27A6 commit: `{report.get('r27a6_commit', '')}`\n"
        f"- Best checkpoint kind: `{report.get('best_checkpoint_kind')}`\n"
        f"- Best checkpoint path: `{report.get('best_checkpoint_path')}`\n"
        f"- Tokenizer path: `{report.get('tokenizer_path')}`\n"
        f"- Vocab size: `{report.get('vocab_size')}`\n"
        f"- Params: `{report.get('params')}`\n"
        f"- Dialogue readiness label: `{report.get('dialogue_readiness_label')}`\n"
        f"- Dev loss: `{report.get('dev_loss')}`\n"
        f"- Stratified heldout loss: `{report.get('heldout_loss')}`\n"
        f"- RAG honesty score: `{report.get('rag_honesty_score')}`\n"
        f"- Collapse risk score: `{report.get('collapse_risk_score')}`\n"
        f"- Browser budget status: `{report.get('browser_budget_status')}`\n"
        f"- Resume compatible: `{report.get('lineage_resume_compatible')}`\n\n"
        "R27A7 uses this as evidence only. Missing R27A6 evidence blocks the campaign; no values are fabricated.\n",
        encoding="utf-8",
    )
    if not report["ok"]:
        raise SystemExit(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
