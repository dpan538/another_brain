#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a7_autonomous_controller import LEDGER, load_json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a7_mps_24h_large_decoder_v1")
    ap.add_argument("--compare-r27a6", action="store_true")
    args = ap.parse_args()
    ledger = load_json(LEDGER)
    baseline = load_json(ROOT / "artifacts/r27a7/reports/r27a6_baseline.json")
    decision = load_json(ROOT / "artifacts/r27a7/reports/model_scale_decision.json")
    streams = load_json(ROOT / "artifacts/r27a7/reports/training_streams_manifest.json")
    stages = ledger.get("stages", [])
    best = min([s for s in stages if s.get("dev_loss") is not None], key=lambda s: float(s["dev_loss"]), default={})
    report = {
        "ok": ledger.get("ok", False) and ledger.get("campaign_id") == args.campaign_id,
        "campaign_id": args.campaign_id,
        "compare_r27a6": bool(args.compare_r27a6),
        "r27a6_dev_loss": baseline.get("dev_loss"),
        "r27a6_heldout_loss": baseline.get("heldout_loss"),
        "selected_scale": ledger.get("selected_scale") or decision.get("selected_scale"),
        "model_lineage": ledger.get("model_lineage") or decision.get("lineage"),
        "segment_count": ledger.get("segment_count", 0),
        "total_steps": ledger.get("total_steps", 0),
        "total_train_tokens": ledger.get("total_train_tokens", 0),
        "observed_wall_clock_seconds": ledger.get("observed_wall_clock_seconds", 0),
        "stop_reason": ledger.get("stop_reason", ""),
        "best_dev_loss": best.get("dev_loss"),
        "best_heldout_loss": best.get("stratified_heldout_loss"),
        "best_checkpoint_path": best.get("checkpoint_path", ""),
        "mps_available": ledger.get("mps_available", False),
        "device_result": ledger.get("device_result", "unknown"),
        "stream_source": streams.get("source_stream_root", ""),
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
        "weights_committed": False,
    }
    out = ROOT / "artifacts/r27a7/reports/campaign_evaluation_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A7_CAMPAIGN_EVALUATION.md").write_text(
        "# R27A7 Campaign Evaluation\n\n"
        f"- Campaign id: `{args.campaign_id}`\n"
        f"- Selected scale: `{report['selected_scale']}`\n"
        f"- Lineage: `{report['model_lineage']}`\n"
        f"- Segments: `{report['segment_count']}`\n"
        f"- Steps: `{report['total_steps']}`\n"
        f"- Train tokens: `{report['total_train_tokens']}`\n"
        f"- Best dev loss: `{report['best_dev_loss']}`\n"
        f"- Best heldout loss: `{report['best_heldout_loss']}`\n"
        f"- Stop reason: `{report['stop_reason']}`\n\n"
        "This evaluation compares engineering signals only; it is not product model admission.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
