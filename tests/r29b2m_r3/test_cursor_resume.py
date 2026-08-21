from types import SimpleNamespace

from src.training.mlx.r29b2m_r3_trainer import TrainingProgress


def test_cursor_and_counters_restore_exactly():
    loaded = SimpleNamespace(
        campaign_state={"global_optimizer_step": 7, "optimizer_tokens": 900, "assistant_target_tokens": 300, "current_train_loss": 2.0},
        data_cursor={"logical_epoch": 1, "schedule_position": 56, "accumulation_index": 0},
    )
    progress = TrainingProgress.from_checkpoint(loaded)
    assert progress.state_fields()["dataset_cursor"] == 56
    assert progress.optimizer_tokens == 900 and progress.assistant_target_tokens == 300
