from src.training.mlx.r29b2m_r2_schema import ScenarioSpec
from src.training.mlx.r29b2m_r2_validators import validate_referent_invariant

from .conftest import scenario_dict


def test_referent_must_resolve_actual_object_not_describe_policy():
    value = scenario_dict("referent")
    value.update({
        "capability": "referent_order", "active_referent": "红色杯子",
        "alternative_referents": ["蓝色杯子"], "correction_before": None,
        "correction_after": None, "target_fact_ids": [], "must_include_values": [],
    })
    spec = ScenarioSpec.from_dict(value)
    assert validate_referent_invariant(spec, "红色杯子在柜里。") == []
    assert validate_referent_invariant(spec, "对象保持不变。")
    assert validate_referent_invariant(spec, "蓝色杯子在桌上。")
