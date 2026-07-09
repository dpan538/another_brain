import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "r28ship0_product_mount_smoke.py"


def load_module():
    spec = importlib.util.spec_from_file_location("r28ship0_product_mount_smoke", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ProductMountSmokeTest(unittest.TestCase):
    def test_static_mount_smoke_passes_from_source_tree(self):
        module = load_module()
        report = module.run_smoke(ROOT)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["q4_asset_fetch_status"], "pass")
        self.assertEqual(report["exact_tokenizer_fetch_status"], "pass")
        self.assertEqual(report["admittedStaticLlmAssets_equivalent"], 10)


if __name__ == "__main__":
    unittest.main()
