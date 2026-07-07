import json
import tempfile
import unittest
from pathlib import Path

from scripts.r28pr0_create_or_confirm_pr import MANUAL_URL, build_manual_required_report, write_manual_required_report


class R28PR0PRCreationFallbackTests(unittest.TestCase):
    def test_manual_required_report_does_not_claim_pr_created(self):
        report = build_manual_required_report()
        self.assertFalse(report["ok"])
        self.assertEqual(report["pr_status"], "manual_required")
        self.assertEqual(report["manual_url"], MANUAL_URL)
        self.assertTrue(report["must_not_claim_created"])

    def test_manual_required_artifact_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = build_manual_required_report("unit_test_no_auth")
            path = write_manual_required_report(report, root=root)
            saved = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(saved["reason"], "unit_test_no_auth")
            self.assertEqual(saved["head"], "r28pr0-final-preview-pr")
            self.assertIn("compare/main...r28pr0-final-preview-pr", saved["manual_url"])


if __name__ == "__main__":
    unittest.main()
