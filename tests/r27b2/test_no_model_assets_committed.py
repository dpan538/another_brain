import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B2NoModelAssetsCommittedTests(unittest.TestCase):
    def test_no_r27b2_assets_or_model_files_are_tracked(self):
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True).stdout
        self.assertNotIn("artifacts/r27b2/", tracked)
        self.assertNotRegex(tracked, r"^(artifacts/(?!\.gitkeep$)|web/another_brain/.*\.(pt|pth|safetensors|ckpt|onnx|bin|gguf)$)")
        self.assertNotRegex(tracked, r"^(artifacts|web/another_brain|web/another_brain_chat|src/browser_export).*tokenizer\.json$")


if __name__ == "__main__":
    unittest.main()
