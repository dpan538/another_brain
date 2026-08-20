from src.training.mlx.r29b2m_r2_schema import ScenarioSpec
from src.training.mlx.r29b2m_r2_validators import validate_constraint_invariant

from .conftest import scenario_dict


def test_dropping_one_active_constraint_or_restoring_removed_one_fails():
    value = scenario_dict("constraint")
    value.update({
        "capability": "two_constraints", "active_constraints": ["安静", "两小时内"],
        "removed_constraints": ["免费"], "must_include_values": ["安静", "两小时内"],
        "correction_before": None, "correction_after": None,
    })
    spec = ScenarioSpec.from_dict(value)
    assert validate_constraint_invariant(spec, "选安静的阅览室，两小时内结束。") == []
    assert validate_constraint_invariant(spec, "选安静的阅览室。")
    assert validate_constraint_invariant(spec, "选免费的安静房间，两小时内结束。")
