import pytest

from src.training.mlx.r29b2m_r2_validators import detect_policy_language


@pytest.mark.parametrize("bad", [
    "省掉前情，只接当前追问。",
    "对象保持不变。",
    "最后的信息覆盖旧值。",
    "逐项守住条件，不用额外加限制。",
    "答案继续沿着刚才，不另起话题。",
    "模型应该在回复中绑定对象。",
])
def test_old_policy_targets_are_rejected(bad):
    assert detect_policy_language(bad)


def test_natural_use_of_answer_word_is_allowlisted():
    assert detect_policy_language("这个问题没有统一答案，你可以先看自己的时间。") == []
