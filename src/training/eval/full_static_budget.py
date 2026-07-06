from __future__ import annotations

from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import DEFAULT_B4_STATIC_BUNDLE_BYTES, NON_CLAIMS, ROOT, now_utc, read_json, write_json, write_text
from src.training.model_lab.limited_scale_smoke import params_for


STATIC_BUNDLE_CAP_BYTES = 100_000_000
TOKENIZER_BYTES_ESTIMATE = 4_000_000
RUNTIME_MANIFEST_SHARD_OVERHEAD_BYTES = 8_000_000
RAG_GATES_BYTES_ESTIMATE = 8_000_000
SAFETY_MARGIN_BYTES = 8_000_000


def _classify(total_bytes: int, q_bits: float, implemented: bool = True) -> str:
    if total_bytes <= 85_000_000 and implemented:
        return "product_path_fit"
    if total_bytes <= STATIC_BUNDLE_CAP_BYTES and implemented:
        return "product_path_tight"
    if total_bytes <= STATIC_BUNDLE_CAP_BYTES and not implemented:
        return "research_only_budget_risk"
    if q_bits < 4 and not implemented:
        return "research_only_budget_risk"
    return "impossible_under_100mb"


def _q_model_bytes(params: int, q_bits: float) -> int:
    return int(int(params) * float(q_bits) / 8.0)


def _budget_row(
    *,
    label: str,
    params: int,
    b4_static_bundle_bytes: int,
    q_bits: float = 4.0,
    q_implemented: bool = True,
    source: str = "estimate",
    notes: list[str] | None = None,
) -> dict[str, Any]:
    model_bytes = _q_model_bytes(params, q_bits)
    total = (
        int(b4_static_bundle_bytes)
        + model_bytes
        + TOKENIZER_BYTES_ESTIMATE
        + RUNTIME_MANIFEST_SHARD_OVERHEAD_BYTES
        + RAG_GATES_BYTES_ESTIMATE
        + SAFETY_MARGIN_BYTES
    )
    remaining = STATIC_BUNDLE_CAP_BYTES - total
    return {
        "label": label,
        "params": int(params),
        "q_bits": q_bits,
        "q_implemented": q_implemented,
        "model_bytes": model_bytes,
        "b4_static_bundle_bytes": int(b4_static_bundle_bytes),
        "tokenizer_bytes_estimate": TOKENIZER_BYTES_ESTIMATE,
        "runtime_manifest_shard_overhead_bytes": RUNTIME_MANIFEST_SHARD_OVERHEAD_BYTES,
        "rag_gates_bytes_estimate": RAG_GATES_BYTES_ESTIMATE,
        "safety_margin_bytes": SAFETY_MARGIN_BYTES,
        "full_static_bundle_estimate_bytes": total,
        "remaining_bytes_under_100mb": remaining,
        "fits_full_static_100mb": remaining >= 0 and q_implemented,
        "classification": _classify(total, q_bits, q_implemented),
        "source": source,
        "notes": notes or [],
    }


def _b4_bundle_bytes(root: Path = ROOT) -> tuple[int, str]:
    intake = read_json(root / "artifacts/r27a10/reports/a8b_a9b_intake.json", {})
    b4 = intake.get("inputs", {}).get("b4_bundle_source", {})
    if isinstance(b4.get("bytes"), int):
        return int(b4["bytes"]), str(b4.get("source", "a10_intake"))
    return DEFAULT_B4_STATIC_BUNDLE_BYTES, "user_supplied_r27a10_known_b4_actual"


def audit_full_static_budget(root: Path = ROOT) -> dict[str, Any]:
    a8b_budget = read_json(root / "artifacts/r27a8b/reports/100mb_budget.json", {})
    b4_bytes, b4_source = _b4_bundle_bytes(root)
    a8b_params = int(a8b_budget.get("parameter_count") or params_for("new_100m"))
    rows = [
        _budget_row(
            label="a8b_100m_q4_candidate",
            params=a8b_params,
            b4_static_bundle_bytes=b4_bytes,
            q_bits=4.0,
            q_implemented=True,
            source="a8b_report_plus_full_static_budget",
            notes=["A8B/A9B previously counted this as fitting under a model-side q4 estimate."],
        ),
        _budget_row(label="new_60m_q4_candidate", params=params_for("new_60m"), b4_static_bundle_bytes=b4_bytes, q_bits=4.0),
        _budget_row(
            label="a8b_100m_q3_estimate_unimplemented",
            params=a8b_params,
            b4_static_bundle_bytes=b4_bytes,
            q_bits=3.0,
            q_implemented=False,
            source="compression_estimate_only",
            notes=["q3/q2.5 compression is not implemented in this project path and cannot justify product-path handoff."],
        ),
        _budget_row(label="new_125m_q4_estimate", params=params_for("new_125m"), b4_static_bundle_bytes=b4_bytes, q_bits=4.0),
        _budget_row(label="new_150m_q4_estimate", params=params_for("new_150m"), b4_static_bundle_bytes=b4_bytes, q_bits=4.0),
        _budget_row(label="0_5b_q4_estimate_only", params=500_000_000, b4_static_bundle_bytes=b4_bytes, q_bits=4.0),
        _budget_row(label="2b_q4_estimate_only", params=2_000_000_000, b4_static_bundle_bytes=b4_bytes, q_bits=4.0),
    ]
    by_label = {row["label"]: row for row in rows}
    a8b_full = by_label["a8b_100m_q4_candidate"]
    sixty = by_label["new_60m_q4_candidate"]
    report = {
        "ok": True,
        "created_at_utc": now_utc(),
        "static_bundle_cap_bytes": STATIC_BUNDLE_CAP_BYTES,
        "b4_static_bundle_bytes": b4_bytes,
        "b4_static_bundle_source": b4_source,
        "budget_components": {
            "tokenizer_bytes_estimate": TOKENIZER_BYTES_ESTIMATE,
            "runtime_manifest_shard_overhead_bytes": RUNTIME_MANIFEST_SHARD_OVERHEAD_BYTES,
            "rag_gates_bytes_estimate": RAG_GATES_BYTES_ESTIMATE,
            "safety_margin_bytes": SAFETY_MARGIN_BYTES,
        },
        "candidates": rows,
        "a8b_100m_q4_product_path": a8b_full["classification"],
        "a8b_100m_q4_fits_full_static_100mb": a8b_full["fits_full_static_100mb"],
        "sixty_m_q4_product_path": sixty["classification"],
        "sixty_m_q4_fits_full_static_100mb": sixty["fits_full_static_100mb"],
        "decision_hint": "prefer_60m_product_path_and_downgrade_100m_to_research" if not a8b_full["fits_full_static_100mb"] and sixty["fits_full_static_100mb"] else "needs_manual_review",
        "notes": [
            "A full static budget must include the B4 bundle, tokenizer, runtime/manifest/shard overhead, RAG/gates, and safety margin.",
            "The A8B 100M q4 candidate no longer fits the current 100MB static browser budget under full-bundle accounting.",
            "The 60M q4 estimate leaves a real browser-delivery margin under the same accounting.",
        ],
        **NON_CLAIMS,
    }
    return report


def write_full_static_budget_report(root: Path = ROOT) -> dict[str, Any]:
    report = audit_full_static_budget(root)
    write_json(root / "artifacts/r27a10/reports/full_static_budget_audit.json", report)
    write_text(root / "docs/r27/R27A10_FULL_100MB_BUDGET_AUDIT.md", render_budget_doc(report))
    return report


def render_budget_doc(report: dict[str, Any]) -> str:
    rows = "\n".join(
        f"| `{row['label']}` | {row['params']} | {row['q_bits']} | {row['model_bytes']} | {row['full_static_bundle_estimate_bytes']} | {row['remaining_bytes_under_100mb']} | `{row['classification']}` |"
        for row in report.get("candidates", [])
    )
    return f"""# R27A10 Full 100MB Budget Audit

R27A10 replaces the prior model-only q4 budget interpretation with a full static browser bundle budget.

## Components

- Static cap: `{report.get('static_bundle_cap_bytes')}` bytes
- B4 static bundle bytes: `{report.get('b4_static_bundle_bytes')}` from `{report.get('b4_static_bundle_source')}`
- Tokenizer estimate: `{report.get('budget_components', {}).get('tokenizer_bytes_estimate')}` bytes
- Runtime/manifest/shard overhead: `{report.get('budget_components', {}).get('runtime_manifest_shard_overhead_bytes')}` bytes
- RAG/gates estimate: `{report.get('budget_components', {}).get('rag_gates_bytes_estimate')}` bytes
- Safety margin: `{report.get('budget_components', {}).get('safety_margin_bytes')}` bytes

## Candidate Table

| Candidate | Params | Quant | Model bytes | Full static estimate | Remaining | Classification |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
{rows}

## Conclusion

The A8B 100M q4 candidate is `{report.get('a8b_100m_q4_product_path')}` under full static bundle accounting. It should be treated as research-only unless a later compression/export path proves the total bundle fits with margin. The 60M q4 path is the current product-size direction.
"""
