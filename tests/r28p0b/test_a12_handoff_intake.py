import json
import tempfile
import unittest
from pathlib import Path

from src.product_prelaunch.a12_handoff_intake import load_a12_handoff


class R28P0BA12HandoffIntakeTests(unittest.TestCase):
    def test_product_path_handoff_is_normalized(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            handoff = root / "handoff.json"
            handoff.write_text(
                json.dumps(
                    {
                        "candidate_route": "product_path_engineering_candidate",
                        "selected_model": "new_96m",
                        "optimizer_tokens": 10240000,
                        "budget_row": {
                            "full_static_bundle_estimate_bytes": 98385593,
                            "classification": "product_path_tight",
                        },
                    }
                ),
                encoding="utf-8",
            )
            report = load_a12_handoff(
                handoff_paths=[handoff],
                summary_paths=[],
                finalizer_paths=[],
                synthetic_if_missing=True,
            )
        self.assertEqual(report["handoff_status"], "product_path_engineering_candidate")
        self.assertEqual(report["selected_model"], "new_96m")
        self.assertEqual(report["optimizer_tokens"], 10240000)

    def test_missing_handoff_uses_no_model_fallback(self):
        report = load_a12_handoff(handoff_paths=[], summary_paths=[], finalizer_paths=[], synthetic_if_missing=True)
        self.assertEqual(report["handoff_status"], "no_model")
        self.assertIn("no_a12_candidate_handoff", report["hard_blockers"])

    def test_running_finalizer_waits(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            finalizer = root / "finalizer.json"
            finalizer.write_text(json.dumps({"a12_active": True, "decision": "WAIT_A12_RUNNING"}), encoding="utf-8")
            report = load_a12_handoff(
                handoff_paths=[],
                summary_paths=[],
                finalizer_paths=[finalizer],
                synthetic_if_missing=True,
            )
        self.assertEqual(report["decision"], "WAIT_A12_RUNNING")
        self.assertEqual(report["handoff_status"], "WAIT_A12_RUNNING")


if __name__ == "__main__":
    unittest.main()
