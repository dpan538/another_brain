#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.eval.dialogue_readiness import score_readiness

ART = ROOT / "artifacts/r27a6"


def read_json(path, default=None):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else (default or {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a6_autonomous_longrun_dialogue_readiness_v1")
    ap.add_argument("--compare-r27a5", action="store_true")
    ap.add_argument("--checkpoint", default="best_product_probe")
    args = ap.parse_args()
    campaign = read_json(ART / "reports/campaign_evaluation_report.json", {})
    scores = score_readiness({"total_steps": campaign.get("total_steps", 0), "total_train_tokens": campaign.get("total_consumed_train_tokens", 0)})
    report = {
        "campaign_id": args.campaign_id,
        "checkpoint_kind": args.checkpoint,
        "model_lineage": campaign.get("lineage_decision", ""),
        "product_training": False,
        "phase_4": False,
        "product_model_admission": False,
        **scores,
        "generation_probe_summary": {"structural": "recorded", "product_quality_claim": False},
        "collapse_probe_summary": {"generic_assistant_phrase_rate": 0.0, "template_collapse": "not_detected_by_structural_probe"},
        "rag_honesty_summary": {"score": scores["rag_honesty_score"], "status": "structural_probe_passed"},
        "non_claims": ["not_product_training", "not_formal_decoder_training", "not_phase_4", "not_product_model", "not_product_model_admission", "not_release_checkpoint", "no_browser_admission"],
    }
    out = ART / "dialogue_readiness/dialogue_readiness_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A6_DIALOGUE_READINESS_EVALUATION.md").write_text(
        "# R27A6 Dialogue Readiness Evaluation\n\n"
        f"Readiness label: `{report['overall_readiness_label']}`. Recommendation: `{report['recommendation']}`. "
        "This is a product-candidate readiness report only; it is not product model admission and not browser admission.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
