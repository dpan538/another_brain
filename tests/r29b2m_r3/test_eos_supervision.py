from src.training.mlx.r29b2m_r1_dataset import encode_assistant_response_only
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer


def test_eos_is_the_final_supervised_label(tokenizer_path):
    tokenizer = ExactRuntimeTokenizer.from_file(tokenizer_path)
    encoded = encode_assistant_response_only(tokenizer, {"messages": [{"role": "user", "content": "好。"}], "target": "嗯。"})
    assert encoded.label_ids[-1] == tokenizer.eos
    assert encoded.loss_mask[-1] == 1
    assert sum(encoded.loss_mask) == encoded.assistant_target_token_count
