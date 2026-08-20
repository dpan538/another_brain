from collections import Counter
from pathlib import Path

from src.training.mlx.r29b2m_r1_dataset import encode_assistant_response_only
from src.training.mlx.r29b2m_r2_catalog import all_reviewed_scenarios
from src.training.mlx.r29b2m_r2_renderer import render_dataset
from src.training.mlx.r29b2m_r2_validators import concentration_report, normalize
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer


ROOT = Path(__file__).resolve().parents[2]


def test_full_dataset_meets_size_diversity_token_and_family_contracts():
    scenarios, decisions = all_reviewed_scenarios()
    rows = render_dataset(scenarios)
    tokenizer = ExactRuntimeTokenizer.from_file(ROOT / "web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json")
    target_tokens = sum(encode_assistant_response_only(tokenizer, {**row, "question_type": row["family_kind"], "answer_policy": "short_natural_bounded"}).assistant_target_token_count for row in rows)
    capabilities = Counter(scenario.capability for scenario in scenarios)
    assert len(decisions) == 320
    assert Counter(item["decision"] for item in decisions) == {"PASS": 209, "REPAIR": 12, "DROP": 99}
    assert 280 <= len(scenarios) <= 400
    assert 1200 <= len(rows) <= 2400
    assert min(capabilities.values()) >= 8 and len(capabilities) >= 24
    assert len({normalize(row["target"]) for row in rows}) >= 840
    assert target_tokens >= 80_000
    assert concentration_report(rows)["valid"] is True
