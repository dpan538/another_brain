import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B5NoAssetsCommittedTests(unittest.TestCase):
    def test_no_r27b5_artifacts_or_model_assets_are_tracked(self):
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True).stdout
        self.assertNotIn("artifacts/r27b5/", tracked)
        forbidden = re.compile(r"\.(pt|pth|safetensors|ckpt|onnx|bin|gguf)$|(^|/)tokenizer\.json$", re.I)
        bad = [
            path
            for path in tracked.splitlines()
            if forbidden.search(path) and path != "static_llm/fixtures/tiny_decoder_fixture/tokenizer.json"
        ]
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
