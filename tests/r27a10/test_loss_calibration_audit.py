import json
import tempfile
import unittest
from pathlib import Path

from src.training.eval.loss_calibration import audit_loss_calibration


def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


class R27A10LossCalibrationTests(unittest.TestCase):
    def test_last_batch_train_loss_blocks_training(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_json(
                root / "artifacts/r27a8b/reports/campaign_ledger.json",
                {
                    "segments": [
                        {
                            "segment_index": 11,
                            "stage_id": "rag_value_answer_as_user",
                            "context_length": 256,
                            "train_loss_end": 0.24,
                            "dev_loss": 5.3,
                            "stratified_heldout_loss": 3.8,
                        }
                    ]
                },
            )
            write_json(root / "artifacts/r27a8b/reports/campaign_evaluation.json", {"train_loss": 0.24, "dev_loss": 5.3, "stratified_heldout_loss": 3.8})
            write_json(root / "artifacts/r27a8b/reports/dialogue_readiness.json", {"dialogue_readiness": "not_ready"})
            report = audit_loss_calibration(root)
            self.assertEqual(report["loss_gap_status"], "likely_accounting_bug")
            self.assertTrue(report["block_training"])
            self.assertFalse(report["train_loss_trusted"])
