import tempfile
import unittest
from pathlib import Path

from src.training.campaign.r27a9b_candidate_freeze import build_freeze_decision, rank_candidate_dicts, score_candidate


def safe_candidate(checkpoint_path: str) -> dict:
    return {
        "candidate_id": "safe",
        "source_priority": 1,
        "checkpoint_path": checkpoint_path,
        "checkpoint_kind": "best_product_probe",
        "safety_guard_score": 1.0,
        "leakage_detected": False,
        "fits_100mb": True,
        "rag_honesty_score": 0.8,
        "dialogue_readiness_score": 0.6,
        "answer_as_user_score": 0.6,
        "collapse_risk": 0.0,
        "dev_loss": 5.0,
        "chinese_first_behavior": "trained_or_evaluated",
        "dialogue_readiness_label": "not_ready",
    }


class R27A9BCandidateFreezeTests(unittest.TestCase):
    def test_missing_checkpoint_is_hard_reject(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "artifacts/r27a4/model_lab/tokenizer").mkdir(parents=True)
            (root / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json").write_text("{}", encoding="utf-8")
            ranked = score_candidate(safe_candidate("artifacts/missing.pt"), root)
            self.assertFalse(ranked["eligible"])
            self.assertIn("checkpoint_missing", ranked["hard_reject_reasons"])

    def test_best_safe_candidate_wins_over_missing_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ckpt = root / "artifacts/r27a8b/model_lab/checkpoints/best.pt"
            ckpt.parent.mkdir(parents=True)
            ckpt.write_bytes(b"0" * (1024 * 1024 + 1))
            (root / "artifacts/r27a4/model_lab/tokenizer").mkdir(parents=True)
            (root / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json").write_text("{}", encoding="utf-8")
            good = safe_candidate("artifacts/r27a8b/model_lab/checkpoints/best.pt")
            bad = {**safe_candidate("artifacts/r27a7/model_lab/checkpoints/missing.pt"), "candidate_id": "bad"}
            ranking = rank_candidate_dicts([bad, good], root)
            self.assertEqual(ranking["selected_candidate_id"], "safe")
            self.assertEqual(ranking["eligible_count"], 1)

    def test_freeze_decision_is_engineering_only(self):
        ranking = {
            "selected_candidate": {
                "candidate_id": "safe",
                "dialogue_readiness_label": "not_ready",
                "final_not_selected_reason": "final_worse_than_best_or_not_best_probe",
            }
        }
        decision = build_freeze_decision(ranking)
        self.assertEqual(decision["decision"], "FREEZE_ENGINEERING_CANDIDATE")
        self.assertFalse(decision["browser_admission"])
        self.assertFalse(decision["release_checkpoint"])
        self.assertFalse(decision["micro_recovery_required"])
