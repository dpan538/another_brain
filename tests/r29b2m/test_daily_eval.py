from src.training.mlx.r29b2m_daily_eval import frozen_sessions, session_manifest_sha256, structural_review


def test_frozen_daily_dev_sessions_are_complete_and_grouped_by_session_family():
    sessions = frozen_sessions()
    assert len(sessions) == 120
    assert len({row["session_id"] for row in sessions}) == 120
    assert {row["split"] for row in sessions} == {"dev"}
    for row in sessions:
        assert 1 <= len(row["messages"]) <= 6
        assert row["provenance"] == "project_authored_r29b2m_dev_only"
        assert row["review_status"] == "frozen_dev_review_required"
        assert row["expected_behaviors"]
        assert row["forbidden_behaviors"]
    assert session_manifest_sha256(sessions) == session_manifest_sha256(frozen_sessions())


def test_structural_review_never_uses_exact_answer_matching():
    review = structural_review("用户：�哈哈哈哈")
    assert review["mojibake"] is True
    assert review["role_prefix_leakage"] is True
    assert review["manual_review_needed"] is True
    assert review["automated_behavior_score"] is None
