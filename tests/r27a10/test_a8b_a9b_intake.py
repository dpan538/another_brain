import json
import tempfile
import unittest
from pathlib import Path

from src.training.campaign.r27a10_intake import build_a8b_a9b_intake


def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


class R27A10IntakeTests(unittest.TestCase):
    def test_intake_flags_a8b_tokens_below_minimum(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_json(
                root / "artifacts/r27a8b/reports/campaign_ledger.json",
                {
                    "campaign_id": "a8b",
                    "selected_model": "new_100m",
                    "device": "mps",
                    "optimizer_tokens": 10,
                    "policy": {"minimum_optimizer_tokens_before_metric_stop": 15},
                    "best_checkpoints": {"best_product_probe_checkpoint": "best.pt", "best_dev_loss": 4.9},
                    "segments": [{"segment_index": 9, "checkpoint_path": "best.pt", "context_length": 256}],
                },
            )
            write_json(root / "artifacts/r27a8b/reports/campaign_evaluation.json", {"train_loss": 0.2, "dev_loss": 5.0})
            write_json(root / "artifacts/r27a8b/reports/dialogue_readiness.json", {"dialogue_readiness": "not_ready"})
            write_json(root / "artifacts/r27a8b/reports/100mb_budget.json", {"fits_100mb": True, "budget": {"q4_total_estimate_bytes": 95}})
            report = build_a8b_a9b_intake(root)
            self.assertTrue(report["a8b"]["optimizer_tokens_below_minimum"])
            self.assertEqual(report["a8b"]["selected_model"], "new_100m")
            self.assertEqual(report["inputs"]["b4_bundle_source"]["bytes"], 22204089)
