import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "r28merge3_premerge_gate.py"


class R28Merge3PremergeGateTests(unittest.TestCase):
    def load_module(self):
        spec = importlib.util.spec_from_file_location("r28merge3_premerge_gate", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module

    def test_gate_reports_preview_ready_not_merge_ready(self):
        module = self.load_module()
        report = module.run_gate(ROOT)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["label"], "preview_ready_not_merge_ready")
        self.assertTrue(report["preview_ready"])
        self.assertFalse(report["merge_ready"])
        self.assertEqual(report["q4_asset_fetch_status"], "pass")
        self.assertEqual(report["q4_runtime_mount_status"], "pass")
        self.assertEqual(report["admittedStaticLlmAssets"], 10)


if __name__ == "__main__":
    unittest.main()
