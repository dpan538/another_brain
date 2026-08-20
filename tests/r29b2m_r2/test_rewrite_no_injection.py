from src.training.mlx.r29b2m_r2_schema import ScenarioSpec
from src.training.mlx.r29b2m_r2_validators import validate_rewrite_entailment

from .conftest import scenario_dict


def test_rewrite_rejects_unlicensed_location_injection():
    value = scenario_dict("rewrite")
    value.update({
        "capability": "rewrite", "correction_before": None, "correction_after": None,
        "source_text": "我今天不能按时到。", "requested_transformation": "polite",
        "world_facts": {"late": "不能按时到", "unknown_place": "地点不变"},
        "source_fact_ids": ["late"], "target_fact_ids": ["late"],
        "must_include_values": [],
    })
    spec = ScenarioSpec.from_dict(value)
    assert validate_rewrite_entailment(spec, "抱歉，我今天不能按时到。") == []
    assert validate_rewrite_entailment(spec, "抱歉，我今天不能按时到，地点不变。")
