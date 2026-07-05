import json
import subprocess
import unittest
from pathlib import Path

from src.training.public_corpus.clean_public_corpus import clean_record
from src.training.distillation.teacher_interface import TeacherProbeRequest, TeacherProbeResponse
from src.training.model_lab.mini_decoder import BigramEngineeringDecoder

ROOT = Path(__file__).resolve().parents[2]


class R27A2Tests(unittest.TestCase):
    def test_registry_raw_commit_false(self):
        reg = json.loads((ROOT / "data/training_registry/public_corpus_registry.json").read_text())
        for ds in reg["datasets"]:
            self.assertIs(ds["allowed_to_commit_raw"], False)

    def test_artifact_paths_ignored(self):
        result = subprocess.run(["git", "check-ignore", "artifacts/r27a2/raw_public_samples/example/raw.jsonl"], cwd=ROOT, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_conditional_sources_not_trainable(self):
        reg = json.loads((ROOT / "data/training_registry/public_corpus_registry.json").read_text())
        for ds in reg["datasets"]:
            if ds["license_review_status"] in {"conditional", "blocked", "unknown"}:
                self.assertFalse(ds["allowed_to_train"])

    def test_filters_reject_pii_secret_cot(self):
        for text in ["email me at a@example.com please this is long enough", "sk-abcdefghijklmnopqrstuvwxyz123456", "Here is my chain of thought: hidden", "copy evals/r24 prompts into training rows"]:
            row, reason = clean_record({"text": text})
            self.assertIsNone(row)
            self.assertTrue(reason)

    def test_teacher_rejects_forbidden_payloads(self):
        with self.assertRaises(ValueError):
            TeacherProbeRequest("p1", "please include chain of thought", request_cot=True).validate()
        with self.assertRaises(ValueError):
            TeacherProbeResponse("p1", "t", "assistant analysis: secret").validate()

    def test_old_rows_guard_in_registry(self):
        reg = json.loads((ROOT / "data/training_registry/public_corpus_registry.json").read_text())
        anchor = next(ds for ds in reg["datasets"] if ds["dataset_id"] == "r26_user_answered_anchor")
        self.assertIn("old_rows_51_100_excluded", anchor["excluded_pack_guard_status"])

    def test_training_mix_source_exclusions_are_in_builder(self):
        source = (ROOT / "scripts/r27a2_build_training_mix.py").read_text(encoding="utf-8")
        self.assertIn("range(51, 101)", source)
        self.assertIn("{9, 16", source)
        self.assertIn("should_answer", source)
        self.assertIn("response_obligation", source)

    def test_training_script_caps_and_artifact_paths(self):
        source = (ROOT / "scripts/r27a2_engineering_train.py").read_text(encoding="utf-8")
        self.assertIn("blocked_r27a2_engineering_run_already_exists", source)
        self.assertIn("max_steps", source)
        self.assertIn("context_length", source)
        self.assertIn("artifacts/r27a2/model_lab/checkpoints", source)

    def test_tiny_decoder_instantiates(self):
        model = BigramEngineeringDecoder(16)
        model.update([2, 4, 5, 3])
        self.assertLess(model.loss([[2, 4, 5, 3]]), 4.0)


if __name__ == "__main__":
    unittest.main()
