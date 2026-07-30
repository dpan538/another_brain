from __future__ import annotations

from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import DEFAULT_B4_STATIC_BUNDLE_BYTES, NON_CLAIMS, ROOT, now_utc, read_json, write_json, write_text
from src.training.model_lab.r27a11_scale_catalog import CANDIDATES, params_for_r27a11


STATIC_BUNDLE_CAP_BYTES = 100_000_000
TOKENIZER_BYTES_ESTIMATE = 4_000_000
SHARD_OVERHEAD_BYTES = 5_000_000
MANIFEST_RUNTIME_OVERHEAD_BYTES = 3_000_000
RAG_GATES_BYTES_ESTIMATE = 8_000_000
SAFETY_MARGIN_BYTES = 8_000_000


def q_model_bytes(params: int, q_bits: float = 4.0) -> int:
    return int(int(params) * float(q_bits) / 8.0)


def classify_budget(total_bytes: int, implemented: bool = True) -> str:
    if total_bytes <= 85_000_000 and implemented:
        return "product_path_fit"
    if total_bytes <= STATIC_BUNDLE_CAP_BYTES and implemented:
        return "product_path_tight"
    if not implemented:
        return "research_only_budget_risk"
    return "impossible_under_100mb"


def b4_bundle_bytes(root: Path = ROOT) -> tuple[int, str]:
    intake = read_json(root / "artifacts/r27a10/reports/a8b_a9b_intake.json", {})
    b4 = intake.get("inputs", {}).get("b4_bundle_source", {}) if isinstance(intake, dict) else {}
    if isinstance(b4.get("bytes"), int) and b4["bytes"] > 0:
        return int(b4["bytes"]), str(b4.get("source", "r27a10_intake"))
    return DEFAULT_B4_STATIC_BUNDLE_BYTES, "user_supplied_r27a10_known_b4_actual"


def budget_row(label: str, params: int, b4_static_bundle_bytes: int, q_bits: float = 4.0, q_implemented: bool = True) -> dict[str, Any]:
    model_bytes = q_model_bytes(params, q_bits)
    total = (
        int(b4_static_bundle_bytes)
        + model_bytes
        + TOKENIZER_BYTES_ESTIMATE
        + SHARD_OVERHEAD_BYTES
        + MANIFEST_RUNTIME_OVERHEAD_BYTES
        + RAG_GATES_BYTES_ESTIMATE
        + SAFETY_MARGIN_BYTES
    )
    remaining = STATIC_BUNDLE_CAP_BYTES - total
    return {
        "label": label,
        "params": int(params),
        "q_bits": float(q_bits),
        "q_implemented": bool(q_implemented),
        "model_bytes": model_bytes,
        "b4_static_bundle_bytes": int(b4_static_bundle_bytes),
        "tokenizer_bytes_estimate": TOKENIZER_BYTES_ESTIMATE,
        "shard_overhead_bytes": SHARD_OVERHEAD_BYTES,
        "manifest_runtime_overhead_bytes": MANIFEST_RUNTIME_OVERHEAD_BYTES,
        "rag_gates_bytes_estimate": RAG_GATES_BYTES_ESTIMATE,
        "safety_margin_bytes": SAFETY_MARGIN_BYTES,
        "full_static_bundle_estimate_bytes": total,
        "remaining_bytes_under_100mb": remaining,
        "fits_full_static_100mb": remaining >= 0 and bool(q_implemented),
        "classification": classify_budget(total, bool(q_implemented)),
    }


def max_q4_params_under_budget(b4_static_bundle_bytes: int) -> int:
    non_model = (
        int(b4_static_bundle_bytes)
        + TOKENIZER_BYTES_ESTIMATE
        + SHARD_OVERHEAD_BYTES
        + MANIFEST_RUNTIME_OVERHEAD_BYTES
        + RAG_GATES_BYTES_ESTIMATE
        + SAFETY_MARGIN_BYTES
    )
    return max(0, int((STATIC_BUNDLE_CAP_BYTES - non_model) * 8 / 4))


def plan_near100m_budget(root: Path = ROOT) -> dict[str, Any]:
    b4_bytes, b4_source = b4_bundle_bytes(root)
    q4_labels = ["new_60m", "new_80m", "new_90m", "new_96m", "new_100m_research"]
    rows = [budget_row(label, params_for_r27a11(label), b4_bytes, 4.0, True) for label in q4_labels]
    rows.extend(
        [
            budget_row("100m_q3_research_estimate", params_for_r27a11("new_100m_research"), b4_bytes, 3.0, False),
            budget_row("100m_q2_75_research_estimate", params_for_r27a11("new_100m_research"), b4_bytes, 2.75, False),
            budget_row("new_125m_q4_estimate", params_for_r27a11("new_125m_estimate"), b4_bytes, 4.0, True),
            budget_row("new_150m_q4_estimate", params_for_r27a11("new_150m_estimate"), b4_bytes, 4.0, True),
            budget_row("0_5b_q4_estimate_only", 500_000_000, b4_bytes, 4.0, True),
            budget_row("2b_q4_estimate_only", 2_000_000_000, b4_bytes, 4.0, True),
        ]
    )
    q4_fit = [row for row in rows if row["label"] in q4_labels and row["fits_full_static_100mb"]]
    q4_fit.sort(key=lambda row: int(row["params"]), reverse=True)
    selected = q4_fit[0] if q4_fit else None
    report = {
        "ok": True,
        "created_at_utc": now_utc(),
        "static_bundle_cap_bytes": STATIC_BUNDLE_CAP_BYTES,
        "b4_static_bundle_bytes": b4_bytes,
        "b4_static_bundle_source": b4_source,
        "budget_components": {
            "tokenizer_bytes_estimate": TOKENIZER_BYTES_ESTIMATE,
            "shard_overhead_bytes": SHARD_OVERHEAD_BYTES,
            "manifest_runtime_overhead_bytes": MANIFEST_RUNTIME_OVERHEAD_BYTES,
            "rag_gates_bytes_estimate": RAG_GATES_BYTES_ESTIMATE,
            "safety_margin_bytes": SAFETY_MARGIN_BYTES,
        },
        "max_q4_params_under_full_budget": max_q4_params_under_budget(b4_bytes),
        "candidates": rows,
        "selected_product_path_model": None if selected is None else selected["label"],
        "selected_product_path_params": None if selected is None else selected["params"],
        "selected_product_path_classification": None if selected is None else selected["classification"],
        "selected_research_model": "new_100m_research",
        "selection_reason": "largest_q4_full_bundle_fit" if selected else "no_q4_product_path_fit",
        "q3_q2_75_product_claim_allowed": False,
        **NON_CLAIMS,
    }
    return report


def write_budget_plan(root: Path = ROOT) -> dict[str, Any]:
    report = plan_near100m_budget(root)
    write_json(root / "artifacts/r27a11/reports/near100m_budget_planner.json", report)
    write_text(root / "docs/r27/R27A11_NEAR100M_BUDGET_PLANNER.md", render_budget_doc(report))
    return report


def render_budget_doc(report: dict[str, Any]) -> str:
    rows = "\n".join(
        f"| `{row['label']}` | {row['params']} | {row['q_bits']} | {row['model_bytes']} | {row['full_static_bundle_estimate_bytes']} | {row['remaining_bytes_under_100mb']} | `{row['classification']}` |"
        for row in report.get("candidates", [])
    )
    return f"""# R27A11 Near-100M Budget Planner

R27A11 keeps the target as close to 100M parameters as the full static browser budget allows. It does not claim product admission.

## Inputs

- Static cap: `{report.get('static_bundle_cap_bytes')}` bytes
- B4/B5 static bundle bytes: `{report.get('b4_static_bundle_bytes')}` from `{report.get('b4_static_bundle_source')}`
- Maximum q4 params under full budget: `{report.get('max_q4_params_under_full_budget')}`

## Candidate Table

| Candidate | Params | Quant bits | Model bytes | Full static estimate | Remaining | Classification |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
{rows}

## Selection

- Selected product-path model: `{report.get('selected_product_path_model')}`
- Selected product-path params: `{report.get('selected_product_path_params')}`
- Classification: `{report.get('selected_product_path_classification')}`
- Selection reason: `{report.get('selection_reason')}`

`100M` q3/q2.75 remains a research estimate until compression and loader compatibility are implemented.
"""
