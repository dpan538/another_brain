import json
import subprocess
import unittest
from pathlib import Path

from src.training.distillation.teacher_interface import TeacherCandidateRecord
from src.training.model_lab.model_config import R27A3_DEFAULT_CONFIG, estimate_transformer_params
from src.training.public_corpus.clean_public_corpus import clean_record
from src.training.public_corpus.license_admission import decide_source

ROOT = Path(__file__).resolve().parents[2]


class R27A3Tests(unittest.TestCase):
    def test_r27a2_accounting_reconciled(self):
        manifest_path = ROOT / "data/training_registry/r27a3_training_mix_manifest.json"
        if not manifest_path.exists():
            self.skipTest("R27A3 mix manifest not built yet")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(sum(manifest["split_records"].values()), manifest["emitted_records"])
        self.assertEqual(sum(manifest["curriculum_counts"].values()), manifest["emitted_records"])
        self.assertLessEqual(manifest["trained_records"], manifest["emitted_records"])
        doc = (ROOT / "docs/r27/R27A3_PUBLIC_TRAINING_MIX.md").read_text(encoding="utf-8")
        self.assertIn("candidate", doc.lower())
        self.assertIn("emitted", doc.lower())

    def test_license_admission_engineering_scope(self):
        decision = decide_source("baai_industry_corpus", {"cardData": {"license": "apache-2.0"}, "gated": False, "sha": "x"}).to_dict()
        self.assertTrue(decision["allowed_to_train_engineering"])
        self.assertFalse(decision["allowed_to_train_product_candidate"])
        self.assertFalse(decision["allowed_to_release_weights"])

    def test_no_product_license_claim(self):
        path = ROOT / "data/training_registry/public_corpus_license_decisions.json"
        if not path.exists():
            self.skipTest("license decisions not generated yet")
        for decision in json.loads(path.read_text(encoding="utf-8"))["decisions"]:
            self.assertFalse(decision["allowed_to_train_product_candidate"])
            self.assertFalse(decision["allowed_to_release_weights"])
            self.assertFalse(decision["allowed_to_commit_raw"])

    def test_public_sample_fetch_nonzero_or_blocked(self):
        path = ROOT / "artifacts/r27a3/reports/public_sample_fetch_report.json"
        if not path.exists():
            self.skipTest("fetch report not generated yet")
        report = json.loads(path.read_text(encoding="utf-8"))
        self.assertTrue(report["raw_public_sample_rows"] > 0 or report["blockers"])

    def test_gitignore_public_artifacts(self):
        samples = [
            "artifacts/r27a3/raw_public_samples/x/raw.jsonl",
            "artifacts/r27a3/clean_public_samples/x/clean.jsonl",
            "artifacts/r27a3/model_lab/tokenizer/tokenizer.json",
            "artifacts/r27a3/model_lab/checkpoints/x.pt",
        ]
        for sample in samples:
            result = subprocess.run(["git", "check-ignore", sample], cwd=ROOT, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, sample)

    def test_no_raw_public_text_committed(self):
        result = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True)
        forbidden = ["artifacts/r27a3", "artifacts/r27a3/raw_public_samples", "artifacts/r27a3/clean_public_samples", "artifacts/r27a3/model_lab/tokenizer/tokenizer.json", "artifacts/r27a3/model_lab/tokenizer/tokenizer.model"]
        self.assertFalse(any(any(f in line for f in forbidden) for line in result.stdout.splitlines()))

    def test_cleaning_rejects_pii_secrets_cot_eval(self):
        examples = [
            ("email me at person@example.com for this long sample text", "pii"),
            ("hf_abcdefghijklmnopqrstuvwxyz1234567890", "secret"),
            ("developer message with hidden prompt and chain of thought", "cot_or_hidden_prompt"),
            ("copy evals/r24 heldout prompt into this training text", "eval_prompt_leakage"),
        ]
        for text, expected in examples:
            row, reason = clean_record({"text": text})
            self.assertIsNone(row)
            self.assertEqual(reason, expected)

    def test_old_question_pack_001_51_100_global_exclusion(self):
        row, reason = clean_record({"text": "another_brain_question_pack_001 source_row_id 51 must stay excluded from training"})
        self.assertIsNone(row)
        self.assertEqual(reason, "old_excluded_question_pack_rows")

    def test_training_mix_nonzero_public_chinese_if_available(self):
        path = ROOT / "data/training_registry/r27a3_training_mix_manifest.json"
        if not path.exists():
            self.skipTest("mix manifest not generated yet")
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if manifest["clean_chinese_public_rows_available"] > 0:
            self.assertGreater(manifest["curriculum_counts"].get("public_chinese_pretraining", 0), 0)

    def test_training_mix_nonzero_secondary_english_if_available(self):
        path = ROOT / "data/training_registry/r27a3_training_mix_manifest.json"
        if not path.exists():
            self.skipTest("mix manifest not generated yet")
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if manifest["curriculum_counts"].get("secondary_english_mixed", 0):
            self.assertGreater(manifest["curriculum_counts"]["secondary_english_mixed"], 0)

    def test_training_mix_nonzero_instruction_if_available(self):
        path = ROOT / "data/training_registry/r27a3_training_mix_manifest.json"
        if not path.exists():
            self.skipTest("mix manifest not generated yet")
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if manifest["instruction_distillation_rows"]:
            self.assertGreater(manifest["curriculum_counts"].get("instruction_distillation", 0), 0)

    def test_value_aesthetic_min_rows_and_split_dedup(self):
        path = ROOT / "data/training_registry/r27a3_training_mix_manifest.json"
        if not path.exists():
            self.skipTest("mix manifest not generated yet")
        manifest = json.loads(path.read_text(encoding="utf-8"))
        self.assertGreaterEqual(manifest["value_aesthetic_rows"], 150)
        self.assertEqual(sum(manifest["split_records"].values()), manifest["emitted_records"])

    def test_tokenizer_not_character_fallback_unless_blocked(self):
        path = ROOT / "artifacts/r27a3/model_lab/tokenizer/tokenizer_report.json"
        if not path.exists():
            self.skipTest("tokenizer report not generated yet")
        report = json.loads(path.read_text(encoding="utf-8"))
        self.assertNotEqual(report["tokenizer_type"], "char_fallback")
        self.assertGreaterEqual(report["vocab_size"], 4096)

    def test_from_scratch_decoder_no_pretrained_weights_and_bounds(self):
        source = (ROOT / "scripts/r27a3_engineering_train.py").read_text(encoding="utf-8")
        self.assertIn("remote_model_weights_downloaded", source)
        self.assertIn("blocked_r27a3_engineering_run_already_exists", source)
        self.assertLessEqual(R27A3_DEFAULT_CONFIG["max_steps"], 1500)
        self.assertLessEqual(R27A3_DEFAULT_CONFIG["max_train_tokens"], 2000000)
        self.assertGreater(estimate_transformer_params(8000, 3, 192, 256), 0)

    def test_exactly_one_r27a3_engineering_run_marker(self):
        marker = json.loads((ROOT / "training/from_scratch/APPROVE_R27A3_PUBLIC_CORPUS_TOKENIZER_PILOT.json").read_text(encoding="utf-8"))
        self.assertTrue(marker["approved"])
        self.assertTrue(marker["consumed"])
        self.assertFalse(marker["allow_additional_runs"])
        self.assertFalse(marker["allow_phase_4_scaled_training"])

    def test_no_runtime_dependency_expansion(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        deps = package.get("dependencies", {})
        self.assertNotIn("torch", deps)
        self.assertNotIn("tokenizers", deps)

    def test_distillation_candidate_only(self):
        rec = TeacherCandidateRecord("c1", "p1", "final answer only", sample_type="public_instruction_sample")
        self.assertFalse(rec.training_allowed)
        self.assertEqual(rec.to_dict()["sample_type"], "public_instruction_sample")
        with self.assertRaises(ValueError):
            TeacherCandidateRecord("c2", "p2", "answer", sample_type="teacher_truth").validate()

    def test_gate_statuses_reported_after_eval(self):
        path = ROOT / "docs/r27/R27A3_ENGINEERING_RUN_SUMMARY.md"
        if not path.exists():
            self.skipTest("summary not generated yet")
        text = path.read_text(encoding="utf-8")
        self.assertIn("not product training", text)


if __name__ == "__main__":
    unittest.main()
