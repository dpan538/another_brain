import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SUMMARY = ROOT / "data/training_registry/r28anchor0_question_anchor_summary.json"


class R28Anchor0QuestionAnchorAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(
            ["python3", "scripts/r28anchor0_inventory_questions.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        cls.summary = json.loads(SUMMARY.read_text(encoding="utf-8"))

    def test_anchor_audit_passes(self):
        self.assertTrue(self.summary["ok"], self.summary.get("failures"))
        self.assertEqual(self.summary["release_readiness"], "anchor_audit_passed")
        self.assertEqual(self.summary["failures"], [])

    def test_old_pack_51_100_is_excluded_and_replacement_pack_is_allowed(self):
        policy = self.summary["question_pack_policy"]
        self.assertEqual(policy["old_pack_id"], "another_brain_question_pack_001")
        self.assertEqual(policy["old_rows_51_100_status"], "permanently_excluded")
        self.assertEqual(policy["old_rows_51_100_found_in_user_answered_corpus"], 0)
        self.assertEqual(policy["replacement_pack_id"], "another_brain_question_pack_002_abstract_values")
        self.assertEqual(policy["replacement_rows_promoted_count"], 50)
        self.assertTrue(self.summary["rules_assertions"]["replacement_51_100_allowed_only_from_new_pack"])

    def test_user_answered_counts_are_reconciled(self):
        combined = self.summary["combined_user_answered"]
        self.assertEqual(combined["total"], 98)
        self.assertEqual(combined["by_pack"]["another_brain_question_pack_001"], 48)
        self.assertEqual(combined["by_pack"]["another_brain_question_pack_002_abstract_values"], 50)
        self.assertEqual(combined["by_split"], {"dev": 10, "heldout": 10, "train": 78})
        self.assertEqual(combined["train_anchor_count"], 78)
        self.assertEqual(combined["eval_holdout_count"], 20)
        self.assertEqual(combined["needs_review_count"], 2)

    def test_eval_leakage_and_answer_bank_checks_are_clean(self):
        self.assertTrue(self.summary["rules_assertions"]["no_eval_prompts_in_training"])
        self.assertEqual(self.summary["eval_leakage"]["exact_overlap_count"], 0)
        self.assertEqual(self.summary["router_surface_audit"]["target_answer_runtime_copy_count"], 0)
        self.assertTrue(self.summary["rules_assertions"]["runtime_does_not_copy_user_answer_targets_as_answer_bank"])

    def test_summary_does_not_store_raw_question_or_answer_text(self):
        forbidden_keys = {
            "question",
            "target_answer",
            "user_answer_raw",
            "user_answer_clean",
            "messages",
            "content",
        }
        for group in self.summary["classifications"].values():
            if isinstance(group, list):
                for item in group:
                    self.assertTrue(forbidden_keys.isdisjoint(item.keys()), item)
        self.assertFalse(self.summary["root_docx_pdf_parsed"])
        self.assertFalse(self.summary["data_public_ingestion_parsed"])
        self.assertFalse(self.summary["raw_private_data_written"])

    def test_router_surface_candidates_are_metadata_only(self):
        router_rows = self.summary["classifications"]["router_surface"]
        self.assertGreaterEqual(len(router_rows), 20)
        for item in router_rows:
            self.assertIn(item["classification"], {"router_surface"})
            self.assertIn("content_hash", item)
            self.assertNotIn("template_answer", item)


if __name__ == "__main__":
    unittest.main()
