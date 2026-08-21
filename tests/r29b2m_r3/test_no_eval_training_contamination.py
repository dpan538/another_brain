from src.training.mlx.r29b2m_r3_sampler import build_epoch_schedule


def test_schedule_contains_only_supplied_train_rows_and_no_targets_are_generated():
    rows = [{"session_id": "train_only", "family_id": "ordinary", "quality_tier": "verified_surface_variant", "target": "固定目标", "token_counts": {"assistant_target_including_eos": 3}}]
    schedule = build_epoch_schedule(rows, epoch=0)
    assert {entry.session_id for entry in schedule} == {"train_only"}
    assert all(not entry.session_id.startswith("r29b2m_eval_v2") for entry in schedule)
    assert rows[0]["target"] == "固定目标"
