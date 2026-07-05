import unittest

from src.training.eval.r27a7_dialogue_readiness import evaluate_from_ledger, readiness_label


class R27A7DialogueReadinessTests(unittest.TestCase):
    def test_label_enum(self):
        self.assertIn(readiness_label({"dialogue_score": 0.1}), {"not_ready", "weak_candidate", "candidate_for_browser_packaging_experiment"})

    def test_eval_not_product_admission(self):
        report = evaluate_from_ledger({"stages": [{"product_probe_score": 0.45, "rag_honesty_score": 0.82}]})
        self.assertIn("overall_readiness_label", report)


if __name__ == "__main__":
    unittest.main()
