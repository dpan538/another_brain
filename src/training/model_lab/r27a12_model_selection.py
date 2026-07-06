from __future__ import annotations

from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, read_json, write_json, write_text
from src.training.campaign.disk_reclaim import disk_free_report
from src.training.eval.near100m_budget_planner import plan_near100m_budget
from src.training.model_lab.r27a11_scale_catalog import params_for_r27a11


ART = ROOT / "artifacts/r27a12"
REPORTS = ART / "reports"
PRIOR_A11_ROOT = ROOT.parent / "another_brain_train_r27a11"


def _read_prior_a11_smoke() -> dict[str, Any]:
    candidates = [
        ROOT / "artifacts/r27a11/reports/scale_smoke.json",
        PRIOR_A11_ROOT / "artifacts/r27a11/reports/scale_smoke.json",
    ]
    for path in candidates:
        data = read_json(path, {})
        if data:
            data["_source"] = str(path)
            return data
    return {}


def _smoke_ok(smoke: dict[str, Any], label: str) -> bool:
    for row in smoke.get("results", []):
        if row.get("candidate") == label:
            return bool(row.get("ok") and row.get("device") == "mps")
    return False


def _budget_by_label(plan: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(row.get("label")): row for row in plan.get("candidates", [])}


def select_budgetfit_model(root: Path = ROOT) -> dict[str, Any]:
    plan = plan_near100m_budget(root)
    budget = _budget_by_label(plan)
    smoke = _read_prior_a11_smoke()
    disk = disk_free_report()
    blockers: list[str] = []
    selected = None
    reasons = []
    for candidate in ["new_96m", "new_90m", "new_80m", "new_60m"]:
        row = budget.get(candidate, {})
        candidate_reasons = []
        if not row.get("fits_full_static_100mb"):
            candidate_reasons.append("full_static_budget_not_fit")
        if not _smoke_ok(smoke, candidate):
            candidate_reasons.append("mps_smoke_missing_or_failed")
        if int(disk["free_bytes"]) < 35_000_000_000:
            candidate_reasons.append("disk_below_training_minimum")
        if not candidate_reasons and selected is None:
            selected = candidate
            reasons.append(f"{candidate} is the highest-priority q4 product-path candidate with budget, MPS smoke, and disk gates passing.")
        budget.setdefault(candidate, {})["r27a12_candidate_reasons"] = candidate_reasons
    if selected is None:
        blockers.append("no_product_path_candidate_passed_selection")
    report = {
        "ok": selected is not None,
        "created_at_utc": now_utc(),
        "selected_model": selected,
        "selected_params": params_for_r27a11(selected) if selected else None,
        "selected_device": "mps" if selected else None,
        "selection_priority": ["new_96m", "new_90m", "new_80m", "new_60m"],
        "candidate_budget_rows": [budget.get(label, {"label": label}) for label in ["new_96m", "new_90m", "new_80m", "new_60m", "new_100m_research"]],
        "research_only": {
            "new_100m_research": "q4 exceeds full static 100MB budget",
            "100m_q3_q2_75": "research-only until B-line implements loader and packing compatibility",
        },
        "disk": disk,
        "smoke_source": smoke.get("_source"),
        "smoke_selected_product_path_model": smoke.get("selected_product_path_model"),
        "reasons": reasons,
        "blockers": blockers,
        **NON_CLAIMS,
    }
    write_json(REPORTS / "model_selection.json", report)
    write_text(ROOT / "docs/r27/R27A12_BUDGETFIT_MODEL_SELECTION.md", render_model_selection_doc(report))
    return report


def render_model_selection_doc(report: dict[str, Any]) -> str:
    rows = "\n".join(
        f"| `{row.get('label')}` | {row.get('params')} | {row.get('remaining_bytes_under_100mb')} | `{row.get('classification')}` | `{row.get('r27a12_candidate_reasons', [])}` |"
        for row in report.get("candidate_budget_rows", [])
    )
    return f"""# R27A12 Budgetfit Model Selection

R27A12 keeps the near-100M target but only selects a q4 product-path model that fits the full static 100MB budget and has prior MPS smoke evidence.

| Candidate | Params | Remaining bytes | Budget class | Selection blockers |
| --- | ---: | ---: | --- | --- |
{rows}

## Decision

- Selected model: `{report.get('selected_model')}`
- Selected params: `{report.get('selected_params')}`
- Selected device: `{report.get('selected_device')}`
- Blockers: `{report.get('blockers')}`

`100M` q4 remains research-only because it exceeds the full static 100MB bundle. q3/q2.75 remain research-only until compatible browser packing and loader support exist.
"""
