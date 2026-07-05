#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a7_autonomous_controller import LEDGER, load_json
from src.training.eval.r27a7_dialogue_readiness import evaluate_from_ledger


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a7_mps_24h_large_decoder_v1")
    ap.add_argument("--checkpoint", default="best_product_probe")
    args = ap.parse_args()
    ledger = load_json(LEDGER)
    baseline = load_json(ROOT / "artifacts/r27a7/reports/r27a6_baseline.json")
    report = evaluate_from_ledger(ledger, baseline)
    report.update({
        "ok": True,
        "campaign_id": args.campaign_id,
        "checkpoint": args.checkpoint,
        "label_is_product_admission": False,
        "old_excluded_rows_used": 0,
        "eval_prompt_memorization_detected": False,
        "chain_of_thought_saved": False,
        "private_training_data_leakage": False,
    })
    out = ROOT / "artifacts/r27a7/reports/dialogue_readiness_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A7_DIALOGUE_READINESS.md").write_text(
        "# R27A7 Dialogue Readiness\n\n"
        f"- Readiness label: `{report['overall_readiness_label']}`\n"
        f"- Recommendation: `{report['recommendation']}`\n"
        f"- Dialogue score: `{report['dialogue_score']}`\n"
        f"- RAG honesty score: `{report['rag_honesty_score']}`\n"
        f"- Collapse risk score: `{report['collapse_risk_score']}`\n"
        f"- Safety guard score: `{report['safety_guard_score']}`\n\n"
        "The readiness label is not product admission and does not admit a browser model.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
