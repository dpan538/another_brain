from pathlib import Path

from src.training.mlx.r29b2m_campaign import CampaignPaths, initial_state, read_state, write_heartbeat, write_state


def test_campaign_state_and_heartbeat_are_atomic_and_keep_phase_start(tmp_path: Path):
    paths = CampaignPaths(tmp_path / "artifacts")
    state = initial_state(artifact_root=paths.root, source_revision="abc")
    started = state["phase_started_at"]
    write_state(paths, state)
    loaded = read_state(paths)
    write_heartbeat(paths, loaded)
    assert loaded["state"] == "ORIENTATION"
    assert loaded["phase_started_at"] == started
    assert paths.heartbeat.exists()
