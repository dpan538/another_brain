import unittest

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B1ANoBackendInferenceTests(unittest.TestCase):
    def test_r27b1a_scripts_do_not_define_backend_inference(self):
        for path in sorted((ROOT / "scripts").glob("r27b1a_*.py")):
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("FastAPI", text)
            self.assertNotIn("Flask", text)
            self.assertNotIn("app.post", text)
            self.assertNotIn("api.openai.com", text)
            self.assertNotIn("doubao", text.lower())


if __name__ == "__main__":
    unittest.main()
