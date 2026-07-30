import json
import os
import subprocess
import unittest
from pathlib import Path

from src.training.campaign.lineage import inspect_r27a4_lineage
from src.training.campaign.r27a5_campaign_policy import load_policy
from src.training.curriculum.interleaved_sampler import assert_prefix_coverage, interleave_records
from src.training.curriculum.sft_builder import sft_record
from src.training.distillation.candidate_queue import make_candidate
from src.training.distillation.live_teacher_probe import live_teacher_enabled, prepare_probe
from src.training.distillation.promotion_review import review_candidate
from src.training.public_corpus.license_admission import decide_source

ROOT = Path(__file__).resolve().parents[2]


def read_json(relpath):
    path = ROOT / relpath
    if not path.exists():
        raise unittest.SkipTest(f"missing generated artifact {path}")
    return json.loads(path.read_text(encoding="utf-8"))


class R27A5Tests(unittest.TestCase):
    def test_lineage_decision_resume_r27a4_if_compatible(self):
        report = inspect_r27a4_lineage()
        if report["r27a4_checkpoint_found"] and report["r27a4_tokenizer_found"]:
            self.assertTrue(report["compatible_for_resume"])
            self.assertEqual(report["lineage_decision"], "resume_r27a4_mini8m")

    def test_no_tokenizer_change_on_resume(self):
        report = inspect_r27a4_lineage()
        if not report["compatible_for_resume"]:
            raise unittest.SkipTest("R27A4 artifacts unavailable locally")
        self.assertEqual(report["vocab_size"], 16000)
        self.assertTrue(report["tokenizer_must_not_change_on_resume"])

    def test_new_lineage_requires_explicit_reason(self):
        report = inspect_r27a4_lineage()
        if report["lineage_decision"] == "new_r27a5_lineage":
            self.assertTrue(report["decision_reason"])

    def test_campaign_marker_consumed(self):
        marker = ROOT / "training/from_scratch/APPROVE_R27A5_SUSTAINED_PILOT_DISTILLATION_V1.json"
        if not marker.exists():
            raise unittest.SkipTest("campaign marker not created yet")
        data = json.loads(marker.read_text(encoding="utf-8"))
        self.assertTrue(data.get("consumed"))

    def test_no_active_training_approval_after_campaign(self):
        marker = ROOT / "training/from_scratch/APPROVE_R27A5_SUSTAINED_PILOT_DISTILLATION_V1.json"
        if marker.exists():
            data = json.loads(marker.read_text(encoding="utf-8"))
            self.assertFalse(data.get("approved") and not data.get("consumed"))

    def test_campaign_hard_caps(self):
        policy = load_policy()
        self.assertLessEqual(policy["max_total_steps"], 12000)
        self.assertLessEqual(policy["max_total_train_tokens"], 24000000)
        self.assertLessEqual(policy["cpu_fallback_max_total_steps"], 6000)
        self.assertFalse(policy["allow_hyperparameter_sweep"])

    def test_resume_within_caps_only(self):
        policy = load_policy()
        self.assertTrue(policy["allow_resume_from_r27a4_checkpoint"])
        self.assertEqual(policy["max_stage_count"], 4)
        self.assertEqual(policy["max_checkpoint_count"], 8)

    def test_public_corpus_expansion_nonzero_or_blocked(self):
        report = read_json("artifacts/r27a5/reports/public_sample_fetch_report.json")
        self.assertTrue(report.get("raw_public_sample_rows", 0) > 0 or report.get("blockers"))

    def test_license_admission_subset_level(self):
        self.assertFalse(decide_source("baai_coig", {}, b"{}").allowed_to_train_engineering)
        self.assertFalse(decide_source("baai_coig_pc", {}, b"{}").allowed_to_train_engineering)
        self.assertFalse(decide_source("coig_cqia", {}, b"{}").allowed_to_train_engineering)

    def test_instruction_candidates_nonzero_or_blocked(self):
        report = read_json("artifacts/r27a5/reports/instruction_import_report.json")
        self.assertTrue(report.get("candidate_rows", 0) > 0 or report.get("blocked_sources"))

    def test_promoted_instruction_requires_filters(self):
        bad = make_candidate("c2", "public_instruction_sample", "问", "chain-of-thought", license_names=["apache-2.0"])
        self.assertEqual(review_candidate(bad)["review_status"], "rejected")
        good = make_candidate("c3", "public_instruction_sample", "问", "这是一个具体回答。", license_names=["apache-2.0"])
        self.assertTrue(review_candidate(good)["training_allowed"])

    def test_live_teacher_disabled_by_default(self):
        self.assertFalse(live_teacher_enabled(False))

    def test_live_teacher_requires_flag_and_env(self):
        old = os.environ.pop("R27A5_ALLOW_LIVE_TEACHER", None)
        try:
            self.assertFalse(live_teacher_enabled(True))
        finally:
            if old is not None:
                os.environ["R27A5_ALLOW_LIVE_TEACHER"] = old

    def test_live_teacher_no_private_data_cot_eval_or_old_rows(self):
        probe = prepare_probe("公开合成问题")
        self.assertFalse(probe["contains_private_data"])
        self.assertFalse(probe["contains_cot"])
        self.assertFalse(probe["contains_eval_prompt"])
        with self.assertRaises(ValueError):
            prepare_probe("another_brain_question_pack_001 source_row_id 51")

    def test_sft_curriculum_schema(self):
        row = sft_record("sft_public_instruction", "问", "答", 1)
        self.assertIn("<|user|>", row["text"])
        self.assertIn("<|assistant|>", row["text"])
        self.assertTrue(row["allowed_to_train_engineering"])
        self.assertFalse(row["contains_cot"])

    def test_sft_no_generic_assistant_target(self):
        report = read_json("artifacts/r27a5/reports/sft_curriculum_report.json")
        self.assertTrue(report["generic_assistant_target_rejected"])

    def test_value_aesthetic_min_rows(self):
        self.assertGreaterEqual(read_json("artifacts/r27a5/reports/value_aesthetic_report.json")["rows"], 3000)

    def test_rag_evidence_min_rows(self):
        self.assertGreaterEqual(read_json("artifacts/r27a5/reports/rag_report.json")["rows"], 8000)

    def test_reasoning_min_rows(self):
        self.assertGreaterEqual(read_json("artifacts/r27a5/reports/reasoning_report.json")["rows"], 12000)

    def sample_records(self):
        rows = []
        curricula = ["public_chinese_pretraining", "secondary_english_mixed", "rag_evidence_grounded", "reasoning_symbolic", "value_aesthetic", "user_answered_anchor", "sft_public_instruction"]
        for curr in curricula:
            for i in range(60):
                rows.append({"record_id": f"{curr}_{i}", "curriculum": curr, "text": (curr + " 内容 ") * 80})
        return rows

    def test_interleaved_stage1_coverage(self):
        rows, _ = interleave_records(self.sample_records(), 100000, seed=2705)
        self.assertGreaterEqual(len(assert_prefix_coverage(rows, 100000, min_curricula=4)), 4)

    def test_interleaved_stage2_coverage(self):
        rows, manifest = interleave_records(self.sample_records() * 4, 500000, seed=2705)
        self.assertGreaterEqual(len(manifest["tokens_by_curriculum"]), 5)
        self.assertGreaterEqual(len(assert_prefix_coverage(rows, 500000, min_curricula=4)), 4)

    def test_split_dedup_no_leakage(self):
        manifest = read_json("artifacts/r27a5/reports/interleaved_training_stream_manifest.json")
        self.assertTrue(manifest["split_dedup"])
        self.assertFalse(manifest["contains_eval_prompts"])
        self.assertEqual(manifest["old_question_pack_001_rows_51_100_used"], 0)

    def test_checkpoint_artifacts_ignored(self):
        ignored = subprocess.check_output(["git", "check-ignore", "artifacts/r27a5/model_lab/checkpoints/x.pt"], cwd=ROOT, text=True).strip()
        self.assertIn("artifacts/r27a5", ignored)

    def test_no_weights_tokenizers_or_training_text_committed(self):
        tracked = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
        self.assertNotRegex(tracked, r"artifacts/r27a5/.*\.(pt|pth|safetensors|ckpt)")
        self.assertNotIn("artifacts/r27a5/model_lab/tokenizer/tokenizer.json", tracked)
        self.assertNotIn("artifacts/r27a5/raw_public_samples", tracked)
        self.assertNotIn("artifacts/r27a5/clean_public_samples", tracked)
        self.assertNotIn("artifacts/r27a5/training_mix", tracked)

    def test_no_runtime_dependency_expansion(self):
        pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertNotIn("dependencies", pkg)

    def test_r24_r25_r26_r27_gates_pass_or_reported(self):
        doc = ROOT / "docs/r27/R27A5_CAMPAIGN_EVALUATION.md"
        if not doc.exists():
            raise unittest.SkipTest("evaluation doc not generated yet")
        self.assertIn("not product training", doc.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
