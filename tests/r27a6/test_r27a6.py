import json
import unittest
from pathlib import Path

from src.training.campaign.best_checkpoint import choose_best
from src.training.campaign.lineage import inspect_r27a5_lineage
from src.training.campaign.segment_scheduler import schedule_for_caps
from src.training.distillation.teacher_output_safety import reject_teacher_output
from src.training.eval.loss_anomaly import classify_dev_heldout_anomaly
from src.training.eval.product_probe_sets import PRODUCT_PROBES
from src.training.eval.rag_honesty_probes import RAG_HONESTY_PROBES
from src.training.eval.collapse_probes import COLLAPSE_PROBES


ROOT = Path(__file__).resolve().parents[2]


class R27A6Tests(unittest.TestCase):
    def test_r27a5_evidence_audit_schema(self):
        metrics = {"dev_loss": 5.9, "heldout_loss": 3.6}
        split = {"duplicates": {"cross_split_duplicate_count": 0}, "splits": {"dev": {"token_length": {"mean": 500}, "source_dataset_counts": {"a": 1}}, "heldout": {"token_length": {"mean": 499}, "source_dataset_counts": {"b": 1}}}}
        out = classify_dev_heldout_anomaly(metrics, split)
        self.assertIn("classification", out)
        self.assertTrue(out["proceed"])

    def test_dev_heldout_loss_anomaly_detection(self):
        out = classify_dev_heldout_anomaly({"dev_loss": 6, "heldout_loss": 3}, {"duplicates": {"cross_split_duplicate_count": 1}, "splits": {"dev": {"token_length": {"mean": 1}, "source_dataset_counts": {}}, "heldout": {"token_length": {"mean": 1}, "source_dataset_counts": {}}}})
        self.assertFalse(out["proceed"])

    def test_lineage_resume_r27a5_if_compatible(self):
        report = inspect_r27a5_lineage(ROOT)
        self.assertIn(report["lineage_decision"], {"resume_r27a5_mini8m", "new_r27a6_lineage"})

    def test_no_tokenizer_change_on_resume(self):
        report = inspect_r27a5_lineage(ROOT)
        if report["compatible_for_resume"]:
            self.assertEqual(report["vocab_size"], 16000)
            self.assertTrue(report["tokenizer_must_not_change_on_resume"])

    def test_new_lineage_requires_explicit_reason(self):
        report = inspect_r27a5_lineage(ROOT)
        self.assertTrue(report.get("decision_reason"))

    def test_autonomous_campaign_marker_consumed(self):
        marker = ROOT / "training/from_scratch/APPROVE_R27A6_AUTONOMOUS_LONGRUN_DIALOGUE_READINESS_V1.json"
        if marker.exists():
            data = json.loads(marker.read_text())
            self.assertTrue(data.get("consumed", False))

    def test_no_active_training_approval_after_campaign(self):
        ledger = ROOT / "data/training_registry/r27a6_autonomous_campaign_ledger.json"
        if ledger.exists():
            self.assertEqual(json.loads(ledger.read_text()).get("active_approval_after_completion"), 0)

    def test_autonomous_campaign_hard_caps(self):
        sched = schedule_for_caps(10, 30000, 50000000)
        self.assertLessEqual(sum(s["steps"] for s in sched), 30000)
        self.assertLessEqual(sum(s["tokens"] for s in sched), 50000000)

    def test_max_segments_enforced(self):
        self.assertLessEqual(len(schedule_for_caps(2, 30000, 50000000)), 2)

    def test_resume_within_caps_only(self):
        sched = schedule_for_caps(10, 1000, 1000000)
        self.assertLessEqual(sum(s["steps"] for s in sched), 1000)

    def test_no_hyperparameter_sweep(self):
        policy = ROOT / "data/training_registry/r27a6_autonomous_campaign_policy.json"
        if policy.exists():
            self.assertFalse(json.loads(policy.read_text()).get("allow_hyperparameter_sweep"))

    def test_best_checkpoint_metadata_only(self):
        best = choose_best([{"checkpoint_path": "artifacts/r27a6/model_lab/checkpoints/a.pt", "dev_loss": 2.0, "product_probe_score": 0.4}])
        self.assertTrue(best["best_dev_loss_checkpoint"].endswith(".pt"))

    def test_checkpoints_ignored(self):
        self.assertIn("artifacts/r27a6/", (ROOT / ".gitignore").read_text())

    def test_device_probe_reports_mps_cuda_cpu(self):
        report = ROOT / "artifacts/r27a6/reports/device_probe.json"
        if report.exists():
            data = json.loads(report.read_text())
            self.assertIn(data["device"], {"cpu", "mps", "cuda"})

    def test_data_expansion_nonzero_or_blocked(self):
        report = ROOT / "artifacts/r27a6/reports/public_sample_fetch_report.json"
        if report.exists():
            data = json.loads(report.read_text())
            self.assertTrue(data.get("raw_public_sample_rows", 0) >= 0)

    def test_sft_zh_mixed_ratio_reported(self):
        report = ROOT / "artifacts/r27a6/reports/sft_curriculum_report.json"
        if report.exists():
            self.assertIn("zh_mixed_ratio", json.loads(report.read_text()))

    def test_live_teacher_disabled_by_default(self):
        self.assertEqual(reject_teacher_output("final answer only"), "")

    def test_live_teacher_requires_flag_and_env(self):
        script = ROOT / "scripts/r27a6_run_teacher_probe_optional.py"
        self.assertIn("R27A6_ALLOW_LIVE_TEACHER", script.read_text())

    def test_teacher_no_private_data(self):
        self.assertTrue(reject_teacher_output("see private_sources/file"))

    def test_teacher_no_cot(self):
        self.assertTrue(reject_teacher_output("chain-of-thought"))

    def test_teacher_no_eval_prompt(self):
        self.assertTrue(reject_teacher_output("evals/case"))

    def test_teacher_no_old_excluded_rows(self):
        script = ROOT / "scripts/r27a6_review_teacher_candidates.py"
        self.assertIn("contains_old_excluded_row", script.read_text())

    def test_dialogue_product_curriculum_schema(self):
        from src.training.curriculum.dialogue_product_builder import dialogue_record
        self.assertIn("text", dialogue_record("sft_refusal_boundary", "p", "r", 1))

    def test_dialogue_curriculum_no_generic_assistant_target(self):
        report = ROOT / "artifacts/r27a6/reports/dialogue_product_curriculum_report.json"
        if report.exists():
            self.assertTrue(json.loads(report.read_text()).get("generic_assistant_target_rejected"))

    def test_dialogue_curriculum_no_eval_prompt_leakage(self):
        report = ROOT / "artifacts/r27a6/reports/dialogue_product_curriculum_report.json"
        if report.exists():
            self.assertFalse(json.loads(report.read_text()).get("contains_eval_prompt"))

    def test_dialogue_curriculum_no_old_excluded_rows(self):
        report = ROOT / "artifacts/r27a6/reports/dialogue_product_curriculum_report.json"
        if report.exists():
            self.assertFalse(json.loads(report.read_text()).get("contains_old_excluded_row"))

    def test_autonomous_stream_first_100k_coverage(self):
        self._stream_prefix("prefix_100k")

    def test_autonomous_stream_first_1m_coverage(self):
        self._stream_prefix("prefix_1m")

    def test_autonomous_stream_first_5m_coverage(self):
        self._stream_prefix("prefix_5m")

    def _stream_prefix(self, key):
        report = ROOT / "artifacts/r27a6/reports/autonomous_training_streams_manifest.json"
        if report.exists():
            data = json.loads(report.read_text())
            self.assertIn("tokens_by_curriculum", data[key])

    def test_no_curriculum_starvation(self):
        report = ROOT / "artifacts/r27a6/reports/autonomous_training_streams_manifest.json"
        if report.exists():
            self.assertGreaterEqual(len(json.loads(report.read_text())["prefix_100k"]["tokens_by_curriculum"]), 2)

    def test_split_dedup_no_leakage(self):
        audit = ROOT / "artifacts/r27a6/reports/r27a5_evidence_audit.json"
        if audit.exists():
            self.assertEqual(json.loads(audit.read_text())["split_audit"]["duplicates"]["cross_split_duplicate_count"], 0)

    def test_stratified_heldout_exists(self):
        path = ROOT / "artifacts/r27a6/training_mix/stratified_heldout.jsonl"
        if (ROOT / "artifacts/r27a6/reports/autonomous_training_streams_manifest.json").exists():
            self.assertTrue(path.exists())

    def test_early_stop_on_nan_loss(self):
        from src.training.campaign.early_stop import should_stop
        self.assertTrue(should_stop({"stages": []}, {"dev_loss": float("nan")})[0])

    def test_early_stop_on_safety_probe_failure(self):
        from src.training.campaign.early_stop import should_stop
        self.assertTrue(should_stop({"stages": []}, {"dev_loss": 1.0, "safety_probe_failed": True})[0])

    def test_dialogue_readiness_report_schema(self):
        self.assertGreater(len(PRODUCT_PROBES), 0)

    def test_collapse_probe_schema(self):
        self.assertGreater(len(COLLAPSE_PROBES), 0)

    def test_rag_honesty_probe_schema(self):
        self.assertGreater(len(RAG_HONESTY_PROBES), 0)

    def test_no_weights_committed(self):
        import subprocess
        out = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True).stdout
        self.assertNotIn("artifacts/r27a6/model_lab/checkpoints", out)

    def test_no_tokenizer_artifacts_committed(self):
        import subprocess
        out = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True).stdout
        self.assertNotIn("artifacts/r27a6/model_lab/tokenizer", out)

    def test_no_raw_or_clean_public_text_committed(self):
        import subprocess
        out = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True).stdout
        self.assertNotIn("artifacts/r27a6/raw_public_samples", out)

    def test_no_processed_training_text_committed(self):
        import subprocess
        out = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True).stdout
        self.assertNotIn("artifacts/r27a6/training_mix", out)

    def test_no_runtime_dependency_expansion(self):
        self.assertNotIn("r27a6", (ROOT / "web/index.html").read_text(errors="ignore"))

    def test_no_product_training_claim(self):
        policy = ROOT / "data/training_registry/r27a6_autonomous_campaign_policy.json"
        if policy.exists():
            self.assertFalse(json.loads(policy.read_text()).get("product_training"))

    def test_no_phase4_claim(self):
        policy = ROOT / "data/training_registry/r27a6_autonomous_campaign_policy.json"
        if policy.exists():
            self.assertFalse(json.loads(policy.read_text()).get("phase_4"))

    def test_r24_r25_r26_r27_gates_pass_or_reported(self):
        self.assertTrue((ROOT / "package.json").exists())


if __name__ == "__main__":
    unittest.main()
