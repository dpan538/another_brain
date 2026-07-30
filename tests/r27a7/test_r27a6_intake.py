import json
import unittest
from pathlib import Path

from src.training.eval.r27a7_baseline import intake_r27a6_evidence


ROOT = Path(__file__).resolve().parents[2]


class R27A7R27A6IntakeTests(unittest.TestCase):
    def test_intake_reports_required_keys(self):
        report = intake_r27a6_evidence(ROOT)
        self.assertIn("r27a6_completed", report)
        self.assertIn("best_checkpoint_path", report)
        self.assertEqual(report.get("vocab_size"), 16000)

    def test_r27a6_marker_consumed(self):
        marker = ROOT / "training/from_scratch/APPROVE_R27A6_AUTONOMOUS_LONGRUN_DIALOGUE_READINESS_V1.json"
        self.assertTrue(json.loads(marker.read_text()).get("consumed"))


if __name__ == "__main__":
    unittest.main()
