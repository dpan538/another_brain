from src.training.mlx.r29b2m_r3_decision import select_candidate


def candidate(checkpoint_id, behaviour, loss, tokens):
    return {"checkpoint_id": checkpoint_id, "assistant_target_tokens": tokens, "validation_loss": loss, "typical_answer_characters": 20, "structural_failures": {}, "metrics": {"critical_failure_count": 0, "overall_session_pass_rate": behaviour, "correction_recovery_rate": behaviour, "referent_binding_rate": behaviour, "constraint_retention_rate": behaviour, "natural_voice_rate": behaviour}}


def test_better_behaviour_beats_lower_validation_loss():
    selected = select_candidate([candidate("low_loss", 0.75, 1.0, 80000), candidate("better_dialogue", 0.85, 1.2, 160000)])
    assert selected["selected_checkpoint"] == "better_dialogue"
