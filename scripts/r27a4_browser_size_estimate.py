#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.model_lab.model_ladder import browser_size_estimates
ap = argparse.ArgumentParser()
ap.add_argument("--campaign-id", default="r27a4_long_run_training_campaign_v1")
args = ap.parse_args()
latest = json.loads((ROOT / "artifacts/r27a4/model_lab/latest_campaign.json").read_text(encoding="utf-8"))
metrics = json.loads((ROOT / latest["metrics_path"]).read_text(encoding="utf-8"))
tok = ROOT / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json"
sizes = browser_size_estimates(metrics["parameter_count"], tok.stat().st_size if tok.exists() else 0)
report = {"ok": True, "campaign_id": args.campaign_id, "checkpoint_path": metrics["checkpoint_path"], "checkpoint_size_bytes": Path(metrics["checkpoint_path"]).stat().st_size, "tokenizer_size_bytes": tok.stat().st_size if tok.exists() else 0, "size_estimates": sizes, "same_origin_static_feasibility": "future_quantization_required", "no_browser_product_model_exists": True, "product_model_admitted": False}
(ROOT / "artifacts/r27a4/reports/browser_size_estimate.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
(ROOT / "docs/r27/R27A4_STATIC_BROWSER_RUNWAY.md").write_text("# R27A4 Static Browser Runway\n\n" + f"Checkpoint size is `{report['checkpoint_size_bytes']}` bytes in ignored artifacts. Estimated int4 size is `{sizes['int4_bytes']}` bytes. No browser product model exists yet, no product model is admitted, and no static artifact is released.\n", encoding="utf-8")
print(json.dumps(report, indent=2, sort_keys=True))
