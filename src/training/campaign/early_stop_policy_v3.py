POLICY_V3 = {
    "minimum_wall_clock_before_metric_stop_hours": 4,
    "minimum_optimizer_tokens_before_metric_stop": 15_000_000,
    "minimum_segments_before_metric_stop": 4,
    "hard_stop_allowed_before_minimum": [
        "nan_loss",
        "oom_loop",
        "safety_guard_failure",
        "private_or_eval_leakage",
        "old_excluded_row_leakage",
        "artifact_guard_failure",
        "checkpoint_corruption",
        "active_marker_invalid",
        "disk_space_critical",
        "system_interrupt",
    ],
    "metric_stop_after_minimum": [
        "dev_loss_no_improvement",
        "dialogue_score_no_improvement",
        "rag_honesty_regression",
        "collapse_worsening",
    ],
}


def minimum_budget_met(wall_clock_seconds: float, optimizer_tokens: int, segment_count: int, policy: dict | None = None) -> bool:
    policy = policy or POLICY_V3
    return (
        float(wall_clock_seconds or 0.0) >= float(policy["minimum_wall_clock_before_metric_stop_hours"]) * 3600
        and int(optimizer_tokens or 0) >= int(policy["minimum_optimizer_tokens_before_metric_stop"])
        and int(segment_count or 0) >= int(policy["minimum_segments_before_metric_stop"])
    )


def should_stop_v3(reason: str, wall_clock_seconds: float, optimizer_tokens: int, segment_count: int, policy: dict | None = None) -> tuple[bool, str]:
    policy = policy or POLICY_V3
    if reason in policy["hard_stop_allowed_before_minimum"]:
        return True, reason
    if reason in policy["metric_stop_after_minimum"]:
        if minimum_budget_met(wall_clock_seconds, optimizer_tokens, segment_count, policy):
            return True, reason
        return False, f"defer_{reason}_until_minimum_budget"
    return False, "unknown_stop_reason"
