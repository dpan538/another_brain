from src.training.mlx.r29b2m_r3_loss import token_weighted_mean


def test_accumulation_normalises_by_supervised_tokens_not_rows():
    assert token_weighted_mean([10.0, 30.0], [2, 6]) == 5.0
    assert token_weighted_mean([10.0, 30.0], [2, 6]) != ((10.0 / 2) + (30.0 / 6)) / 2 + 1
