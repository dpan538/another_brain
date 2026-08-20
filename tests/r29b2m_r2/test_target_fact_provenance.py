from src.training.mlx.r29b2m_r2_schema import ScenarioSpec
from src.training.mlx.r29b2m_r2_validators import validate_fact_provenance

from .conftest import scenario_dict


def test_unknown_scenario_fact_in_target_fails():
    value = scenario_dict()
    value["world_facts"]["unknown_place"] = "三楼"
    spec = ScenarioSpec.from_dict(value)
    assert validate_fact_provenance(spec, "明白，改到明天早上。") == []
    assert validate_fact_provenance(spec, "明白，改到明天早上，在三楼见。")
