import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "r28surf5_anchor_style_audit.py"


class R28Surf5AnchorStyleAuditTest(unittest.TestCase):
    def load_module(self):
        spec = importlib.util.spec_from_file_location("r28surf5_anchor_style_audit", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module

    def test_style_profile_uses_only_approved_summaries(self):
        module = self.load_module()
        profile = module.build_style_profile(write=False)
        self.assertTrue(profile["ok"])
        self.assertGreaterEqual(profile["approved_anchor_count"], 90)
        self.assertTrue(profile["old_pack_51_100_excluded"])
        self.assertTrue(profile["eval_prompts_excluded"])
        self.assertFalse(profile["private_raw_data_used"])
        self.assertFalse(profile["surface_policy"]["broad_answer_bank"])
        self.assertEqual(
            profile["style_traits"],
            [
                "concise",
                "boundary_first",
                "anti_customer_service",
                "evidence_honest",
                "allows_judgment",
                "aesthetic_value_sensitive",
            ],
        )


if __name__ == "__main__":
    unittest.main()
