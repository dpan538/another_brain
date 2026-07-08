import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R28Surf3AnchorStyleAuditTest(unittest.TestCase):
    def test_audit_script_regenerates_profile_from_allowed_summaries(self):
        result = subprocess.run(
            [sys.executable, "scripts/r28surf3_anchor_style_audit.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn('"ok": true', result.stdout)
        profile = json.loads((ROOT / "data/training_registry/r28surf3_surface_profile.json").read_text(encoding="utf-8"))
        self.assertTrue(profile["audit_ok"])
        self.assertEqual(profile["approved_anchor_summary_count"], 98)
        self.assertEqual(profile["r26e_current_manifest_rows"], 45)
        self.assertEqual(profile["exclusions_confirmed"]["old_question_pack_001_rows_51_100_present"], 0)
        self.assertEqual(profile["exclusions_confirmed"]["chain_of_thought_hidden_prompt_local_path_risks"], 0)
        self.assertTrue(all(item["present"] for item in profile["style_traits"].values()))
        self.assertTrue(profile["source_policy"]["only_tracked_summaries_used"])
        self.assertFalse(profile["source_policy"]["root_docx_pdf_parsed"])
        self.assertFalse(profile["source_policy"]["data_public_ingestion_parsed"])
        self.assertFalse(profile["source_policy"]["eval_prompts_used"])
        self.assertFalse(profile["surface_rules"]["broad_answer_bank"])


if __name__ == "__main__":
    unittest.main()
