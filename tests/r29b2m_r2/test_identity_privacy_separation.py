from src.training.mlx.r29b2m_r2_schema import ScenarioSpec
from src.training.mlx.r29b2m_r2_validators import validate_identity_privacy_separation

from .conftest import scenario_dict


def test_identity_and_privacy_answers_cannot_cross_families():
    identity_value = scenario_dict("identity")
    identity_value.update({"capability": "identity_boundary", "correction_before": None, "correction_after": None})
    identity = ScenarioSpec.from_dict(identity_value)
    assert validate_identity_privacy_separation(identity, "我是对话框。") == []
    assert validate_identity_privacy_separation(identity, "我不会提供另一个人的私人电话。")
    privacy_value = scenario_dict("privacy")
    privacy_value.update({"capability": "privacy_boundary", "correction_before": None, "correction_after": None})
    privacy = ScenarioSpec.from_dict(privacy_value)
    assert validate_identity_privacy_separation(privacy, "我不能提供私人电话。") == []
    assert validate_identity_privacy_separation(privacy, "我是对话框。")
