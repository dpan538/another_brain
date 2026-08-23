import unittest

from conftest import run_contract


class TestR30J0Contract(unittest.TestCase):
    def test_judge_context_512(self): run_contract("test_judge_context_512")
    def test_no_lm_generation_head_contract(self): run_contract("test_no_lm_generation_head_contract")
    def test_parameter_budget(self): run_contract("test_parameter_budget")
    def test_profile_schema(self): run_contract("test_profile_schema")
    def test_profile_no_sensitive_fields(self): run_contract("test_profile_no_sensitive_fields")
    def test_owner_review_required(self): run_contract("test_owner_review_required")
    def test_personal_fit_taxonomy(self): run_contract("test_personal_fit_taxonomy")
    def test_voice_issue_taxonomy(self): run_contract("test_voice_issue_taxonomy")
    def test_presentation_taxonomy(self): run_contract("test_presentation_taxonomy")
    def test_mutation_fact_preservation(self): run_contract("test_mutation_fact_preservation")
    def test_generic_good_personal_mismatch(self): run_contract("test_generic_good_personal_mismatch")
    def test_personal_not_equal_shorter(self): run_contract("test_personal_not_equal_shorter")
    def test_personal_not_equal_casual(self): run_contract("test_personal_not_equal_casual")
    def test_no_emotion_diagnosis(self): run_contract("test_no_emotion_diagnosis")
    def test_no_private_raw_chat_source(self): run_contract("test_no_private_raw_chat_source")
    def test_no_online_learning(self): run_contract("test_no_online_learning")
    def test_no_rag(self): run_contract("test_no_rag")
    def test_structured_memory_separate(self): run_contract("test_structured_memory_separate")
    def test_r28m1_lineage_honesty(self): run_contract("test_r28m1_lineage_honesty")
    def test_r3_challenger_only(self): run_contract("test_r3_challenger_only")
    def test_no_training_in_j0(self): run_contract("test_no_training_in_j0")
    def test_profile_representation_not_selected(self): run_contract("test_profile_representation_not_selected")
    def test_causal_bidirectional_probe_only(self): run_contract("test_causal_bidirectional_probe_only")
    def test_presentation_never_edits_answer(self): run_contract("test_presentation_never_edits_answer")
    def test_owner_review_pack_capacity(self): run_contract("test_owner_review_pack_capacity")
    def test_oracle_presentation_text_unchanged(self): run_contract("test_oracle_presentation_text_unchanged")
    def test_generic_baseline_has_no_owner_profile(self): run_contract("test_generic_baseline_has_no_owner_profile")
    def test_no_full_dataset_generated(self): run_contract("test_no_full_dataset_generated")
    def test_model_card_honest_role(self): run_contract("test_model_card_honest_role")
    def test_secret_redaction(self): run_contract("test_secret_redaction")
    def test_no_production_change(self): run_contract("test_no_production_change")


if __name__ == "__main__":
    unittest.main()
