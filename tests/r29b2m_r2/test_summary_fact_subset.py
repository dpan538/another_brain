from src.training.mlx.r29b2m_r2_schema import ScenarioSpec
from src.training.mlx.r29b2m_r2_validators import validate_summary_subset

from .conftest import scenario_dict


def test_summary_target_facts_must_be_source_subset():
    value = scenario_dict("summary")
    value.update({
        "capability": "short_summary", "correction_before": None, "correction_after": None,
        "source_text": "先买菜，再做饭。", "requested_transformation": "summary",
        "world_facts": {"buy": "买菜", "cook": "做饭", "unknown_budget": "预算三百元"},
        "source_fact_ids": ["buy", "cook"], "target_fact_ids": ["buy", "cook"],
        "must_include_values": [],
    })
    spec = ScenarioSpec.from_dict(value)
    assert validate_summary_subset(spec, "先买菜，再做饭。") == []
    mutated = dict(value)
    mutated["target_fact_ids"] = ["buy", "cook", "unknown_budget"]
    assert validate_summary_subset(ScenarioSpec.from_dict(mutated), "先买菜，再做饭，预算三百元。")
