import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B1CDeliveryChecklistTests(unittest.TestCase):
    def test_delivery_checklist_has_required_sections(self):
        path = ROOT / "docs/r27/R27B1C_48H_DELIVERY_CHECKLIST.md"
        text = path.read_text(encoding="utf-8")
        for heading in (
            "Training Line Status",
            "Browser Line Status",
            "Minimum Deliverable",
            "Product-Candidate Requirements Before Real Model",
            "Hard Non-Claims",
        ):
            self.assertIn(heading, text)
        self.assertIn("no backend", text.lower())
        self.assertIn("no product model until admission", text.lower())


if __name__ == "__main__":
    unittest.main()
