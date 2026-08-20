import json
from pathlib import Path

from src.training.mlx.r29b2m_r2_schema import REQUIRED_FIELDS, ScenarioSpec
from src.training.mlx.r29b2m_r2_validators import validate_schema_dict

from .conftest import scenario_dict


ROOT = Path(__file__).resolve().parents[2]


def test_json_and_python_schema_require_all_semantic_fields():
    schema = json.loads((ROOT / "schemas/r29b2m_r2_scenario_spec.schema.json").read_text(encoding="utf-8"))
    assert set(REQUIRED_FIELDS) == set(schema["required"])
    value = scenario_dict()
    value["prompt_variants"] = [
        {**variant, "messages": value["messages"]} for variant in value["prompt_variants"]
    ]
    spec = ScenarioSpec.from_dict(value)
    assert spec.semantic_digest() == spec.semantic_digest()
    assert validate_schema_dict(value) == []


def test_missing_null_capable_field_is_not_treated_as_null():
    value = scenario_dict()
    del value["active_referent"]
    assert validate_schema_dict(value)[0].code == "missing_required_fields"
