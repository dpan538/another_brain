import inspect
from pathlib import Path

from src.training.mlx.r29b2m_r1_dataset import encode_assistant_response_only
from src.training.mlx.r29b2m_r1_dataset_seeds import SEEDS
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer


ROOT = Path(__file__).resolve().parents[2]
TOKENIZER = ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json"


def test_seed_catalog_has_320_project_authored_semantic_seeds_without_eval_reads():
    assert len(SEEDS) == 320
    assert len({seed.seed_id for seed in SEEDS}) == 320
    assert {seed.bucket for seed in SEEDS} == {
        "ordinary_short_dialogue", "follow_up_and_referent", "correction_and_repair",
        "constraint_retention", "rewrite_and_summary", "planning_and_comparison",
        "uncertainty_and_clarification", "identity_privacy_voice_boundary",
    }
    source = inspect.getsource(__import__("src.training.mlx.r29b2m_r1_dataset_seeds", fromlist=["*"]))
    assert "evals/r29b2m_daily_dialogue_v2" not in source


def test_assistant_only_mask_covers_current_target_and_eos_only():
    tokenizer = ExactRuntimeTokenizer.from_file(TOKENIZER)
    row = {
        "messages": [
            {"role": "user", "content": "给我两个选项。"},
            {"role": "assistant", "content": "一个近，一个安静。"},
            {"role": "user", "content": "第二个。"},
        ],
        "target": "那就选安静的。",
        "question_type": "referent",
        "answer_policy": "short_natural_bounded_no_fallback",
    }
    encoded = encode_assistant_response_only(tokenizer, row)
    assert encoded.token_ids[-1] == tokenizer.eos
    assert sum(encoded.loss_mask) == encoded.assistant_target_token_count
    assert encoded.loss_mask[: encoded.prompt_token_count - 1] == (0,) * (encoded.prompt_token_count - 1)
    assert encoded.loss_mask[encoded.prompt_token_count - 1 :] == (1,) * encoded.assistant_target_token_count
