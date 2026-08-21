import os

from src.training.mlx.r29b2m_r3_checkpoint import CheckpointManager


def test_retention_preserves_best_and_latest(tmp_path):
    manager = CheckpointManager(tmp_path)
    for index, name in enumerate(("rollback", "old", "best", "latest")):
        path = tmp_path / name
        path.mkdir()
        os.utime(path, (index + 1, index + 1))
    removed = manager.retain(protected_checkpoint_ids={"rollback", "best", "latest"})
    assert removed == ["old"]
    assert all((tmp_path / name).is_dir() for name in ("rollback", "best", "latest"))
