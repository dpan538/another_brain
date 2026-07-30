from __future__ import annotations

from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, read_json, write_json, write_text


ROUTE_LABELS = {
    "TRAIN_60M_PRODUCT_PATH",
    "REPAIR_100M_RESEARCH_PATH",
    "NO_TRAIN_WRITE_BLOCKER",
    "EXPORT_EXISTING_AS_RESEARCH_ONLY",
}


def make_route_decision(root: Path = ROOT) -> dict[str, Any]:
    intake = read_json(root / "artifacts/r27a10/reports/a8b_a9b_intake.json", {})
    loss = read_json(root / "artifacts/r27a10/reports/loss_calibration_audit.json", {})
    budget = read_json(root / "artifacts/r27a10/reports/full_static_budget_audit.json", {})
    blockers: list[str] = []
    reasons: list[str] = []

    a8b_full = budget.get("a8b_100m_q4_product_path", "unknown")
    a8b_full_fit = budget.get("a8b_100m_q4_fits_full_static_100mb") is True
    sixty_fit = budget.get("sixty_m_q4_fits_full_static_100mb") is True
    selected_route = "EXPORT_EXISTING_AS_RESEARCH_ONLY"
    selected_model = "new_100m"
    selected_device = intake.get("a8b", {}).get("selected_device", "mps") or "mps"
    selected_checkpoint = intake.get("a8b", {}).get("best_checkpoint")
    candidate_route = "research_only_not_product_budget_fit"

    if loss.get("loss_gap_status") == "likely_accounting_bug" or loss.get("block_training"):
        selected_route = "NO_TRAIN_WRITE_BLOCKER"
        selected_model = "none"
        selected_checkpoint = None
        candidate_route = "no_go_loss_accounting_blocker"
        blockers.append("BLOCK_LOSS_ACCOUNTING")
        reasons.append("A8B train_loss is a last-batch proxy and is not comparable to dev/heldout loss.")
    elif not a8b_full_fit and sixty_fit:
        selected_route = "TRAIN_60M_PRODUCT_PATH"
        selected_model = "new_60m"
        selected_checkpoint = None
        candidate_route = "product_path_engineering_candidate"
        reasons.append("100M q4 does not fit the full static bundle budget and 60M q4 does.")
    elif not a8b_full_fit:
        selected_route = "EXPORT_EXISTING_AS_RESEARCH_ONLY"
        selected_model = "new_100m"
        candidate_route = "research_only_not_product_budget_fit"
        reasons.append("100M q4 is not product-path fit; no product handoff is allowed.")
    else:
        selected_route = "REPAIR_100M_RESEARCH_PATH"
        selected_model = "new_100m"
        candidate_route = "research_only_budget_tight"
        reasons.append("100M fits only as a tight/research repair candidate, not product admission.")

    if intake.get("a8b", {}).get("dialogue_readiness") == "not_ready":
        reasons.append("A8B dialogue readiness remained not_ready.")
    if intake.get("a8b", {}).get("optimizer_tokens_below_minimum"):
        reasons.append("A8B did not reach its optimizer-token minimum before wall-clock cap.")
    if a8b_full != "product_path_fit":
        reasons.append(f"A8B 100M q4 full-budget classification is {a8b_full}.")

    decision = {
        "ok": True,
        "created_at_utc": now_utc(),
        "decision": selected_route,
        "candidate_route": candidate_route,
        "selected_model": selected_model,
        "selected_device": selected_device,
        "selected_checkpoint": selected_checkpoint,
        "context_length": 256,
        "primary_token_metric": "optimizer_tokens",
        "train_allowed_now": selected_route in {"TRAIN_60M_PRODUCT_PATH", "REPAIR_100M_RESEARCH_PATH"} and not blockers,
        "training_required_now": selected_route == "TRAIN_60M_PRODUCT_PATH" and not blockers,
        "wall_clock_cap_hours": 8 if selected_route == "TRAIN_60M_PRODUCT_PATH" else (4 if selected_route == "REPAIR_100M_RESEARCH_PATH" else 0),
        "minimum_wall_clock_before_metric_stop_hours": 3 if selected_route == "TRAIN_60M_PRODUCT_PATH" else 0,
        "minimum_optimizer_tokens_before_metric_stop": 10_000_000 if selected_route == "TRAIN_60M_PRODUCT_PATH" else 0,
        "max_optimizer_tokens": 50_000_000 if selected_route == "TRAIN_60M_PRODUCT_PATH" else (10_000_000 if selected_route == "REPAIR_100M_RESEARCH_PATH" else 0),
        "max_segments": 8 if selected_route == "TRAIN_60M_PRODUCT_PATH" else (4 if selected_route == "REPAIR_100M_RESEARCH_PATH" else 0),
        "blockers": blockers,
        "reasons": reasons,
        "a8b_100m_product_path_or_research": "product_path" if a8b_full_fit else "research_only",
        "a8b_100m_q4_full_budget_classification": a8b_full,
        "sixty_m_q4_fits_product_path": sixty_fit,
        "loss_gap_status": loss.get("loss_gap_status"),
        "loss_accounting_blocked": bool(loss.get("block_training")),
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    return decision


def write_route_decision(root: Path = ROOT) -> dict[str, Any]:
    decision = make_route_decision(root)
    write_json(root / "artifacts/r27a10/reports/route_decision.json", decision)
    if decision.get("decision") == "NO_TRAIN_WRITE_BLOCKER":
        write_json(
            root / "artifacts/r27a10/reports/BLOCK_NO_TRAIN.json",
            {
                "ok": False,
                "decision": decision.get("decision"),
                "blockers": decision.get("blockers", []),
                "reasons": decision.get("reasons", []),
                "active_approval_after_completion": 0,
                **NON_CLAIMS,
            },
        )
    write_text(root / "docs/r27/R27A10_ROUTE_DECISION.md", render_route_doc(decision))
    return decision


def render_route_doc(decision: dict[str, Any]) -> str:
    reasons = "\n".join(f"- {reason}" for reason in decision.get("reasons", []))
    blockers = "\n".join(f"- `{blocker}`" for blocker in decision.get("blockers", [])) or "- None"
    return f"""# R27A10 Route Decision

## Decision

- Decision: `{decision.get('decision')}`
- Candidate route: `{decision.get('candidate_route')}`
- Selected model: `{decision.get('selected_model')}`
- Selected device: `{decision.get('selected_device')}`
- Train allowed now: `{decision.get('train_allowed_now')}`
- Training required now: `{decision.get('training_required_now')}`
- 100M q4 route: `{decision.get('a8b_100m_product_path_or_research')}`
- 100M q4 full-budget classification: `{decision.get('a8b_100m_q4_full_budget_classification')}`
- 60M q4 product-path fit: `{decision.get('sixty_m_q4_fits_product_path')}`

## Blockers

{blockers}

## Reasons

{reasons}

## Conclusion

A10 does not start a new 60M run while `BLOCK_LOSS_ACCOUNTING` is active. The budget direction is still clear: 60M q4 is the product-size path, while the A8B 100M q4 checkpoint is research-only under full static browser budget accounting.
"""
