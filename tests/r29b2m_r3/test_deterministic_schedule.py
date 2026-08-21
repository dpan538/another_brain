from collections import Counter

from src.training.mlx.r29b2m_r3_sampler import build_epoch_schedule, schedule_sha256


def test_schedule_is_epoch_deterministic_and_quality_weighted():
    rows = [
        {"session_id": "gold", "family_id": "a", "quality_tier": "gold_canonical", "token_counts": {"assistant_target_including_eos": 3}},
        {"session_id": "surface", "family_id": "b", "quality_tier": "verified_surface_variant", "token_counts": {"assistant_target_including_eos": 2}},
    ]
    first = build_epoch_schedule(rows, epoch=2)
    second = build_epoch_schedule(rows, epoch=2)
    assert schedule_sha256(first) == schedule_sha256(second)
    assert Counter(entry.session_id for entry in first) == {"gold": 2, "surface": 1}
