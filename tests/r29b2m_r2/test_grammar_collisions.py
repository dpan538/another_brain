import pytest

from src.training.mlx.r29b2m_r2_validators import detect_grammar_collisions


@pytest.mark.parametrize("bad", ["即可即可", "便够了", "就好。就好。", "现在，另外，", "。。", "；。", "因为："])
def test_old_grammar_collisions_are_rejected(bad):
    assert detect_grammar_collisions(bad)


def test_natural_target_passes_grammar_check():
    assert detect_grammar_collisions("明白，时间改到明天早上。") == []
