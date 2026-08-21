from src.training.mlx.r29b2m_r1_dataset import encode_assistant_response_only
from src.training.mlx.r29b2m_r3_loss import validate_encoded_supervision
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer


def test_only_current_assistant_target_is_supervised(tokenizer_path):
    tokenizer = ExactRuntimeTokenizer.from_file(tokenizer_path)
    encoded = encode_assistant_response_only(tokenizer, {"messages": [{"role": "user", "content": "你好。"}], "target": "你好。"})
    validate_encoded_supervision(encoded)
    first = encoded.loss_mask.index(1)
    assert all(value == 0 for value in encoded.loss_mask[:first])
    assert all(value == 1 for value in encoded.loss_mask[first:])
