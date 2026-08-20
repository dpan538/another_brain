from src.training.mlx.r29b2m_r2_schema import ScenarioSpec
from src.training.mlx.r29b2m_r2_validators import validate_correction_invariant

from .conftest import scenario_dict


def test_correction_requires_new_value_and_rejects_active_old_value():
    spec = ScenarioSpec.from_dict(scenario_dict())
    assert validate_correction_invariant(spec, "明白，改到明天早上。") == []
    assert {issue.code for issue in validate_correction_invariant(spec, "还是安排在下午。")} == {"new_value_missing", "old_value_still_active"}


def test_old_value_may_be_named_only_as_explicitly_cancelled():
    spec = ScenarioSpec.from_dict(scenario_dict())
    assert validate_correction_invariant(spec, "下午的安排取消，改到明天早上。") == []
