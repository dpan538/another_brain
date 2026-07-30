import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
R27A6_LEDGER = ROOT / "data/training_registry/r27a6_autonomous_campaign_ledger.json"
R27A6_DIALOGUE = ROOT / "artifacts/r27a6/dialogue_readiness/dialogue_readiness_report.json"
R27A6_BUDGET = ROOT / "artifacts/r27a6/reports/browser_size_estimate.json"
R27A6_STREAMS = ROOT / "artifacts/r27a6/reports/autonomous_training_streams_manifest.json"
R27A6_DEVICE = ROOT / "artifacts/r27a6/reports/device_probe.json"
R27A6_LINEAGE = ROOT / "artifacts/r27a6/reports/lineage_decision.json"


def load_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default if default is not None else {}
    return json.loads(path.read_text(encoding="utf-8"))


def git_commit(ref="origin/r27a6-autonomous-longrun-dialogue-readiness"):
    try:
        return subprocess.run(["git", "rev-parse", ref], cwd=ROOT, text=True, capture_output=True, check=True).stdout.strip()
    except Exception:
        return ""


def intake_r27a6_evidence(root=ROOT):
    root = Path(root)
    ledger = load_json(root / R27A6_LEDGER.relative_to(ROOT))
    dialogue = load_json(root / R27A6_DIALOGUE.relative_to(ROOT))
    budget = load_json(root / R27A6_BUDGET.relative_to(ROOT))
    streams = load_json(root / R27A6_STREAMS.relative_to(ROOT))
    device = load_json(root / R27A6_DEVICE.relative_to(ROOT))
    lineage = load_json(root / R27A6_LINEAGE.relative_to(ROOT))
    missing = [
        str(p.relative_to(root))
        for p in [
            root / R27A6_LEDGER.relative_to(ROOT),
            root / R27A6_DIALOGUE.relative_to(ROOT),
            root / R27A6_BUDGET.relative_to(ROOT),
            root / R27A6_STREAMS.relative_to(ROOT),
            root / R27A6_DEVICE.relative_to(ROOT),
        ]
        if not p.exists()
    ]
    stages = ledger.get("stages", [])
    best_kind = "best_product_probe"
    best_path = ledger.get("best_checkpoints", {}).get("best_product_probe_checkpoint") or ledger.get("best_checkpoints", {}).get("best_dev_loss_checkpoint") or ledger.get("best_checkpoints", {}).get("final_checkpoint", "")
    best_stage = next((s for s in stages if s.get("checkpoint_path") == best_path), stages[-1] if stages else {})
    model_config = {}
    if best_path:
        metrics_path = root / "artifacts/r27a6/model_lab/runs" / Path(best_path).stem / "metrics.json"
        model_config = load_json(metrics_path).get("model_config", {})
    out = {
        "ok": not missing and bool(ledger.get("ok")),
        "r27a6_completed": bool(ledger.get("ok")) and not missing,
        "r27a6_commit": git_commit(),
        "missing_evidence": missing,
        "best_checkpoint_kind": best_kind,
        "best_checkpoint_path": best_path,
        "tokenizer_path": best_stage.get("tokenizer_path") or lineage.get("tokenizer_path", ""),
        "model_config": model_config,
        "vocab_size": int(model_config.get("vocab_size") or lineage.get("vocab_size") or 16000),
        "params": load_json(root / "artifacts/r27a6/model_lab/runs" / Path(best_path).stem / "metrics.json").get("parameter_count"),
        "dialogue_readiness_label": dialogue.get("overall_readiness_label", "unknown"),
        "dev_loss": best_stage.get("dev_loss"),
        "heldout_loss": best_stage.get("stratified_heldout_loss"),
        "rag_honesty_score": best_stage.get("rag_honesty_score", dialogue.get("rag_honesty_score")),
        "collapse_risk_score": dialogue.get("collapse_risk_score"),
        "browser_budget_status": budget.get("browser_budget_status") or budget.get("recommendation") or "not_product_admitted",
        "lineage_resume_compatible": bool(best_path and Path(root / best_path).exists() and (best_stage.get("tokenizer_path") or lineage.get("tokenizer_path"))),
        "r27a6_device": device.get("device", "unknown"),
        "stream_manifest_present": bool(streams),
    }
    if missing:
        out["blocker"] = "missing_r27a6_evidence"
    return out
