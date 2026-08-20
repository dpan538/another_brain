from src.training.mlx.r29b2m_r1_campaign import CAMPAIGN_ID, STATES, TERMINAL_STATES, calculate_dynamic_budget


def test_r1_state_machine_has_only_declared_terminal_states():
    assert CAMPAIGN_ID == "r29b2m_r1_measured_sft_v1"
    assert TERMINAL_STATES == {
        "PASSED_MLX_DIALOGUE_CANDIDATE",
        "BLOCKED_RESOURCE_WITH_MEASURED_EVIDENCE",
        "BLOCKED_DATA_QUALITY_WITH_EVIDENCE",
        "BLOCKED_TRAINING_RUNTIME_WITH_EVIDENCE",
        "BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE",
        "ABORTED_SAFELY",
    }
    assert STATES[0] == "ORIENTATION"
    assert STATES[-1] == "ABORTED_SAFELY"


def test_dynamic_budget_keeps_retained_atomic_and_floor_terms_separate():
    checkpoint = 1_234_567_890
    budget = calculate_dynamic_budget(full_checkpoint_bytes=checkpoint, measured_final_dataset_bytes=12_345_678)
    assert budget["retained_checkpoint_budget"] == checkpoint * 3
    assert budget["atomic_checkpoint_headroom"] == checkpoint
    assert budget["dataset_budget"] == 1_000_000_000
    assert budget["required_free_before_training"] == checkpoint * 4 + 23_000_000_000


def test_measured_dataset_can_raise_but_never_lower_floor_budget():
    low = calculate_dynamic_budget(full_checkpoint_bytes=1, measured_final_dataset_bytes=0)
    high = calculate_dynamic_budget(full_checkpoint_bytes=1, measured_final_dataset_bytes=700_000_000)
    assert low["dataset_budget"] == 1_000_000_000
    assert high["dataset_budget"] == 1_400_000_000
