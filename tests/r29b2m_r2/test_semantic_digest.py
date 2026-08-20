from src.training.mlx.r29b2m_r2_schema import ScenarioSpec
from src.training.mlx.r29b2m_r2_validators import validate_semantic_digest

from .conftest import scenario_dict


def test_semantic_digest_changes_when_referent_or_fact_contract_changes():
    original = ScenarioSpec.from_dict(scenario_dict())
    changed = scenario_dict()
    changed["correction_after"] = "后天中午"
    changed["world_facts"]["new_time"] = "后天中午"
    assert original.semantic_digest() != ScenarioSpec.from_dict(changed).semantic_digest()
    assert validate_semantic_digest(original.semantic_digest(), original.semantic_digest()) == []
    assert validate_semantic_digest(original.semantic_digest(), ScenarioSpec.from_dict(changed).semantic_digest())
