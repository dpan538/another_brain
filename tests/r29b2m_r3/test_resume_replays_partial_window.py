from src.training.mlx.r29b2m_r3_checkpoint import replay_cursor_from_last_checkpoint


def test_interrupted_partial_window_replays_from_committed_cursor():
    committed = {"logical_epoch": 2, "schedule_sha256": "b" * 64, "schedule_position": 80, "accumulation_index": 0, "next_session_id": "row_80"}
    replay = replay_cursor_from_last_checkpoint(committed)
    assert replay["schedule_position"] == 80
    assert replay["next_session_id"] == "row_80"
    assert replay["accumulation_index"] == 0
