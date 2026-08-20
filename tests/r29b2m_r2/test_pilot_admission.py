import json
from pathlib import Path

from scripts.r29b2m_r2_dataset_stage import select_pilot
from src.training.mlx.r29b2m_r2_catalog import all_reviewed_scenarios
from src.training.mlx.r29b2m_r2_renderer import render_dataset
from src.training.mlx.r29b2m_r2_validators import eval_contamination_issues, normalize


ROOT = Path(__file__).resolve().parents[2]


def test_pilot_is_exactly_64_by_4_and_has_no_eval_contamination():
    scenarios = select_pilot(all_reviewed_scenarios()[0])
    rows = render_dataset(scenarios, variant_count=4)
    eval_rows = [json.loads(line) for line in (ROOT / "evals/r29b2m_daily_dialogue_v2/sessions.jsonl").read_text(encoding="utf-8").splitlines() if line]
    assert len(scenarios) == 64
    assert len(rows) == 256
    assert len({scenario.family_kind for scenario in scenarios}) == 15
    assert {row["split"] for row in rows} == {"train", "dev"}
    assert len({normalize(row["target"]) for row in rows}) == 192
    assert eval_contamination_issues(rows, eval_rows) == []
