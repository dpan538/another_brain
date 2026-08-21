"""Frozen Stage-A, patience, rollback, and candidate-selection policy."""

from __future__ import annotations

from typing import Any, Sequence


CORE_RATES = ("correction_recovery_rate", "referent_binding_rate", "constraint_retention_rate")


def family_regressions(baseline: dict[str, Any], current: dict[str, Any]) -> dict[str, float]:
    regressions: dict[str, float] = {}
    for family, metrics in current.get("family_metrics", {}).items():
        prior = baseline.get("family_metrics", {}).get(family)
        if prior is not None and float(metrics["pass_rate"]) < float(prior["pass_rate"]):
            regressions[family] = float(metrics["pass_rate"]) - float(prior["pass_rate"])
    return regressions


def stage_a_decision(
    baseline: dict[str, Any],
    current: dict[str, Any],
    *,
    baseline_structural: dict[str, int],
    current_structural: dict[str, int],
    checkpoint_integrity: bool,
    exact_resume: bool,
    resource_gate: bool,
    memory_gate: bool,
) -> dict[str, Any]:
    overall_delta = float(current["overall_session_pass_rate"]) - float(baseline["overall_session_pass_rate"])
    core_deltas = {name: float(current[name]) - float(baseline[name]) for name in CORE_RATES}
    improved_core = [name for name, delta in core_deltas.items() if delta > 0.0]
    family_deltas = {
        family: float(metrics["pass_rate"]) - float(baseline.get("family_metrics", {}).get(family, {"pass_rate": 0.0})["pass_rate"])
        for family, metrics in current.get("family_metrics", {}).items()
    }
    multi_family_improvement = sum(delta > 0 for delta in family_deltas.values()) >= 3 and sum(delta < -0.1 for delta in family_deltas.values()) == 0
    structural_ok = all(int(current_structural.get(name, 0)) <= int(baseline_structural.get(name, 0)) for name in ("mojibake", "role_prefix_leakage"))
    repeated_ok = int(current_structural.get("repeated_output", 0)) <= int(baseline_structural.get("repeated_output", 0)) + 1
    checks = {
        "critical_failures_zero": int(current["critical_failure_count"]) == 0,
        "structural_not_regressed": structural_ok,
        "repeated_output_not_significantly_increased": repeated_ok,
        "at_least_one_core_aggregate_improves": bool(improved_core),
        "overall_plus_three_points_or_equivalent_multi_family": overall_delta >= 0.03 or multi_family_improvement,
        "no_core_aggregate_regression_over_two_points": all(delta >= -0.02 for delta in core_deltas.values()),
        "correction_referent_constraint_no_obvious_regression": all(delta >= -0.02 for delta in core_deltas.values()),
        "checkpoint_integrity": checkpoint_integrity,
        "exact_resume": exact_resume,
        "resource_gate": resource_gate,
        "memory_gate": memory_gate,
    }
    return {
        "decision": "CONTINUE_STAGE_B" if all(checks.values()) else "BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE",
        "checks": checks,
        "overall_pass_rate_delta": overall_delta,
        "core_deltas": core_deltas,
        "improved_core_aggregates": improved_core,
        "family_deltas": family_deltas,
        "family_regressions": family_regressions(baseline, current),
    }


def meaningful_improvement(previous_best: dict[str, Any], current: dict[str, Any]) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if float(current["overall_session_pass_rate"]) - float(previous_best["overall_session_pass_rate"]) >= 0.01:
        reasons.append("overall_pass_rate_plus_one_point")
    if float(current["session_median"]) > float(previous_best["session_median"]):
        reasons.append("median_score_improved")
    for key in CORE_RATES:
        if float(current[key]) - float(previous_best[key]) >= 0.02:
            reasons.append(f"{key}_plus_two_points")
    if int(current["critical_failure_count"]) < int(previous_best["critical_failure_count"]):
        reasons.append("critical_failures_reduced")
    family_improved = any(
        float(metrics["pass_rate"]) > float(previous_best.get("family_metrics", {}).get(family, {"pass_rate": 0.0})["pass_rate"])
        for family, metrics in current.get("family_metrics", {}).items()
    )
    core_regressed = any(float(current[key]) < float(previous_best[key]) - 0.02 for key in CORE_RATES)
    if family_improved and not core_regressed:
        reasons.append("low_family_improved_without_core_regression")
    return bool(reasons), reasons


def update_patience(previous_best: dict[str, Any], current: dict[str, Any], evaluations_without_improvement: int) -> dict[str, Any]:
    improved, reasons = meaningful_improvement(previous_best, current)
    count = 0 if improved else evaluations_without_improvement + 1
    return {
        "meaningful_improvement": improved,
        "reasons": reasons,
        "evaluations_without_meaningful_improvement": count,
        "decision": "STOP_PATIENCE" if count >= 3 else "CONTINUE",
    }


def rollback_reasons(
    previous: dict[str, Any],
    current: dict[str, Any],
    *,
    structural: dict[str, int],
    numeric_finite: bool = True,
    checkpoint_integrity: bool = True,
    resource_gate: bool = True,
    memory_gate: bool = True,
    contamination_free: bool = True,
) -> list[str]:
    reasons: list[str] = []
    if not numeric_finite:
        reasons.append("non_finite_training_state")
    if not checkpoint_integrity:
        reasons.append("checkpoint_integrity_failure")
    if not resource_gate:
        reasons.append("resource_hard_floor_failure")
    if not memory_gate:
        reasons.append("memory_hard_failure")
    if not contamination_free:
        reasons.append("eval_or_dataset_contamination")
    if int(current["critical_failure_count"]) > int(previous["critical_failure_count"]):
        reasons.append("critical_failures_increased")
    if int(structural.get("role_prefix_leakage", 0)) > 0:
        reasons.append("role_prefix_leakage")
    if int(structural.get("mojibake", 0)) > 2:
        reasons.append("systematic_mojibake")
    if int(structural.get("repeated_output", 0)) > 5:
        reasons.append("repeated_output_significantly_increased")
    regressed_core = [key for key in CORE_RATES if float(current[key]) < float(previous[key]) - 0.02]
    if len(regressed_core) > 1:
        reasons.append("more_than_one_core_family_regressed")
    return reasons


def select_candidate(checkpoints: Sequence[dict[str, Any]]) -> dict[str, Any]:
    if not checkpoints:
        raise ValueError("candidate_selection_requires_checkpoints")
    eligible = [item for item in checkpoints if int(item["metrics"]["critical_failure_count"]) == 0]
    if not eligible:
        return {"selected_checkpoint": None, "reason": "no_zero_critical_failure_checkpoint", "ranked": []}
    def key(item: dict[str, Any]):
        metrics = item["metrics"]
        core = sum(float(metrics[name]) for name in CORE_RATES)
        structural_failures = sum(int(value) for value in item.get("structural_failures", {}).values())
        return (
            float(metrics["overall_session_pass_rate"]),
            core,
            -structural_failures,
            float(metrics.get("natural_voice_rate", 0.0)),
            -float(item.get("validation_loss", float("inf"))),
            -float(item.get("typical_answer_characters", float("inf"))),
            -int(item.get("assistant_target_tokens", 0)),
        )
    ranked = sorted(eligible, key=key, reverse=True)
    selected = ranked[0]
    return {
        "selected_checkpoint": selected["checkpoint_id"],
        "selection_policy": [
            "zero critical failures",
            "highest behavioural aggregate",
            "highest correction/referent/constraint aggregate",
            "lowest structural failure rate",
            "better natural voice",
            "lower validation loss",
            "shorter typical answer",
            "earlier checkpoint when tied",
        ],
        "ranked": [item["checkpoint_id"] for item in ranked],
        "rejected_checkpoint_reasons": {
            item["checkpoint_id"]: "lower_behaviour_first_rank" for item in checkpoints if item["checkpoint_id"] != selected["checkpoint_id"]
        },
    }
