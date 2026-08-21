import shutil

import pytest

from src.training.mlx.r29b2m_r3_checkpoint import checkpoint_resource_gate


def test_checkpoint_write_is_denied_before_crossing_hard_floor(tmp_path):
    free = shutil.disk_usage(tmp_path).free
    with pytest.raises(OSError, match="hard_floor"):
        checkpoint_resource_gate(tmp_path, projected_atomic_write_bytes=free)
