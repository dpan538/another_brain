import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B0StaticAssetBudgetTests(unittest.TestCase):
    def test_asset_manifest_static_budget_contract(self):
        manifest = json.loads((ROOT / "web/another_brain/asset_manifest.json").read_text(encoding="utf-8"))
        self.assertRegex(manifest["runtime_version"], r"^r27b[0-9]")
        self.assertEqual(manifest["model_assets"], [])
        self.assertEqual(manifest["tokenizer_assets"], [])
        declared_total = 0
        for item in manifest["rag_assets"] + manifest["gate_assets"]:
            self.assertFalse(item["path"].startswith(("http://", "https://", "//")))
            actual = (ROOT / "web" / item["path"]).stat().st_size
            self.assertEqual(item["bytes"], actual)
            declared_total += actual
        self.assertEqual(manifest["total_declared_bytes"], declared_total)
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
