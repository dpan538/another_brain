#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.model_lab.model_ladder import browser_size_estimates
ap = argparse.ArgumentParser()
ap.add_argument("--campaign-id", default="r27a6_autonomous_longrun_dialogue_readiness_v1")
ap.add_argument("--checkpoint", default="best_product_probe")
args = ap.parse_args()
ledger_path = ROOT / "data/training_registry/r27a6_autonomous_campaign_ledger.json"
ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else {}
best = ledger.get("best_checkpoints", {})
ckpt_path = best.get("best_product_probe_checkpoint") or best.get("best_dev_loss_checkpoint") or best.get("final_checkpoint")
latest = json.loads((ROOT / "artifacts/r27a6/model_lab/latest_campaign.json").read_text(encoding="utf-8"))
metrics = json.loads((ROOT / latest["metrics_path"]).read_text(encoding="utf-8"))
if ckpt_path:
    metrics["checkpoint_path"] = ckpt_path
tok = ROOT / "artifacts/r27a6/model_lab/tokenizer/tokenizer.json"
if not tok.exists():
    tok = ROOT / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json"
sizes = browser_size_estimates(metrics["parameter_count"], tok.stat().st_size if tok.exists() else 0)
ctx = int(metrics.get("context_length") or 256)
param_count = int(metrics["parameter_count"])
report = {"ok": True, "campaign_id": args.campaign_id, "checkpoint_kind": args.checkpoint, "checkpoint_path": metrics["checkpoint_path"], "checkpoint_size_bytes": Path(metrics["checkpoint_path"]).stat().st_size, "tokenizer_path": str(tok.relative_to(ROOT)), "tokenizer_size_bytes": tok.stat().st_size if tok.exists() else 0, "context_length": ctx, "kv_cache_estimate_bytes": ctx * param_count // 64, "browser_memory_footprint_estimate_bytes": sizes["fp16_bytes"] + (ctx * param_count // 64), "webgpu_feasibility": "plausible_after_quantization_and_runtime_work", "wasm_fallback_feasibility": "likely_slow_for_generation", "same_origin_static_asset_estimate": sizes["int4_bytes"] + (tok.stat().st_size if tok.exists() else 0), "quantization_path_options": ["fp16", "int8", "int4"], "wrapper_path": "input/state packet -> local retrieval -> browser LLM draft -> verifier/finalizer/fallback -> answer", "expected_same_origin_static_asset_paths": ["web/static_llm/assets/model-q4.bin", "web/static_llm/assets/tokenizer.json"], "verifier_finalizer_fallback_wrapping_path": "R24/R25/R26/R27/R28 wrappers remain outside the model artifact", "blockers_before_static_artifact": ["quality", "quantization", "tokenizer/runtime compatibility", "static asset packaging", "browser inference runtime", "wrapper integration", "product model card", "product admission gate"], "readiness_recommendation": "continue_training", "size_estimates": sizes, "same_origin_static_feasibility": "future_quantization_required", "no_browser_product_model_exists": True, "static_artifact_released": False, "product_model_admitted": False, "browser_admission": False}
(ROOT / "artifacts/r27a6/reports/browser_size_estimate.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
(ROOT / "docs/r27/R27A6_BROWSER_PRODUCT_RUNWAY.md").write_text("# R27A6 Browser Product Runway\n\n" + f"Checkpoint size is `{report['checkpoint_size_bytes']}` bytes in ignored artifacts. Estimated int4 size is `{sizes['int4_bytes']}` bytes. No browser product model exists yet, no product model is admitted, no browser admission exists, and no static artifact is released.\n", encoding="utf-8")
print(json.dumps(report, indent=2, sort_keys=True))
