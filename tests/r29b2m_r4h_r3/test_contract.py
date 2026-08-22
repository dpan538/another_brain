import unittest

from conftest import run_contract


class TestR29B2MR4HR3Contract(unittest.TestCase):
    def test_explicit_temperature_zero(self): run_contract("explicit_temperature_zero")
    def test_same_message_structure_control(self): run_contract("same_message_structure_control")
    def test_provider_replicate_variance(self): run_contract("provider_replicate_variance")
    def test_one_call_causal_pairing(self): run_contract("one_call_causal_pairing")
    def test_canonical_answer_independent_of_local(self): run_contract("canonical_answer_independent_of_local")
    def test_critic_packet_no_new_facts(self): run_contract("critic_packet_no_new_facts")
    def test_critic_preferred_span_grounding(self): run_contract("critic_preferred_span_grounding")
    def test_rewrite_semantic_source_of_truth(self): run_contract("rewrite_semantic_source_of_truth")
    def test_semantic_guard_number_change(self): run_contract("semantic_guard_number_change")
    def test_semantic_guard_date_change(self): run_contract("semantic_guard_date_change")
    def test_semantic_guard_negation_flip(self): run_contract("semantic_guard_negation_flip")
    def test_semantic_guard_condition_removal(self): run_contract("semantic_guard_condition_removal")
    def test_semantic_guard_new_fact(self): run_contract("semantic_guard_new_fact")
    def test_semantic_guard_privacy_change(self): run_contract("semantic_guard_privacy_change")
    def test_semantic_guard_boundary_change(self): run_contract("semantic_guard_boundary_change")
    def test_fallback_to_canonical(self): run_contract("fallback_to_canonical")
    def test_no_unvalidated_stream_to_user(self): run_contract("no_unvalidated_stream_to_user")
    def test_control_reuses_exact_canonical(self): run_contract("control_reuses_exact_canonical")
    def test_two_call_request_count(self): run_contract("two_call_request_count")
    def test_critic_execution_rate(self): run_contract("critic_execution_rate")
    def test_latency_final_answer_ready(self): run_contract("latency_final_answer_ready")
    def test_secret_redaction(self): run_contract("secret_redaction")
    def test_no_training(self): run_contract("no_training")


if __name__ == "__main__":
    unittest.main()
