import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B0StaticAssetBudgetTests(unittest.TestCase):
    def test_asset_manifest_static_budget_contract(self):
        manifest = json.loads((ROOT / "web/another_brain/asset_manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["runtime_version"], "r27b0-static-chat-shell-v1")
        self.assertEqual(manifest["model_assets"], [])
        self.assertEqual(manifest["tokenizer_assets"], [])
        self.assertEqual(manifest["rag_assets"], [])
        self.assertEqual(manifest["gate_assets"], [])
        self.assertEqual(manifest["total_declared_bytes"], 0)
        self.assertEqual(manifest["max_total_static_bytes"], 100_000_000)
        self.assertTrue(manifest["same_origin_only"])
        self.assertFalse(manifest["external_runtime_dependency"])
        self.assertFalse(manifest["backend_inference"])

    def test_static_asset_budget_gate_passes(self):
        result = subprocess.run(
            ["python3", "scripts/r27b0_static_asset_budget.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("passed", result.stdout)

    def test_no_r27b0_weights_or_artifacts_tracked(self):
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True).stdout
        self.assertNotRegex(tracked, r"web/another_brain/.*\.(pt|pth|safetensors|ckpt|gguf|bin|onnx)")
        self.assertNotIn("artifacts/r27b0", tracked)


if __name__ == "__main__":
    unittest.main()
