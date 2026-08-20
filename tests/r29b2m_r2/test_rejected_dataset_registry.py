from src.training.mlx.r29b2m_r2_quarantine import (
    REJECTED_R1_MANIFEST_SHA256,
    REJECTED_R1_SESSIONS_SHA256,
    rejected_dataset_registry,
)


def test_rejected_dataset_registry_is_permanent_and_audit_only():
    registry = rejected_dataset_registry()
    assert registry["dataset_status"] == "rejected_systematic_semantic_misalignment"
    assert registry["old_dataset_manifest_sha256"] == REJECTED_R1_MANIFEST_SHA256
    assert registry["old_sessions_sha256"] == REJECTED_R1_SESSIONS_SHA256
    assert registry["policy_language_hits_in_400_reviewed"] == 162
    assert registry["closure_or_collision_hits_in_400_reviewed"] == 83
    assert registry["training_admission"] is False
    assert registry["permitted_use"] == "audit_and_regression_fixture_only"
