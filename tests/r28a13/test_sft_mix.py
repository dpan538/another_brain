import tempfile
import unittest
from pathlib import Path

from src.training.curriculum import r28a13_sft_mix as mix


class R28A13SftMixTests(unittest.TestCase):
    def test_weights_are_exact_requested_mix(self):
        self.assertEqual(mix.MIX_WEIGHTS["answer_as_user_anchor"], 0.20)
        self.assertEqual(mix.MIX_WEIGHTS["abstract_value"], 0.25)
        self.assertEqual(mix.MIX_WEIGHTS["aesthetic_judgment"], 0.15)
        self.assertEqual(mix.MIX_WEIGHTS["relation_value"], 0.10)
        self.assertEqual(mix.MIX_WEIGHTS["RAG_evidence_grounded"], 0.20)
        self.assertEqual(mix.MIX_WEIGHTS["refusal_boundary"], 0.05)
        self.assertEqual(mix.MIX_WEIGHTS["concise_length_control"], 0.05)
        self.assertAlmostEqual(sum(mix.MIX_WEIGHTS.values()), 1.0)

    def test_builds_bounded_rows_without_eval_or_direct_router_intents(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "training/current").mkdir(parents=True)
            (root / "training/current/value_aesthetic_profile.r27a.json").write_text(
                '{"row_count":98,"style_anchors":["compressed"],"value_anchors":["boundary"],"contains_private_data":false}',
                encoding="utf-8",
            )
            (root / "training/current/relation_evidence_index.r27a.json").write_text(
                '{"policy":{"private_sources_used":false,"root_docs_parsed":false},"domain_hints":[]}',
                encoding="utf-8",
            )
            (root / "training/current/question_pack_100_manifest.r26c.json").write_text(
                '{"rows_51_to_100_status":"excluded_from_training"}',
                encoding="utf-8",
            )
            result = mix.build_sft_mix(total_rows=40, root=root, write_artifacts=True)

        report = result["report"]
        rows = result["rows"]
        self.assertTrue(report["ok"])
        self.assertFalse(report["broad_answer_bank"])
        self.assertTrue(report["old_pack_51_100_excluded"])
        self.assertFalse(report["eval_prompts_as_training_rows"])
        self.assertFalse(report["private_raw_data_used"])
        self.assertFalse(report["chain_of_thought_used"])
        self.assertFalse(report["hidden_prompt_used"])
        self.assertTrue(report["required_coverage"]["direct_identity_greeting_excluded"])
        self.assertEqual(set(report["category_counts"]), set(mix.MIX_WEIGHTS))
        self.assertFalse(any(row["category"] in mix.DIRECT_ROUTER_INTENTS for row in rows))
        self.assertFalse(any(row["input"] in mix.EVAL_PROMPTS_EXCLUDED for row in rows))
        self.assertTrue(all(row["source_policy"]["broad_answer_bank"] is False for row in rows))

    def test_artifact_report_is_ignored_path_only(self):
        result = mix.build_sft_mix(total_rows=20, write_artifacts=False)
        artifacts = result["report"]["artifacts"]
        self.assertTrue(all(path.startswith("artifacts/r28a13/") for path in artifacts.values()))


if __name__ == "__main__":
    unittest.main()
