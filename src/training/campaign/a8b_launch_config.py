from __future__ import annotations

from src.training.campaign.early_stop_policy_v3 import POLICY_V3


def build_a8b_launch_config(salvage: dict, audit: dict, device: dict, smoke: dict, checkpoint: dict) -> dict:
    blockers = []
    if salvage.get("active_training_approval"):
        blockers.append("active_approval_stuck")
    if salvage.get("corrupted_checkpoints"):
        blockers.append("corrupted_checkpoint")
    if audit.get("ok") is not True:
        blockers.append("token_accounting_untrusted_and_cannot_be_fixed")
    if device.get("disk_space_critical"):
        blockers.append("disk_critical")
    if checkpoint.get("ok") is not True and not smoke.get("selected_candidate", {}).get("ok"):
        blockers.append("no_safe_checkpoint_and_no_safe_new_lineage")
    selected = smoke.get("selected_candidate", {})
    selected_model = selected.get("candidate", "continue_best_mini8m")
    selected_device = smoke.get("selected_device") or device.get("selected_device") or "cpu"
    if selected_model.startswith("new_") and selected.get("ok"):
        selected_checkpoint = None
    else:
        selected_checkpoint = checkpoint.get("selected_checkpoint")
        selected_model = "continue_best_mini8m"
    capacity_risk = "high"
    if selected_model in {"new_100m", "new_125m"}:
        capacity_risk = "medium"
    if selected_model in {"new_60m"}:
        capacity_risk = "medium"
    if selected_model == "continue_best_mini8m":
        capacity_risk = "high"
    ready = not blockers
    base = {
        "ready": ready,
        "recommended_next": "R27A8B",
        "primary_token_metric": "optimizer_tokens",
        "selected_checkpoint": selected_checkpoint,
        "selected_model": selected_model,
        "selected_device": selected_device,
        "selected_context_length": int(selected.get("context_length") or 256),
        "resource_profile": {
            "threads": 2,
            "batch_strategy": "conservative",
            "grad_accumulation": True,
            "logging": "clipped",
        },
        "minimum_wall_clock_before_metric_stop_hours": POLICY_V3["minimum_wall_clock_before_metric_stop_hours"],
        "minimum_optimizer_tokens_before_metric_stop": POLICY_V3["minimum_optimizer_tokens_before_metric_stop"],
        "minimum_segments_before_metric_stop": POLICY_V3["minimum_segments_before_metric_stop"],
        "wall_clock_cap_hours": 12,
        "max_optimizer_tokens": 120_000_000,
        "max_segments": 12,
        "safe_to_train": ready,
        "capacity_risk": capacity_risk,
        "reasons": [
            "R27A7 train-token accounting is repaired by using optimizer_tokens as the A8B primary metric.",
            "Metric no-improvement is blocked before the minimum wall-clock/token/segment budget.",
            "A8B is a launch config only; R27A7R2 does not start A8.",
        ],
        "blockers": blockers,
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "product_model_admission": False,
        "browser_admission": False,
        "release_checkpoint": False,
    }
    return base
