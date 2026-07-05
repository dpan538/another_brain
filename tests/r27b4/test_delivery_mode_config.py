import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B4DeliveryModeConfigTests(unittest.TestCase):
    def test_runtime_mode_config_is_demo_static(self):
        config = json.loads((ROOT / "web/another_brain/runtime_mode.json").read_text(encoding="utf-8"))
        self.assertEqual(config["delivery_mode"], "demo_static")
        self.assertIn(config["model_mode"], {"mock", "synthetic_tiny", "candidate_manifest_experimental"})
        self.assertEqual(config["rag_mode"], "static_demo")
        self.assertEqual(config["backend_inference"], False)
        self.assertEqual(config["external_llm_api"], False)
        self.assertEqual(config["product_model"], False)


if __name__ == "__main__":
    unittest.main()
