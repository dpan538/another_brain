import unittest

from scripts.r28d4_prelaunch_pr_preview_gate import choose_branch, forbidden_path


class R28D4PrelaunchPrPreviewGateTests(unittest.TestCase):
    def test_selects_m0_when_available(self):
        rows = [
            {"label": "R28P0B", "branch": "origin/r28p0b-prelaunch-integration", "rank": 10, "exists": True},
            {"label": "R28B9", "branch": "origin/r28b9-static-bundle-diet", "rank": 20, "exists": True},
            {"label": "R28M0", "branch": "origin/r28m0-model-asset-dryrun", "rank": 40, "exists": True},
        ]
        selected = choose_branch(rows)["selected"]
        self.assertEqual(selected["label"], "R28M0")

    def test_falls_back_to_p0b(self):
        rows = [
            {"label": "R28P0B", "branch": "origin/r28p0b-prelaunch-integration", "rank": 10, "exists": True},
            {"label": "R28M0", "branch": "origin/r28m0-model-asset-dryrun", "rank": 40, "exists": False},
        ]
        selected = choose_branch(rows)["selected"]
        self.assertEqual(selected["label"], "R28P0B")

    def test_forbidden_artifact_paths(self):
        self.assertTrue(forbidden_path("artifacts/r28m0/shards/model.bin"))
        self.assertTrue(forbidden_path("model.pt"))
        self.assertTrue(forbidden_path("tokenizer.json"))
        self.assertTrue(forbidden_path("data/public_ingestion/raw.jsonl"))
        self.assertTrue(forbidden_path("notes.docx"))
        self.assertFalse(forbidden_path("docs/r28/R28D4_PRELAUNCH_PR_PREVIEW_GATE.md"))
        self.assertFalse(forbidden_path("scripts/r28d4_prelaunch_pr_preview_gate.py"))


if __name__ == "__main__":
    unittest.main()
