from src.training.mlx.r29b2m_r3_decision import rollback_reasons


def test_multiple_core_regressions_trigger_rollback():
    prior = {"critical_failure_count": 0, "correction_recovery_rate": 0.9, "referent_binding_rate": 0.9, "constraint_retention_rate": 0.9}
    current = {"critical_failure_count": 0, "correction_recovery_rate": 0.7, "referent_binding_rate": 0.7, "constraint_retention_rate": 0.9}
    assert "more_than_one_core_family_regressed" in rollback_reasons(prior, current, structural={})
