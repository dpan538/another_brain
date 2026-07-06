from __future__ import annotations

from dataclasses import dataclass
from typing import Any


MAX_STATIC_BYTES = 100_000_000
DEFAULT_SAFETY_MARGIN_BYTES = 5_000_000


@dataclass(frozen=True)
class FullBundleBudgetInput:
    current_build_output_bytes: int
    candidate_model_q4_bytes: int = 0
    tokenizer_bytes: int = 0
    shard_overhead_bytes: int = 0
    manifest_overhead_bytes: int = 0
    rag_asset_bytes: int = 0
    runtime_app_bytes: int = 0
    safety_margin_bytes: int = DEFAULT_SAFETY_MARGIN_BYTES
    max_total_static_bytes: int = MAX_STATIC_BYTES
    synthetic: bool = False


def classify_budget(inputs: FullBundleBudgetInput) -> dict[str, Any]:
    if inputs.synthetic or inputs.candidate_model_q4_bytes <= 0:
        return {
            "classification": "synthetic_only",
            "candidate_route": "synthetic",
            "product_path_candidate": False,
            "total_projected_bytes": inputs.current_build_output_bytes,
            "margin_bytes": inputs.max_total_static_bytes - inputs.current_build_output_bytes,
            "blockers": ["no_candidate_model_q4_bytes"],
        }

    incremental = (
        inputs.candidate_model_q4_bytes
        + inputs.tokenizer_bytes
        + inputs.shard_overhead_bytes
        + inputs.manifest_overhead_bytes
    )
    projected = inputs.current_build_output_bytes + incremental
    margin = inputs.max_total_static_bytes - projected
    blockers: list[str] = []

    if inputs.candidate_model_q4_bytes > inputs.max_total_static_bytes:
        classification = "blocked_over_budget"
        route = "blocked"
        blockers.append("candidate_model_q4_exceeds_full_static_budget")
    elif projected > inputs.max_total_static_bytes:
        classification = "research_only_budget_risk"
        route = "research_only"
        blockers.append("candidate_does_not_fit_full_100mb_static_bundle")
    elif margin < inputs.safety_margin_bytes:
        classification = "product_path_tight"
        route = "product_path"
        blockers.append("product_path_margin_below_safety_margin")
    else:
        classification = "product_path_fit"
        route = "product_path"

    return {
        "classification": classification,
        "candidate_route": route,
        "product_path_candidate": route == "product_path",
        "total_projected_bytes": projected,
        "incremental_candidate_bytes": incremental,
        "margin_bytes": margin,
        "blockers": blockers,
        "inputs": {
            "current_build_output_bytes": inputs.current_build_output_bytes,
            "candidate_model_q4_bytes": inputs.candidate_model_q4_bytes,
            "tokenizer_bytes": inputs.tokenizer_bytes,
            "shard_overhead_bytes": inputs.shard_overhead_bytes,
            "manifest_overhead_bytes": inputs.manifest_overhead_bytes,
            "rag_asset_bytes": inputs.rag_asset_bytes,
            "runtime_app_bytes": inputs.runtime_app_bytes,
            "safety_margin_bytes": inputs.safety_margin_bytes,
            "max_total_static_bytes": inputs.max_total_static_bytes,
        },
    }


def inputs_from_reports(bundle_report: dict[str, Any], handoff_candidate: dict[str, Any]) -> FullBundleBudgetInput:
    budget_inputs = handoff_candidate.get("budget_inputs") or {}
    return FullBundleBudgetInput(
        current_build_output_bytes=int(bundle_report.get("build_output_bytes", 0)),
        candidate_model_q4_bytes=int(budget_inputs.get("candidate_model_q4_bytes", 0) or 0),
        tokenizer_bytes=int(budget_inputs.get("tokenizer_bytes", 0) or 0),
        shard_overhead_bytes=int(budget_inputs.get("shard_overhead_bytes", 0) or 0),
        manifest_overhead_bytes=int(budget_inputs.get("manifest_overhead_bytes", 0) or 0),
        rag_asset_bytes=int(bundle_report.get("rag_asset_bytes", 0) or 0),
        runtime_app_bytes=int(bundle_report.get("runtime_app_bytes", 0) or 0),
        max_total_static_bytes=int(bundle_report.get("max_total_static_bytes", MAX_STATIC_BYTES) or MAX_STATIC_BYTES),
        synthetic=handoff_candidate.get("source_kind") == "b2_synthetic_fallback",
    )
