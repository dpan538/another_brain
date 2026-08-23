import unittest

from conftest import run_contract


class TestR29P0Contract(unittest.TestCase):
    def test_case_count_60(self): run_contract("test_case_count_60")
    def test_case_distribution(self): run_contract("test_case_distribution")
    def test_no_training_contamination(self): run_contract("test_no_training_contamination")
    def test_candidate_requests_identical(self): run_contract("test_candidate_requests_identical")
    def test_temperature_zero(self): run_contract("test_temperature_zero")
    def test_thinking_disabled(self): run_contract("test_thinking_disabled")
    def test_pair_requests_parallel(self): run_contract("test_pair_requests_parallel")
    def test_candidate_a_canonical(self): run_contract("test_candidate_a_canonical")
    def test_candidate_b_not_conditioned_on_a(self): run_contract("test_candidate_b_not_conditioned_on_a")
    def test_deterministic_baseline_frozen_before_generation(self): run_contract("test_deterministic_baseline_frozen_before_generation")
    def test_protected_number_diff(self): run_contract("test_protected_number_diff")
    def test_protected_date_diff(self): run_contract("test_protected_date_diff")
    def test_protected_negation_diff(self): run_contract("test_protected_negation_diff")
    def test_protected_condition_diff(self): run_contract("test_protected_condition_diff")
    def test_protected_privacy_diff(self): run_contract("test_protected_privacy_diff")
    def test_protected_logic_diff(self): run_contract("test_protected_logic_diff")
    def test_no_embedding_equivalence_proof(self): run_contract("test_no_embedding_equivalence_proof")
    def test_blind_panel_a_order(self): run_contract("test_blind_panel_a_order")
    def test_blind_panel_b_order(self): run_contract("test_blind_panel_b_order")
    def test_oracle_never_rewrites(self): run_contract("test_oracle_never_rewrites")
    def test_inequivalent_forces_a(self): run_contract("test_inequivalent_forces_a")
    def test_uncertain_forces_a(self): run_contract("test_uncertain_forces_a")
    def test_tie_forces_a(self): run_contract("test_tie_forces_a")
    def test_context_actual_efish_tokenizer(self): run_contract("test_context_actual_efish_tokenizer")
    def test_no_semantic_truncation(self): run_contract("test_no_semantic_truncation")
    def test_latency_parallel_pair(self): run_contract("test_latency_parallel_pair")
    def test_human_review_required(self): run_contract("test_human_review_required")
    def test_agent_review_not_human(self): run_contract("test_agent_review_not_human")
    def test_training_not_authorized_before_human_pass(self): run_contract("test_training_not_authorized_before_human_pass")
    def test_secret_redaction(self): run_contract("test_secret_redaction")
    def test_no_production_change(self): run_contract("test_no_production_change")


if __name__ == "__main__":
    unittest.main()
