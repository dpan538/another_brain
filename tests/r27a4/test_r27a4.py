import json
import subprocess
import unittest
from pathlib import Path

from src.training.campaign.campaign_policy import load_policy
from src.training.curriculum.interleaved_sampler import interleave_records, assert_prefix_coverage
from src.training.curriculum.token_budget import record_tokens
from src.training.distillation.candidate_queue import make_candidate
from src.training.distillation.live_teacher_probe import live_teacher_enabled, prepare_probe
from src.training.distillation.promotion_review import review_candidate
from src.training.model_lab.model_ladder import MODEL_LADDER, choose_model
from src.training.public_corpus.license_admission import decide_source

ROOT = Path(__file__).resolve().parents[2]


def read_json(path):
    path = ROOT / path
    if not path.exists():
        raise unittest.SkipTest(f"missing generated artifact {path}")
    return json.loads(path.read_text(encoding="utf-8"))


class R27A4Tests(unittest.TestCase):
    def test_campaign_marker_consumed(self):
        marker = ROOT / "training/from_scratch/APPROVE_R27A4_LONG_RUN_TRAINING_CAMPAIGN_V1.json"
        if not marker.exists():
            raise unittest.SkipTest("campaign marker not created yet")
        data = json.loads(marker.read_text(encoding="utf-8"))
        self.assertTrue(data["consumed"])

    def test_campaign_hard_caps(self):
        policy = load_policy()
        self.assertLessEqual(policy["max_total_steps"], 6000)
        self.assertLessEqual(policy["max_total_train_tokens"], 12000000)
        self.assertEqual(policy["allowed_stage_count"], 3)
        self.assertFalse(policy["allow_hyperparameter_sweep"])

    def test_no_active_training_approval_after_campaign(self):
        marker = ROOT / "training/from_scratch/APPROVE_R27A4_LONG_RUN_TRAINING_CAMPAIGN_V1.json"
        if marker.exists():
            data = json.loads(marker.read_text(encoding="utf-8"))
            self.assertFalse(data.get("approved") and not data.get("consumed"))

    def sample_records(self):
        rows = []
        for curr in ["public_chinese_pretraining", "secondary_english_mixed", "rag_evidence_grounded", "reasoning_symbolic", "value_aesthetic", "user_answered_anchor"]:
            for i in range(40):
                rows.append({"record_id": f"{curr}_{i}", "curriculum": curr, "text": (curr + " 内容 ") * 80})
        return rows

    def test_interleaved_sampler_first_100k_coverage(self):
        rows, _ = interleave_records(self.sample_records(), 100000)
        self.assertGreaterEqual(len(assert_prefix_coverage(rows, 100000, min_curricula=4)), 4)

    def test_interleaved_sampler_first_1m_coverage(self):
        rows, _ = interleave_records(self.sample_records() * 4, 1000000)
        self.assertGreaterEqual(len(assert_prefix_coverage(rows, 1000000, min_curricula=4)), 4)

    def test_no_curriculum_starvation(self):
        rows, manifest = interleave_records(self.sample_records(), 500000)
        self.assertGreater(len(manifest["tokens_by_curriculum"]), 3)
        self.assertGreater(sum(record_tokens(r) for r in rows), 0)

    def test_license_admission_subset_level(self):
        self.assertFalse(decide_source("baai_coig", {}, b"{}").allowed_to_train_engineering)
        self.assertFalse(decide_source("tulu_3_sft_mixture", {}, b"{}").allowed_to_train_engineering)

    def test_public_corpus_expansion_nonzero_or_blocked(self):
        report = read_json("artifacts/r27a4/reports/public_sample_fetch_report.json")
        self.assertTrue(report["raw_public_sample_rows"] > 0 or report["blockers"])

    def test_instruction_distillation_nonzero_or_blocked(self):
        report = read_json("artifacts/r27a4/reports/instruction_import_report.json")
        self.assertTrue(report["candidate_rows"] > 0 or report["blocked_sources"])

    def test_distillation_candidate_pending_by_default(self):
        c = make_candidate("c1", "public_instruction_sample", "问", "答", license_names=["apache-2.0"])
        self.assertEqual(c["review_status"], "pending")
        self.assertFalse(c["training_allowed"])

    def test_distillation_promotion_requires_filters(self):
        bad = make_candidate("c2", "public_instruction_sample", "问", "chain-of-thought", license_names=["apache-2.0"])
        self.assertEqual(review_candidate(bad)["review_status"], "rejected")
        good = make_candidate("c3", "public_instruction_sample", "问", "答", license_names=["apache-2.0"])
        self.assertTrue(review_candidate(good)["training_allowed"])

    def test_live_teacher_disabled_by_default(self):
        self.assertFalse(live_teacher_enabled(False))

    def test_live_teacher_requires_explicit_flag_and_env(self):
        self.assertFalse(live_teacher_enabled(True))

    def test_no_private_data_in_teacher_probe(self):
        probe = prepare_probe("公开合成问题")
        self.assertFalse(probe["contains_private_data"])

    def test_no_cot_in_teacher_probe(self):
        probe = prepare_probe("公开合成问题")
        self.assertFalse(probe["contains_cot"])

    def test_no_eval_prompt_in_teacher_probe(self):
        probe = prepare_probe("公开合成问题")
        self.assertFalse(probe["contains_eval_prompt"])

    def test_no_old_excluded_rows_in_teacher_probe(self):
        with self.assertRaises(ValueError):
            prepare_probe("another_brain_question_pack_001 source_row_id 51")

    def test_value_aesthetic_min_rows(self):
        report = read_json("artifacts/r27a4/reports/value_aesthetic_report.json")
        self.assertGreaterEqual(report["rows"], 1000)

    def test_rag_evidence_min_rows(self):
        report = read_json("artifacts/r27a4/reports/rag_report.json")
        self.assertGreaterEqual(report["rows"], 3000)

    def test_reasoning_min_rows(self):
        report = read_json("artifacts/r27a4/reports/reasoning_report.json")
        self.assertGreaterEqual(report["rows"], 5000)

    def test_tokenizer_v2_not_trained_on_heldout(self):
        report = read_json("artifacts/r27a4/model_lab/tokenizer/tokenizer_report.json")
        self.assertFalse(report["trained_on_heldout"])

    def test_tokenizer_v2_chinese_fertility(self):
        report = read_json("artifacts/r27a4/model_lab/tokenizer/tokenizer_report.json")
        self.assertGreater(report["chinese_fertility"], 0)

    def test_model_ladder_param_count(self):
        cfg = choose_model("mini_12m", "mps", 16000, 512)
        self.assertGreater(cfg["estimated_params"], choose_model("tiny_debug", "cpu", 8000, 256)["estimated_params"])
        self.assertIn("mini_30m", MODEL_LADDER)

    def test_checkpoint_artifacts_ignored(self):
        ignored = subprocess.check_output(["git", "check-ignore", "artifacts/r27a4/model_lab/checkpoints/x.pt"], cwd=ROOT, text=True).strip()
        self.assertIn("artifacts/r27a4", ignored)

    def test_no_weights_committed(self):
        tracked = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
        self.assertNotRegex(tracked, r"artifacts/r27a4/.*\.(pt|pth|safetensors|ckpt)")

    def test_no_tokenizer_artifacts_committed(self):
        tracked = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
        self.assertNotIn("artifacts/r27a4/model_lab/tokenizer/tokenizer.json", tracked)

    def test_no_raw_or_clean_public_text_committed(self):
        tracked = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
        self.assertNotIn("artifacts/r27a4/raw_public_samples", tracked)
        self.assertNotIn("artifacts/r27a4/clean_public_samples", tracked)

    def test_no_runtime_dependency_expansion(self):
        pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertNotIn("dependencies", pkg)

    def test_r24_r25_r26_r27_gates_pass_or_reported(self):
        doc = ROOT / "docs/r27/R27A4_CAMPAIGN_EVALUATION.md"
        if not doc.exists():
            raise unittest.SkipTest("evaluation doc not generated yet")
        self.assertIn("not product training", doc.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
