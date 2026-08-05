from src.training.mlx.r29b2m_state_capsule import DialogueStateCapsule


def test_correction_replaces_prior_interpretation_and_state_is_bounded():
    state = DialogueStateCapsule(active_topic="晚饭", explicit_constraints=["便宜"])
    state.update(referents=["第二个", "它", "刚才那个", "过期的"], constraints=["安静", "两小时内", "明早", "不打车", "过期"], correction="不是下午，改成明早")
    assert state.latest_user_correction == "不是下午，改成明早"
    assert len(state.recent_referents) == 3
    assert len(state.explicit_constraints) == 4
    assert len(state.render(max_characters=48)) <= 48
    state.reset()
    assert state.render() == ""
