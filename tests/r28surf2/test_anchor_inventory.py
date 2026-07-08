import json
import unittest

from scripts.r28surf2_anchor_inventory import OUTPUT_PATH, build_anchor_inventory


class R28Surf2AnchorInventoryTests(unittest.TestCase):
    def test_inventory_schema_and_boundaries(self):
        report = build_anchor_inventory(write=True)
        self.assertEqual(report["train_anchor_count"], 98)
        self.assertEqual(report["relation_index_anchor_count"], 98)
        self.assertEqual(report["router_surface_candidate_count"], 98)
        self.assertTrue(report["eval_holdout_excluded"])
        self.assertTrue(report["old_pack_51_100_excluded"])
        self.assertFalse(report["private_raw_data_used"])
        self.assertFalse(report["source_policy"]["root_docx_pdf_parsed"])
        self.assertFalse(report["source_policy"]["data_public_ingestion_parsed"])
        self.assertFalse(report["source_policy"]["eval_prompts_used"])
        self.assertFalse(report["source_policy"]["broad_answer_bank"])
        for category in ("greeting", "identity_who_are_you", "value_judgment_light", "aesthetic_judgment_light"):
            self.assertIn(category, report["surface_categories"])

    def test_inventory_file_written(self):
        report = build_anchor_inventory(write=True)
        written = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        self.assertEqual(written["phase"], "R28SURF2")
        self.assertEqual(written["train_anchor_count"], report["train_anchor_count"])
        self.assertEqual(written["user_answered_split_counts"], {"dev": 10, "heldout": 10, "train": 78})


if __name__ == "__main__":
    unittest.main()
