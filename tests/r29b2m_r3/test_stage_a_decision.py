from src.training.mlx.r29b2m_r3_decision import stage_a_decision


def metrics(pass_rate):
    return {"overall_session_pass_rate": pass_rate, "critical_failure_count": 0, "correction_recovery_rate": pass_rate, "referent_binding_rate": pass_rate, "constraint_retention_rate": pass_rate, "family_metrics": {"a": {"pass_rate": pass_rate}, "b": {"pass_rate": pass_rate}, "c": {"pass_rate": pass_rate}}}


def test_stage_a_requires_generated_behaviour_improvement():
    decision = stage_a_decision(metrics(0.40), metrics(0.45), baseline_structural={"mojibake": 1, "role_prefix_leakage": 0, "repeated_output": 2}, current_structural={"mojibake": 0, "role_prefix_leakage": 0, "repeated_output": 1}, checkpoint_integrity=True, exact_resume=True, resource_gate=True, memory_gate=True)
    assert decision["decision"] == "CONTINUE_STAGE_B"
    blocked = stage_a_decision(metrics(0.40), metrics(0.40), baseline_structural={}, current_structural={}, checkpoint_integrity=True, exact_resume=True, resource_gate=True, memory_gate=True)
    assert blocked["decision"] == "BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE"
