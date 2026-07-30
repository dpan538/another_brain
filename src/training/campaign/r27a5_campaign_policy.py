import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
POLICY_PATH = ROOT / "data/training_registry/r27a5_training_campaign_policy.json"


DEFAULT_POLICY = {
    "campaign_id": "r27a5_sustained_pilot_distillation_v1",
    "campaign_type": "sustained_engineering_pilot",
    "product_training": False,
    "formal_decoder_training": False,
    "phase_4": False,
    "product_model_admission": False,
    "browser_admission": False,
    "release_checkpoint": False,
    "allow_resume_from_r27a4_checkpoint": True,
    "allow_new_lineage_if_r27a4_artifacts_missing": True,
    "max_total_steps": 12000,
    "max_total_train_tokens": 24000000,
    "cpu_fallback_max_total_steps": 6000,
    "cpu_fallback_max_total_train_tokens": 10000000,
    "max_stage_count": 4,
    "max_checkpoint_count": 8,
    "allow_hyperparameter_sweep": False,
    "allow_remote_model_weights": False,
    "allow_weight_commit": False,
    "allow_raw_corpus_commit": False,
    "allow_processed_text_commit": False,
    "allow_live_teacher_by_default": False,
    "active_approval_after_completion": 0,
}


def ensure_policy():
    POLICY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not POLICY_PATH.exists():
        POLICY_PATH.write_text(json.dumps(DEFAULT_POLICY, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))


def load_policy():
    return ensure_policy()
