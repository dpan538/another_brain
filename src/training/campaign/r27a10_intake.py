from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / "artifacts/r27a10"
REPORTS = ART / "reports"
HANDOFF = ART / "handoff"
DOCS = ROOT / "docs/r27"

A8B_REPORTS = ROOT / "artifacts/r27a8b/reports"
A8B_HANDOFF = ROOT / "artifacts/r27a8b/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json"
A9B_REPORTS = ROOT / "artifacts/r27a9b/reports"
A9B_HANDOFF = ROOT / "artifacts/r27a9b/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json"
A9B_REGISTRY = ROOT / "data/training_registry/r27a9b_browser_handoff_summary.json"
A8B_LEDGER_REGISTRY = ROOT / "data/training_registry/r27a8b_campaign_ledger.json"

DEFAULT_B4_STATIC_BUNDLE_BYTES = 22_204_089

NON_CLAIMS = {
    "engineering_repair_only": True,
    "product_training": False,
    "formal_decoder_training": False,
    "phase_4": False,
    "product_model": False,
    "product_model_admission": False,
    "browser_admission": False,
    "release_checkpoint": False,
    "weights_committed": False,
    "tokenizer_artifacts_committed": False,
    "artifacts_committed": False,
    "raw_corpus_committed": False,
    "clean_corpus_committed": False,
    "processed_corpus_committed": False,
    "external_llm_api_called": False,
    "doubao_called": False,
}


def now_utc() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_json(path: Path, default: Any = None) -> Any:
    path = Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> Any:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return data


def write_text(path: Path, text: str) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def display_path(path: Path | str | None, root: Path = ROOT) -> str:
    if not path:
        return ""
    p = Path(path)
    if p.is_absolute():
        try:
            return str(p.relative_to(root))
        except ValueError:
            return str(p)
    return str(p)


def _maybe_number(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _discover_b4_bundle_bytes(root: Path = ROOT) -> dict[str, Any]:
    candidates = [
        root / "artifacts/r27b4/reports/static_bundle_budget.json",
        root / "artifacts/r27b4/reports/bundle_budget.json",
        root / "data/training_registry/r27b4_static_delivery_summary.json",
        root / "data/training_registry/r27b4_bundle_summary.json",
    ]
    keys = (
        "b4_static_bundle_bytes",
        "static_bundle_bytes",
        "bundle_bytes",
        "total_static_bytes",
        "vercel_static_bundle_bytes",
    )
    for path in candidates:
        data = read_json(path, None)
        if not isinstance(data, dict):
            continue
        for key in keys:
            value = data.get(key)
            if isinstance(value, int) and value > 0:
                return {"bytes": value, "source": display_path(path, root), "key": key}
    return {
        "bytes": DEFAULT_B4_STATIC_BUNDLE_BYTES,
        "source": "user_supplied_r27a10_known_b4_actual",
        "key": "default_b4_static_bundle_bytes",
    }


def _best_a8b_segment(ledger: dict[str, Any]) -> dict[str, Any]:
    best_path = ledger.get("best_checkpoints", {}).get("best_product_probe_checkpoint") or ledger.get("best_checkpoints", {}).get("best_dev_loss_checkpoint")
    for segment in ledger.get("segments", []):
        if segment.get("checkpoint_path") == best_path:
            return segment
    return {}


def _last_segment(ledger: dict[str, Any]) -> dict[str, Any]:
    segments = ledger.get("segments", [])
    return segments[-1] if segments else {}


def build_a8b_a9b_intake(root: Path = ROOT) -> dict[str, Any]:
    a8b_ledger = read_json(root / "artifacts/r27a8b/reports/campaign_ledger.json", {})
    if not a8b_ledger:
        a8b_ledger = read_json(root / "data/training_registry/r27a8b_campaign_ledger.json", {})
    a8b_eval = read_json(root / "artifacts/r27a8b/reports/campaign_evaluation.json", {})
    a8b_readiness = read_json(root / "artifacts/r27a8b/reports/dialogue_readiness.json", {})
    a8b_budget = read_json(root / "artifacts/r27a8b/reports/100mb_budget.json", {})
    a9b_handoff = read_json(root / "artifacts/r27a9b/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json", {})
    a9b_freeze = read_json(root / "artifacts/r27a9b/reports/freeze_decision.json", {})
    a9b_ranking = read_json(root / "artifacts/r27a9b/reports/candidate_ranking.json", {})
    a9b_summary = read_json(root / "data/training_registry/r27a9b_browser_handoff_summary.json", {})
    best_segment = _best_a8b_segment(a8b_ledger)
    last_segment = _last_segment(a8b_ledger)
    b4 = _discover_b4_bundle_bytes(root)

    final_train = _maybe_number(a8b_eval.get("train_loss"))
    final_dev = _maybe_number(a8b_eval.get("dev_loss"))
    final_heldout = _maybe_number(a8b_eval.get("stratified_heldout_loss"))
    best_dev = _maybe_number(a8b_ledger.get("best_checkpoints", {}).get("best_dev_loss"))
    optimizer_tokens = int(a8b_ledger.get("optimizer_tokens") or a8b_eval.get("optimizer_tokens") or 0)
    min_optimizer = int(a8b_ledger.get("policy", {}).get("minimum_optimizer_tokens_before_metric_stop") or 15_000_000)

    report = {
        "ok": bool(a8b_ledger or a9b_handoff),
        "created_at_utc": now_utc(),
        "inputs": {
            "a8b_reports": display_path(root / "artifacts/r27a8b/reports", root),
            "a8b_handoff": display_path(root / "artifacts/r27a8b/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json", root),
            "a9b_reports": display_path(root / "artifacts/r27a9b/reports", root),
            "a9b_handoff": display_path(root / "artifacts/r27a9b/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json", root),
            "a9b_registry_summary": display_path(root / "data/training_registry/r27a9b_browser_handoff_summary.json", root),
            "b4_bundle_source": b4,
        },
        "a8b": {
            "campaign_id": a8b_ledger.get("campaign_id"),
            "selected_model": a8b_ledger.get("selected_model") or a8b_ledger.get("launch", {}).get("selected_model"),
            "selected_device": a8b_ledger.get("device") or a8b_ledger.get("launch", {}).get("selected_device"),
            "context_length": best_segment.get("context_length") or a8b_ledger.get("launch", {}).get("config", {}).get("selected_context_length"),
            "wall_clock_seconds": a8b_ledger.get("wall_clock_seconds") or a8b_eval.get("wall_clock_seconds"),
            "optimizer_tokens": optimizer_tokens,
            "minimum_optimizer_tokens_before_metric_stop": min_optimizer,
            "optimizer_tokens_below_minimum": optimizer_tokens < min_optimizer,
            "stop_reason": a8b_ledger.get("stop_reason") or a8b_eval.get("stop_reason"),
            "final_train_loss": final_train,
            "final_dev_loss": final_dev,
            "final_stratified_heldout_loss": final_heldout,
            "final_train_dev_gap": None if final_train is None or final_dev is None else final_dev - final_train,
            "best_dev_loss": best_dev,
            "best_dev_segment_index": best_segment.get("segment_index"),
            "best_checkpoint": a8b_ledger.get("best_checkpoints", {}).get("best_product_probe_checkpoint"),
            "final_checkpoint": a8b_ledger.get("best_checkpoints", {}).get("final_checkpoint"),
            "dialogue_readiness": a8b_readiness.get("dialogue_readiness", "unknown"),
            "rag_honesty": a8b_readiness.get("rag_honesty", "unknown"),
            "safety_guard": a8b_readiness.get("safety_guard", "unknown"),
            "collapse_risk": a8b_readiness.get("collapse_risk"),
            "old_model_only_fits_100mb": bool(a8b_budget.get("fits_100mb")),
            "old_q4_total_estimate_bytes": a8b_budget.get("budget", {}).get("q4_total_estimate_bytes"),
            "old_q4_model_bytes": a8b_budget.get("budget", {}).get("q4_model_bytes"),
            "parameter_count": a8b_budget.get("parameter_count") or best_segment.get("parameter_count"),
            "last_segment": {
                "segment_index": last_segment.get("segment_index"),
                "stage_id": last_segment.get("stage_id"),
                "train_loss_end": last_segment.get("train_loss_end"),
                "dev_loss": last_segment.get("dev_loss"),
                "stratified_heldout_loss": last_segment.get("stratified_heldout_loss"),
            },
        },
        "a9b": {
            "selected_candidate_id": a9b_freeze.get("selected_candidate_id") or a9b_handoff.get("candidate_id"),
            "decision": a9b_freeze.get("decision"),
            "handoff_present": bool(a9b_handoff),
            "handoff_status": a9b_handoff.get("handoff_status"),
            "dialogue_readiness_label": a9b_handoff.get("dialogue_readiness_label"),
            "fits_100mb": a9b_handoff.get("fits_100mb"),
            "q4_total_estimate_bytes": a9b_handoff.get("q4_total_estimate_bytes"),
            "micro_recovery_ran": bool(a9b_handoff.get("micro_recovery_ran") or a9b_freeze.get("micro_recovery_ran")),
            "eligible_count": a9b_ranking.get("eligible_count"),
            "registry_summary": a9b_summary,
        },
        "known_a10_findings": [
            "A8B reached the 12h wall-clock cap but did not reach the 15M optimizer-token minimum.",
            "A8B final train loss is much lower than final dev loss and needs calibration before further training decisions.",
            "A9B froze an engineering candidate even though dialogue readiness remained not_ready.",
            "The previous 100MB interpretation used model-side q4 estimates and did not include the B4 static bundle.",
        ],
        **NON_CLAIMS,
    }
    return report


def write_intake_report(root: Path = ROOT) -> dict[str, Any]:
    report = build_a8b_a9b_intake(root)
    write_json(root / "artifacts/r27a10/reports/a8b_a9b_intake.json", report)
    write_text(root / "docs/r27/R27A10_A8B_A9B_INTAKE.md", render_intake_doc(report))
    return report


def render_intake_doc(report: dict[str, Any]) -> str:
    a8b = report.get("a8b", {})
    a9b = report.get("a9b", {})
    b4 = report.get("inputs", {}).get("b4_bundle_source", {})
    return f"""# R27A10 A8B/A9B Intake

R27A10 is audit and repair-selection work only. It is not product training, not formal decoder training, not phase_4, not product admission, and not browser admission.

## A8B Evidence

- Selected model/device/context: `{a8b.get('selected_model')}` / `{a8b.get('selected_device')}` / `{a8b.get('context_length')}`
- Wall clock: `{a8b.get('wall_clock_seconds')}` seconds
- Optimizer tokens: `{a8b.get('optimizer_tokens')}` of minimum `{a8b.get('minimum_optimizer_tokens_before_metric_stop')}`
- Stop reason: `{a8b.get('stop_reason')}`
- Final train/dev/heldout loss: `{a8b.get('final_train_loss')}` / `{a8b.get('final_dev_loss')}` / `{a8b.get('final_stratified_heldout_loss')}`
- Best dev loss: `{a8b.get('best_dev_loss')}` at segment `{a8b.get('best_dev_segment_index')}`
- Dialogue readiness: `{a8b.get('dialogue_readiness')}`
- Previous q4 total estimate: `{a8b.get('old_q4_total_estimate_bytes')}` bytes

## A9B Handoff

- Selected candidate: `{a9b.get('selected_candidate_id')}`
- Decision: `{a9b.get('decision')}`
- Handoff status: `{a9b.get('handoff_status')}`
- Dialogue readiness label: `{a9b.get('dialogue_readiness_label')}`
- Previous fits_100mb: `{a9b.get('fits_100mb')}`
- Micro recovery ran: `{a9b.get('micro_recovery_ran')}`

## B4 Bundle Source

- B4 static bundle bytes used for full-budget audit: `{b4.get('bytes')}`
- Source: `{b4.get('source')}`

## Intake Conclusion

A10 must not treat the A9B handoff as product-path ready. The A8B checkpoint can remain an engineering/research reference, but the loss gap and full static bundle budget have to be calibrated before any further product-path claim.
"""
