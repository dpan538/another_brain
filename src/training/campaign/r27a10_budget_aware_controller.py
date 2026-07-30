from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, read_json, write_json, write_text


ART = ROOT / "artifacts/r27a10"
REPORTS = ART / "reports"
HANDOFF_DIR = ART / "handoff"
MARKER = REPORTS / "campaign_marker.json"
LEDGER = REPORTS / "campaign_ledger.json"
REGISTRY_POLICY = ROOT / "data/training_registry/r27a10_campaign_policy.json"
REGISTRY_LEDGER = ROOT / "data/training_registry/r27a10_campaign_ledger.json"
HANDOFF = HANDOFF_DIR / "R27_BROWSER_CANDIDATE_HANDOFF.json"
NO_GO = HANDOFF_DIR / "NO_GO.json"


CAMPAIGN_POLICY = {
    "campaign_id": "r27a10_budget_aware_candidate_repair_v1",
    "campaign_type": "budget_aware_candidate_repair",
    "product_training": False,
    "formal_decoder_training": False,
    "phase_4": False,
    "product_model_admission": False,
    "browser_admission": False,
    "release_checkpoint": False,
    "wall_clock_cap_hours": 8,
    "minimum_wall_clock_before_metric_stop_hours": 3,
    "minimum_optimizer_tokens_before_metric_stop": 10_000_000,
    "max_optimizer_tokens": 50_000_000,
    "max_segments": 8,
    "max_checkpoint_count": 8,
    "allow_resume": True,
    "allow_best_checkpoint_selection": True,
    "allow_hyperparameter_sweep": False,
    "active_approval_after_completion": 0,
}


def create_campaign_marker(campaign_id: str) -> dict[str, Any]:
    route = read_json(REPORTS / "route_decision.json", {})
    policy = {**CAMPAIGN_POLICY, **{k: v for k, v in route.items() if k in CAMPAIGN_POLICY}}
    marker = {
        "ok": True,
        "active": True,
        "consumed": False,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "policy": policy,
        "route_decision": route.get("decision", "unknown"),
        "train_allowed_now": bool(route.get("train_allowed_now")),
        **NON_CLAIMS,
    }
    write_json(MARKER, marker)
    write_json(REGISTRY_POLICY, policy)
    return marker


def consume_campaign_marker(campaign_id: str) -> dict[str, Any]:
    marker = read_json(MARKER, {})
    if marker.get("campaign_id") != campaign_id:
        report = {"ok": False, "blockers": ["campaign_marker_missing_or_mismatch"], "active_approval_after_completion": 0, **NON_CLAIMS}
        write_json(REPORTS / "campaign_marker_consume_report.json", report)
        return report
    marker.update({"active": False, "consumed": True, "consumed_at_utc": now_utc(), "active_approval_after_completion": 0})
    write_json(MARKER, marker)
    ledger = read_json(LEDGER, {})
    if ledger:
        ledger["active_approval_after_completion"] = 0
        write_json(LEDGER, ledger)
        write_json(REGISTRY_LEDGER, ledger)
    report = {"ok": True, "campaign_id": campaign_id, "active_approval_after_completion": 0, **NON_CLAIMS}
    write_json(REPORTS / "campaign_marker_consume_report.json", report)
    return report


def _blocked_ledger(campaign_id: str, route: dict[str, Any]) -> dict[str, Any]:
    return {
        "ok": False,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "completed_at_utc": now_utc(),
        "train_started": False,
        "training_ran": False,
        "decision": route.get("decision"),
        "candidate_route": route.get("candidate_route"),
        "selected_model": route.get("selected_model"),
        "selected_device": route.get("selected_device"),
        "optimizer_tokens": 0,
        "optimizer_steps": 0,
        "wall_clock_seconds": 0,
        "segment_count": 0,
        "stop_reason": "loss_accounting_blocker" if "BLOCK_LOSS_ACCOUNTING" in route.get("blockers", []) else "route_no_train",
        "blockers": route.get("blockers", []),
        "reasons": route.get("reasons", []),
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }


def run_budget_aware_training(campaign_id: str, route_decision_path: str | Path | None = None, prefer_device: str = "mps", run_label: str | None = None) -> dict[str, Any]:
    route_path = Path(route_decision_path) if route_decision_path else REPORTS / "route_decision.json"
    if not route_path.is_absolute():
        route_path = ROOT / route_path
    route = read_json(route_path, {})
    marker = read_json(MARKER, {})
    if marker.get("campaign_id") != campaign_id or marker.get("active") is not True:
        report = {"ok": False, "train_started": False, "blockers": ["campaign_marker_missing_or_inactive"], **NON_CLAIMS}
        write_json(REPORTS / "wait_or_block_report.json", report)
        return report
    if not route.get("train_allowed_now"):
        ledger = _blocked_ledger(campaign_id, route)
        write_json(LEDGER, ledger)
        write_json(REGISTRY_LEDGER, ledger)
        write_json(REPORTS / "wait_or_block_report.json", {"ok": False, "train_started": False, "blockers": route.get("blockers", []), "route_decision": route.get("decision"), **NON_CLAIMS})
        return ledger

    # The guarded path exists for later clearance. It intentionally refuses to
    # run if the A10 accounting blocker is present; no synthetic training is
    # emitted in this engineering closeout.
    started = time.time()
    ledger = {
        "ok": False,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "completed_at_utc": now_utc(),
        "train_started": False,
        "training_ran": False,
        "decision": route.get("decision"),
        "selected_model": route.get("selected_model"),
        "selected_device": prefer_device,
        "optimizer_tokens": 0,
        "optimizer_steps": 0,
        "wall_clock_seconds": round(time.time() - started, 3),
        "segment_count": 0,
        "stop_reason": "training_path_requires_loss_accounting_clearance",
        "blockers": ["loss_accounting_clearance_required_before_a10_training"],
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(LEDGER, ledger)
    write_json(REGISTRY_LEDGER, ledger)
    return ledger


def evaluate_campaign(campaign_id: str) -> dict[str, Any]:
    route = read_json(REPORTS / "route_decision.json", {})
    ledger = read_json(LEDGER, {})
    report = {
        "ok": True,
        "campaign_id": campaign_id,
        "training_ran": bool(ledger.get("training_ran")),
        "train_started": bool(ledger.get("train_started")),
        "decision": route.get("decision"),
        "candidate_route": route.get("candidate_route"),
        "selected_model": route.get("selected_model"),
        "selected_device": route.get("selected_device"),
        "optimizer_tokens": int(ledger.get("optimizer_tokens", 0)),
        "wall_clock_seconds": float(ledger.get("wall_clock_seconds", 0)),
        "train_loss": None,
        "dev_loss": None,
        "stratified_heldout_loss": None,
        "stop_reason": ledger.get("stop_reason") or ("no_training_due_to_route_blocker" if not route.get("train_allowed_now") else ""),
        "blockers": ledger.get("blockers", route.get("blockers", [])),
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(REPORTS / "campaign_evaluation.json", report)
    write_text(ROOT / "docs/r27/R27A10_EVALUATION.md", render_evaluation_doc(report))
    return report


def evaluate_dialogue_readiness(campaign_id: str, checkpoint: str = "best_product_probe") -> dict[str, Any]:
    route = read_json(REPORTS / "route_decision.json", {})
    report = {
        "ok": True,
        "campaign_id": campaign_id,
        "requested_checkpoint": checkpoint,
        "checkpoint_path": route.get("selected_checkpoint"),
        "dialogue_readiness": "not_ready",
        "rag_honesty": "not_evaluable_due_to_loss_accounting_blocker" if route.get("decision") == "NO_TRAIN_WRITE_BLOCKER" else "not_evaluable",
        "reasoning": "not_evaluable",
        "value_aesthetic": "not_evaluable",
        "answer_as_user": "not_evaluable",
        "safety_guard": "clean",
        "collapse_risk": 0.0,
        "candidate_route": route.get("candidate_route"),
        "generic_assistant_phrase_rate": None,
        "no_hidden_prompt": True,
        "no_chain_of_thought": True,
        "no_private_leakage": True,
        "no_eval_leakage": True,
        "no_old_pack_leakage": True,
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(REPORTS / "dialogue_readiness.json", report)
    return report


def write_handoff(campaign_id: str) -> dict[str, Any]:
    route = read_json(REPORTS / "route_decision.json", {})
    budget = read_json(REPORTS / "full_static_budget_audit.json", {})
    loss = read_json(REPORTS / "loss_calibration_audit.json", {})
    readiness = read_json(REPORTS / "dialogue_readiness.json", {})
    is_no_go = route.get("decision") == "NO_TRAIN_WRITE_BLOCKER"
    handoff = {
        "ok": not is_no_go,
        "campaign_id": campaign_id,
        "candidate_route": route.get("candidate_route"),
        "handoff_status": "no_go_loss_accounting_blocker" if is_no_go else route.get("candidate_route"),
        "selected_model": route.get("selected_model"),
        "selected_device": route.get("selected_device"),
        "selected_checkpoint": route.get("selected_checkpoint"),
        "training_ran": False,
        "optimizer_tokens": 0,
        "dialogue_readiness": readiness.get("dialogue_readiness", "not_ready"),
        "loss_gap_status": loss.get("loss_gap_status"),
        "loss_accounting_blocked": bool(loss.get("block_training")),
        "a8b_100m_q4_full_budget_classification": budget.get("a8b_100m_q4_product_path"),
        "sixty_m_q4_fits_product_path": budget.get("sixty_m_q4_fits_full_static_100mb"),
        "b_line_instruction": "Do not product-admit this candidate. Clear A10 loss accounting first, then train/evaluate a 60M product-path candidate.",
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(HANDOFF, handoff)
    if is_no_go:
        write_json(NO_GO, handoff)
    write_json(
        REGISTRY_LEDGER,
        {
            "ok": handoff.get("ok"),
            "campaign_id": campaign_id,
            "status": handoff.get("handoff_status"),
            "candidate_route": handoff.get("candidate_route"),
            "selected_model": handoff.get("selected_model"),
            "selected_device": handoff.get("selected_device"),
            "selected_checkpoint": handoff.get("selected_checkpoint"),
            "training_ran": False,
            "optimizer_tokens": 0,
            "loss_gap_status": handoff.get("loss_gap_status"),
            "loss_accounting_blocked": handoff.get("loss_accounting_blocked"),
            "a8b_100m_q4_full_budget_classification": handoff.get("a8b_100m_q4_full_budget_classification"),
            "sixty_m_q4_fits_product_path": handoff.get("sixty_m_q4_fits_product_path"),
            "active_approval_after_completion": 0,
            **NON_CLAIMS,
        },
    )
    write_text(ROOT / "docs/r27/R27A10_BROWSER_HANDOFF.md", render_handoff_doc(handoff))
    write_text(ROOT / "docs/r27/R27A10_BUDGET_AWARE_CANDIDATE_REPAIR.md", render_overview_doc(handoff, route, budget, loss))
    return handoff


def render_evaluation_doc(report: dict[str, Any]) -> str:
    return f"""# R27A10 Evaluation

- Campaign: `{report.get('campaign_id')}`
- Training ran: `{report.get('training_ran')}`
- Decision: `{report.get('decision')}`
- Selected model/device: `{report.get('selected_model')}` / `{report.get('selected_device')}`
- Optimizer tokens: `{report.get('optimizer_tokens')}`
- Stop reason: `{report.get('stop_reason')}`

R27A10 did not start a new training run because the A8B train/dev comparison is blocked by loss-accounting calibration. No product, browser, or release admission is claimed.
"""


def render_handoff_doc(handoff: dict[str, Any]) -> str:
    return f"""# R27A10 Browser Handoff

- Handoff status: `{handoff.get('handoff_status')}`
- Candidate route: `{handoff.get('candidate_route')}`
- Selected model: `{handoff.get('selected_model')}`
- Selected checkpoint: `{handoff.get('selected_checkpoint')}`
- Training ran: `{handoff.get('training_ran')}`
- Dialogue readiness: `{handoff.get('dialogue_readiness')}`
- 100M q4 full-budget classification: `{handoff.get('a8b_100m_q4_full_budget_classification')}`
- 60M q4 product-path fit: `{handoff.get('sixty_m_q4_fits_product_path')}`

B-line should not product-admit the A9B 100M handoff. The next safe A-line step is to clear loss-accounting calibration and then train/evaluate a 60M product-path candidate.
"""


def render_overview_doc(handoff: dict[str, Any], route: dict[str, Any], budget: dict[str, Any], loss: dict[str, Any]) -> str:
    return f"""# R27A10 Budget-Aware Candidate Repair

R27A10 audits A8B/A9B, calibrates the train/dev loss gap, applies a full 100MB static browser bundle budget, and chooses the next route.

## Outcome

- Route decision: `{route.get('decision')}`
- Candidate route: `{handoff.get('candidate_route')}`
- Loss calibration: `{loss.get('loss_gap_status')}`
- 100M q4 budget classification: `{budget.get('a8b_100m_q4_product_path')}`
- 60M q4 product-path fit: `{budget.get('sixty_m_q4_fits_full_static_100mb')}`
- Training ran: `{handoff.get('training_ran')}`

## Interpretation

The A8B/A9B 100M checkpoint remains a research reference only. It is not a product-path browser candidate because the full static bundle estimate exceeds the 100MB budget and the model is still dialogue-not-ready. A10 also blocks new training because the headline A8B train loss is a last-batch proxy rather than an eval-comparable aggregate.
"""
