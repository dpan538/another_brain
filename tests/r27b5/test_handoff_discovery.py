import json
import tempfile
import unittest
from pathlib import Path

from src.browser_export.handoff_discovery import discover_handoff_candidate


class R27B5HandoffDiscoveryTests(unittest.TestCase):
    def test_prefers_first_available_handoff_and_reads_budget_bytes(self):
        with tempfile.TemporaryDirectory() as tempdir:
            first = Path(tempdir) / "missing.json"
            second = Path(tempdir) / "R27_BROWSER_CANDIDATE_HANDOFF.json"
            second.write_text(
                json.dumps(
                    {
                        "candidate_id": "r27a9b_candidate",
                        "model_q4_bytes": 95_000_000,
                        "tokenizer_bytes": 2_000_000,
                        "model_config": {"model_size": "test"},
                    }
                ),
                encoding="utf-8",
            )
            report = discover_handoff_candidate(search_paths=[first, second])
        self.assertEqual(report["candidate_id"], "r27a9b_candidate")
        self.assertEqual(report["budget_inputs"]["candidate_model_q4_bytes"], 95_000_000)
        self.assertEqual(report["product_model"], False)
        self.assertEqual(report["browser_admission"], False)

    def test_missing_handoff_uses_b2_synthetic_fallback(self):
        with tempfile.TemporaryDirectory() as tempdir:
            report = discover_handoff_candidate(search_paths=[Path(tempdir) / "missing.json"])
        self.assertEqual(report["candidate_id"], "r27b2_synthetic_tiny")
        self.assertEqual(report["source_kind"], "b2_synthetic_fallback")
        self.assertIn("no_a10_a9b_a8b_handoff_found", report["blockers"])


if __name__ == "__main__":
    unittest.main()
