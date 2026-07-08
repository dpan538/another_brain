import unittest

from scripts import r28ship2_branch_inventory as inventory


class R28Ship2BranchInventoryTest(unittest.TestCase):
    def test_branch_inventory_declares_required_refs_and_features(self):
        self.assertIn("origin/r28qa6-latency-open-question-qa", inventory.BRANCHES)
        self.assertIn("origin/r28ux5-chat-dashboard-split", inventory.BRANCHES)
        self.assertIn("origin/r28load0-model-loading-state-machine", inventory.BRANCHES)
        self.assertIn("origin/r28a13-abstract-value-sft", inventory.BRANCHES)
        for feature in [
            "q4 assets",
            "exact tokenizer",
            "q4 path normalizer",
            ".vercelignore bin fix",
            "route loop fix",
            "non-blocking self-check",
            "model loading state machine",
            "retry before fallback",
            "open-question SLA",
            "QA6 latency matrix",
            "fuzzy intent router",
            "natural answer surfaces",
            "lightweight RAG/profile pack",
            "Chat/Dashboard UI",
            "mobile loading UI",
            "build:vercel pass evidence",
            "no-training gates evidence",
        ]:
            self.assertIn(feature, inventory.FEATURE_PATTERNS)

    def test_branch_inventory_matrix_is_read_only_and_non_claiming(self):
        matrix = inventory.build_matrix()
        self.assertEqual(matrix["task"], "R28SHIP2")
        self.assertFalse(matrix["non_claims"]["training"])
        self.assertFalse(matrix["non_claims"]["new_model_assets"])
        self.assertFalse(matrix["non_claims"]["backend_inference"])
        self.assertEqual(len(matrix["branches"]), len(inventory.BRANCHES))


if __name__ == "__main__":
    unittest.main()
