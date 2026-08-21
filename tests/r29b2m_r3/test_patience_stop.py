from src.training.mlx.r29b2m_r3_decision import update_patience


def test_three_non_improving_evaluations_stop_stage_b():
    metrics = {"overall_session_pass_rate": 0.8, "session_median": 12, "critical_failure_count": 0, "correction_recovery_rate": 0.8, "referent_binding_rate": 0.8, "constraint_retention_rate": 0.8, "family_metrics": {}}
    assert update_patience(metrics, dict(metrics), 2)["decision"] == "STOP_PATIENCE"
