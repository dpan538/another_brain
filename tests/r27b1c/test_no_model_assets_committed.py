import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B1CNoModelAssetsCommittedTests(unittest.TestCase):
    def test_no_b_line_model_assets_or_artifacts_are_tracked(self):
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True).stdout
        self.assertNotRegex(tracked, r"^(artifacts/(?!\.gitkeep$)|web/another_brain/.*\.(pt|pth|safetensors|ckpt|onnx|bin|gguf)$)")
        self.assertNotRegex(tracked, r"^(web/another_brain|web/another_brain_chat|src/browser_runtime).*tokenizer\.json$")
        self.assertNotIn("artifacts/r27b1c", tracked)


if __name__ == "__main__":
    unittest.main()
