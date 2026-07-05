import unittest

from src.browser_export.candidate_discovery import discover_candidate, synthetic_candidate


class R27B2CandidateDiscoveryTests(unittest.TestCase):
    def test_discovery_returns_candidate_or_synthetic_fallback(self):
        candidate = discover_candidate(prefer_handoff=True, synthetic_if_missing=True)
        self.assertTrue(candidate["candidate_id"])
        self.assertFalse(candidate["product_model"])
        self.assertFalse(candidate["browser_admission"])
        self.assertFalse(candidate["release_checkpoint"])
        self.assertIn("model_config", candidate)

    def test_synthetic_fallback_reports_blocker(self):
        candidate = synthetic_candidate()
        self.assertEqual(candidate["source_kind"], "synthetic_fallback")
        self.assertIn("no_a_line_candidate_handoff_or_checkpoint_found", candidate["blockers"])
        self.assertEqual(candidate["model_config"]["vocab_size"], 32)


if __name__ == "__main__":
    unittest.main()
