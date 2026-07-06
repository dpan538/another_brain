import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B5DeliveryConfigTests(unittest.TestCase):
    def test_delivery_config_remains_non_product(self):
        config = json.loads((ROOT / "web/another_brain/runtime_mode.json").read_text(encoding="utf-8"))
        self.assertEqual(config["delivery_mode"], "demo_static")
        self.assertEqual(config["model_mode"], "synthetic_tiny")
        self.assertEqual(config["product_model"], False)
        self.assertEqual(config["browser_admission"], False)
        self.assertEqual(config["release_checkpoint"], False)
        self.assertEqual(config["candidate_static_bundle"], False)
        self.assertIn(config["candidate_route"], {"synthetic_only", "research_only", "blocked"})


if __name__ == "__main__":
    unittest.main()
