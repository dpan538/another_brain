import json
import time
from pathlib import Path

from src.training.campaign.best_checkpoint import choose_best


ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / "artifacts/r27a6"
LEDGER = ROOT / "data/training_registry/r27a6_autonomous_campaign_ledger.json"
POLICY = ROOT / "data/training_registry/r27a6_autonomous_campaign_policy.json"


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def load_json(path, default=None):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else (default or {})


def write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def default_policy():
    return {
        "campaign_id": "r27a6_autonomous_longrun_dialogue_readiness_v1",
        "campaign_type": "autonomous_engineering_pilot",
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "product_model_admission": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "allow_resume_from_r27a5_checkpoint": True,
        "allow_new_lineage_if_r27a5_artifacts_missing": True,
        "allow_segmented_autonomous_training": True,
        "max_total_steps": 30000,
        "max_total_train_tokens": 50000000,
        "accelerator_max_total_steps": 60000,
        "accelerator_max_total_train_tokens": 120000000,
        "max_segments": 10,
        "max_steps_per_segment": 4000,
        "max_tokens_per_segment": 8000000,
        "max_checkpoint_count": 12,
        "allow_resume": True,
        "allow_best_checkpoint_selection": True,
        "allow_hyperparameter_sweep": False,
        "allow_remote_model_weights": False,
        "allow_weight_commit": False,
        "allow_raw_corpus_commit": False,
        "allow_processed_text_commit": False,
        "allow_live_teacher_by_default": False,
        "active_approval_after_completion": 0,
    }


def append_stage(stage):
    ledger = load_json(LEDGER, {"campaign_id": default_policy()["campaign_id"], "stages": []})
    ledger.setdefault("stages", []).append(stage)
    ledger["updated_at_utc"] = now_utc()
    ledger["best_checkpoints"] = choose_best(ledger["stages"])
    ledger["active_approval_after_completion"] = 0
    ledger["product_training"] = False
    ledger["formal_decoder_training"] = False
    ledger["phase_4"] = False
    ledger["release_checkpoint"] = False
    write_json(LEDGER, ledger)
    return ledger
