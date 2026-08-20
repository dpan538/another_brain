from src.training.mlx.r29b2m_r2_catalog import all_reviewed_scenarios
from src.training.mlx.r29b2m_r2_renderer import render_scenario
from src.training.mlx.r29b2m_r2_validators import validate_paired_variation


def test_each_prompt_target_pair_is_parent_bound_and_digest_stable():
    scenario = all_reviewed_scenarios()[0][0]
    rows = render_scenario(scenario)
    assert len(rows) == 6
    assert len({row["variation_pair_id"] for row in rows}) == 6
    assert all(validate_paired_variation(row, scenario) == [] for row in rows)
    mutated = dict(rows[0])
    mutated["semantic_digest"] = "0" * 64
    assert validate_paired_variation(mutated, scenario)
