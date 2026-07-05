import unittest

from src.training.model_lab.scale_decision import decide_model_scale, product_budget_estimate


class R27A7ModelScaleDecisionTests(unittest.TestCase):
    def test_cpu_probe_falls_back_to_mini8m(self):
        decision = decide_model_scale({"mps_is_available": False, "fallback_reason": "mps_unavailable", "stable_candidates": []}, {"vocab_size": 16000, "best_checkpoint_path": "artifacts/r27a6/x.pt", "tokenizer_path": "artifacts/r27a4/tokenizer.json"})
        self.assertEqual(decision["selected_scale"], "continue_mini8m")
        self.assertTrue(decision["resume_r27a6_checkpoint"])

    def test_05b_q4_budget_over_100mb(self):
        self.assertFalse(product_budget_estimate(500_000_000)["fits_100mb_q4"])


if __name__ == "__main__":
    unittest.main()
