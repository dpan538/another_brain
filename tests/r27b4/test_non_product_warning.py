import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B4NonProductWarningTests(unittest.TestCase):
    def test_ui_and_config_show_non_product_warning(self):
        html = (ROOT / "web/another_brain_chat/index.html").read_text(encoding="utf-8")
        app = (ROOT / "web/another_brain_chat/app.js").read_text(encoding="utf-8")
        config = json.loads((ROOT / "web/another_brain/runtime_mode.json").read_text(encoding="utf-8"))
        self.assertEqual(config["product_model"], False)
        self.assertIn("non-product-warning", html)
        self.assertIn("non_product_warning", app)
        self.assertIn("mock/synthetic", config["non_product_warning"])


if __name__ == "__main__":
    unittest.main()
