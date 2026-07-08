import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "r28surf4_anchor_style_audit.py"


class R28Surf4AnchorStyleAuditTests(unittest.TestCase):
    def load_module(self):
        spec = importlib.util.spec_from_file_location("r28surf4_anchor_style_audit", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module

    def test_style_profile_uses_approved_summaries_only(self):
        module = self.load_module()
        output = module.build_style_profile(write=False)
        self.assertEqual(output["approved_anchor_count"], 98)
        self.assertEqual(output["router_surface_candidates"], 98)
        self.assertTrue(output["excluded_eval"])
        self.assertTrue(output["excluded_old_pack_51_100"])
        self.assertFalse(output["private_raw_data_used"])
        self.assertFalse(output["source_policy"]["broad_answer_bank"])
        self.assertFalse(output["source_policy"]["data_public_ingestion_parsed"])
        self.assertFalse(output["source_policy"]["eval_prompts_used"])
        self.assertTrue(all("question_pack_001" not in item for item in output["tracked_manifest_inputs"]))


if __name__ == "__main__":
    unittest.main()
