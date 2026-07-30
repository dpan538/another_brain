#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a7_autonomous_controller import LEDGER, load_json
from src.training.eval.r27a7_budget import browser_budget_report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a7_mps_24h_large_decoder_v1")
    ap.add_argument("--checkpoint", default="best_product_probe")
    args = ap.parse_args()
    ledger = load_json(LEDGER)
    decision = load_json(ROOT / "artifacts/r27a7/reports/model_scale_decision.json")
    stages = ledger.get("stages", [])
    best_path = ledger.get("best_checkpoints", {}).get("best_product_probe_checkpoint") or ledger.get("best_checkpoints", {}).get("best_dev_loss_checkpoint", "")
    best = next((s for s in stages if s.get("checkpoint_path") == best_path), stages[-1] if stages else {})
    params = int(best.get("parameter_count") or decision.get("selected_candidate", {}).get("estimated_params") or 0)
    ckpt = ROOT / best_path if best_path else None
    report = browser_budget_report(params, ckpt.stat().st_size if ckpt and ckpt.exists() else 0)
    report.update({
        "ok": True,
        "campaign_id": args.campaign_id,
        "checkpoint": args.checkpoint,
        "selected_scale": ledger.get("selected_scale") or decision.get("selected_scale"),
        "best_checkpoint_path": best_path,
        "product_model_admitted": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "weights_committed": False,
    })
    out = ROOT / "artifacts/r27a7/reports/100mb_browser_budget_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A7_100MB_BROWSER_BUDGET.md").write_text(
        "# R27A7 100MB Browser Budget\n\n"
        f"- Selected scale: `{report['selected_scale']}`\n"
        f"- Selected model params: `{report['selected_model_params']}`\n"
        f"- Checkpoint size bytes: `{report['checkpoint_size_bytes']}`\n"
        f"- Int4/q4 model plus runtime estimate bytes: `{report['q4_total_estimate_bytes']}`\n"
        f"- Total q4 with app/RAG/verifier estimate bytes: `{report['total_q4_with_app_estimate_bytes']}`\n"
        f"- Fits current 100MB budget: `{report['fits_current_100mb_budget']}`\n"
        f"- 0.5B q4 estimate bytes: `{report['estimate_0_5b_q4_bytes']}`\n"
        f"- 2B q4 estimate bytes: `{report['estimate_2b_q4_bytes']}`\n"
        f"- 0.5B fits current static budget: `{report['0_5b_fits_current_static_budget']}`\n"
        f"- 2B fits current static budget: `{report['2b_fits_current_static_budget']}`\n"
        f"- Recommendation: `{report['recommendation']}`\n\n"
        "This is a budget estimate only. No browser model or release checkpoint is admitted.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
