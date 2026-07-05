import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
POLICY_PATH = ROOT / "data/training_registry/r27a4_training_campaign_policy.json"


def load_policy(path=POLICY_PATH):
    policy = json.loads(Path(path).read_text(encoding="utf-8"))
    validate_policy(policy)
    return policy


def validate_policy(policy):
    required_false = [
        "product_training",
        "formal_decoder_training",
        "phase_4",
        "release_checkpoint",
        "browser_admission",
        "allow_hyperparameter_sweep",
        "allow_external_llm_api_by_default",
        "allow_doubao_by_default",
        "allow_remote_model_weights",
        "allow_weight_commit",
        "allow_raw_corpus_commit",
    ]
    failures = [key for key in required_false if policy.get(key) is not False]
    if failures:
        raise ValueError(f"unsafe_campaign_policy:{','.join(failures)}")
    if int(policy.get("allowed_stage_count", 0)) != 3:
        raise ValueError("r27a4_requires_three_campaign_stages")
    if int(policy.get("max_total_steps", 0)) > 6000:
        raise ValueError("r27a4_step_cap_exceeded")
    if int(policy.get("max_total_train_tokens", 0)) > 12000000:
        raise ValueError("r27a4_token_cap_exceeded")
    if int(policy.get("max_checkpoint_count", 0)) > 6:
        raise ValueError("r27a4_checkpoint_cap_exceeded")
    return True


def campaign_caps(policy=None):
    policy = policy or load_policy()
    return {
        "max_total_steps": int(policy["max_total_steps"]),
        "max_total_train_tokens": int(policy["max_total_train_tokens"]),
        "max_checkpoint_count": int(policy["max_checkpoint_count"]),
        "allowed_stage_count": int(policy["allowed_stage_count"]),
    }
