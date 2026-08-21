import json
import sys

from src.training.mlx.r29b2m_r3_campaign import CAMPAIGN_ID
from src.training.mlx.r29b2m_r3_checkpoint import CheckpointManager, REQUIRED_CHECKPOINT_FILES
from src.training.mlx.r29b2m_r3_optimizer import create_optimizer
from tests.r29b2m_r3.conftest import tiny_mask_model


def test_checkpoint_is_renamed_only_after_verification(tmp_path):
    model = tiny_mask_model()
    optimizer = create_optimizer(model)
    manager = CheckpointManager(tmp_path / "checkpoints")
    state = {"campaign_id": CAMPAIGN_ID, "accumulation_index": 0, "global_optimizer_step": 1, "optimizer_tokens": 8, "assistant_target_tokens": 4}
    cursor = {"logical_epoch": 0, "schedule_sha256": "a" * 64, "schedule_position": 8, "accumulation_index": 0}
    final, proof = manager.save(
        "checkpoint_1", model=model, optimizer=optimizer, campaign_state=state, data_cursor=cursor,
        metrics={}, lineage={"warm_start": False}, projected_checkpoint_bytes=1,
        verifier_command=[sys.executable, "-c", "import json; print(json.dumps({'valid': True}))"],
    )
    assert proof["independent_process"] is True
    assert all((final / name).is_file() for name in REQUIRED_CHECKPOINT_FILES)
    assert not any(path.name.startswith(".checkpoint_1.tmp") for path in final.parent.iterdir())
