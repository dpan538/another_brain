import unittest

from conftest import run_contract


class TestR29B2MR4HR2Contract(unittest.TestCase):
    def test_packet_v2_schema(self):
        run_contract("packet_v2_schema")

    def test_v2_rejects_affect(self):
        run_contract("v2_rejects_affect")

    def test_v2_rejects_dialogue_act(self):
        run_contract("v2_rejects_dialogue_act")

    def test_v2_rejects_emotional_rules(self):
        run_contract("v2_rejects_emotional_rules")

    def test_v2_rejects_response_shape(self):
        run_contract("v2_rejects_response_shape")

    def test_v2_rejects_confidence(self):
        run_contract("v2_rejects_confidence")

    def test_v2_exact_anchor_grounding(self):
        run_contract("v2_exact_anchor_grounding")

    def test_v2_anchor_offsets(self):
        run_contract("v2_anchor_offsets")

    def test_v2_style_only_expression_control(self):
        run_contract("v2_style_only_expression_control")

    def test_v2_compiler_no_new_fact(self):
        run_contract("v2_compiler_no_new_fact")

    def test_v2_instruction_token_budget(self):
        run_contract("v2_instruction_token_budget")

    def test_v1_failure_forensics(self):
        run_contract("v1_failure_forensics")

    def test_same_30_case_pairing(self):
        run_contract("same_30_case_pairing")

    def test_quality_priority_factual_first(self):
        run_contract("quality_priority_factual_first")

    def test_no_signal_training(self):
        run_contract("no_signal_training")

    def test_secret_redaction(self):
        run_contract("secret_redaction")

    def test_v2_oracle_audit(self):
        run_contract("v2_oracle_audit")

    def test_dialogue_heuristic_length_only(self):
        run_contract("dialogue_heuristic_length_only")

    def test_no_product_modification(self):
        run_contract("no_product_modification")


if __name__ == "__main__":
    unittest.main()
