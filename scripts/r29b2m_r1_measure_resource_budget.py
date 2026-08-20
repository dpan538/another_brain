#!/usr/bin/env python3
"""Measure a real R29B2M-R1 model/AdamW checkpoint without any update."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.training.mlx.r29b2m_model import load_r28m1_seed  # noqa: E402
from src.training.mlx.r29b2m_q4_source import sha256_file  # noqa: E402
from src.training.mlx.r29b2m_r1_campaign import CAMPAIGN_ID, atomic_json, calculate_dynamic_budget, utc_now  # noqa: E402


OPTIMIZER_CONFIG = {
    "optimizer_class": "mlx.optimizers.AdamW",
    "learning_rate": 5e-6,
    "betas": [0.9, 0.999],
    "epsilon": 1e-8,
    "weight_decay": 0.01,
    "bias_correction": False,
    "scheduler": "constant",
    "gradient_clipping": {"kind": "global_norm", "max_norm": 1.0},
}


def directory_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--prior-artifact-root", type=Path, required=True)
    args = parser.parse_args()
    artifact_root = args.artifact_root.resolve()
    prior_root = args.prior_artifact_root.resolve()
    adopted = json.loads((artifact_root / "reports" / "adopted_evidence.json").read_text(encoding="utf-8"))
    if adopted.get("valid") is not True:
        raise ValueError("adopted_evidence_not_valid")
    seed = prior_root / "seed" / "model_seed.safetensors"
    if sha256_file(seed) != adopted.get("seed_safetensors_sha256"):
        raise ValueError("seed_changed_after_adoption")

    import mlx.core as mx
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten

    artifact_root.mkdir(parents=True, exist_ok=True)
    free_before = shutil.disk_usage(artifact_root).free
    current_artifact_bytes = directory_bytes(artifact_root)
    measured_dataset_bytes = directory_bytes(artifact_root / "dataset")
    mx.reset_peak_memory()
    model = load_r28m1_seed(seed)
    all_parameters = dict(tree_flatten(model.parameters()))
    excluded_masks: list[str] = []
    excluded_bool: list[str] = []
    excluded_nonfloating: list[str] = []
    trainable: dict[str, Any] = {}
    floating_dtypes = {mx.float16, mx.float32, mx.bfloat16}
    for name, value in all_parameters.items():
        if name.endswith(".mask"):
            excluded_masks.append(name)
        elif value.dtype == mx.bool_:
            excluded_bool.append(name)
        elif value.dtype not in floating_dtypes:
            excluded_nonfloating.append(name)
        else:
            trainable[name] = value
    trainable_parameter_count = sum(int(value.size) for value in trainable.values())
    if trainable_parameter_count != 96_421_248:
        raise ValueError(f"trainable_parameter_count:{trainable_parameter_count}")
    if len(excluded_masks) != 7 or excluded_bool or excluded_nonfloating:
        raise ValueError(f"unexpected_parameter_exclusion:masks={excluded_masks}:bool={excluded_bool}:nonfloat={excluded_nonfloating}")

    optimizer = optim.AdamW(
        learning_rate=OPTIMIZER_CONFIG["learning_rate"],
        betas=OPTIMIZER_CONFIG["betas"],
        eps=OPTIMIZER_CONFIG["epsilon"],
        weight_decay=OPTIMIZER_CONFIG["weight_decay"],
        bias_correction=OPTIMIZER_CONFIG["bias_correction"],
    )
    optimizer.init(trainable)
    mx.eval(model.parameters(), optimizer.state)
    peak_memory = int(mx.get_peak_memory())

    measurement_parent = artifact_root / "measurement_tmp"
    measurement_parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.TemporaryDirectory(prefix="serialization_", dir=measurement_parent) as directory:
            temporary_path = Path(directory)
            model_path = temporary_path / "model.safetensors"
            optimizer_path = temporary_path / "optimizer.safetensors"
            training_config_path = temporary_path / "training_config.json"
            counters_path = temporary_path / "campaign_state.json"
            mx.save_safetensors(str(model_path), all_parameters)
            mx.save_safetensors(str(optimizer_path), dict(tree_flatten(optimizer.state)))
            write_json(training_config_path, {"campaign_id": CAMPAIGN_ID, "optimizer": OPTIMIZER_CONFIG, "context_length": 256, "microbatch": 1, "gradient_accumulation": 8})
            write_json(counters_path, {"training_started": False, "global_optimizer_step": 0, "optimizer_tokens": 0, "assistant_target_tokens": 0})
            model_weight_bytes = model_path.stat().st_size
            optimizer_state_bytes = optimizer_path.stat().st_size
            metadata_bytes = training_config_path.stat().st_size + counters_path.stat().st_size
            serialization_temporary_peak = directory_bytes(temporary_path)
            full_checkpoint_bytes = model_weight_bytes + optimizer_state_bytes + metadata_bytes
            if serialization_temporary_peak != full_checkpoint_bytes:
                raise ValueError("serialization_peak_accounting_mismatch")
    finally:
        temporary_deleted = temporary_path is None or not temporary_path.exists()
        try:
            measurement_parent.rmdir()
        except OSError:
            pass
    if not temporary_deleted:
        raise ValueError("measurement_temporary_files_not_deleted")

    budget = calculate_dynamic_budget(full_checkpoint_bytes=full_checkpoint_bytes, measured_final_dataset_bytes=measured_dataset_bytes)
    projected_post_campaign_free = free_before - budget["retained_checkpoint_budget"] - budget["dataset_budget"] - budget["evaluation_and_log_budget"]
    if free_before < budget["required_free_before_training"]:
        decision = "BLOCKED_RESOURCE_WITH_MEASURED_EVIDENCE"
    elif projected_post_campaign_free < budget["post_campaign_warning_floor"]:
        decision = "RESOURCE_WARNING"
    else:
        decision = "RESOURCE_READY"
    report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": True,
        "decision": decision,
        "measurement_kind": "real_model_and_adamw_serialization_no_optimizer_update",
        "model_weight_bytes": model_weight_bytes,
        "optimizer_state_bytes": optimizer_state_bytes,
        "metadata_bytes": metadata_bytes,
        "full_checkpoint_bytes": full_checkpoint_bytes,
        "current_seed_bytes": seed.stat().st_size,
        "current_artifact_bytes": current_artifact_bytes,
        "current_free_disk_bytes": free_before,
        "serialization_temporary_peak_bytes": serialization_temporary_peak,
        "temporary_measurement_deleted": temporary_deleted,
        "mlx_peak_memory_bytes": peak_memory,
        "model_trainable_parameter_count": trainable_parameter_count,
        "parameter_exclusion": {
            "mask_names": excluded_masks,
            "bool_names": excluded_bool,
            "nonfloating_names": excluded_nonfloating,
            "all_trainable_arrays_floating": all(value.dtype in floating_dtypes for value in trainable.values()),
        },
        "optimizer": OPTIMIZER_CONFIG,
        "measured_final_dataset_bytes": measured_dataset_bytes,
        "dataset_measurement_status": "measured_existing_final_dataset" if measured_dataset_bytes else "not_built_floor_budget_applied_remeasure_after_dataset_validation",
        "dynamic_disk_contract": budget,
        "projected_post_campaign_free_bytes": projected_post_campaign_free,
        "existing_seed_excluded_from_future_growth": True,
        "current_artifacts_excluded_from_future_growth": True,
        "atomic_headroom_is_temporary_not_retained": True,
        "checkpoint_prewrite_free_after_atomic_save_bytes": free_before - full_checkpoint_bytes,
        "checkpoint_prewrite_hard_floor_met": free_before - full_checkpoint_bytes >= budget["post_campaign_hard_floor"],
        "training_started": False,
        "optimizer_update_executed": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }
    atomic_json(artifact_root / "reports" / "resource_measurement.json", report)
    atomic_json(artifact_root / "reports" / "resource_decision.json", {key: report[key] for key in ("campaign_id", "created_at", "valid", "decision", "current_free_disk_bytes", "full_checkpoint_bytes", "measured_final_dataset_bytes", "dynamic_disk_contract", "projected_post_campaign_free_bytes", "training_started", "optimizer_tokens", "assistant_target_tokens")})
    print(json.dumps({"decision": decision, "model_bytes": model_weight_bytes, "optimizer_bytes": optimizer_state_bytes, "full_checkpoint_bytes": full_checkpoint_bytes, "required_free": budget["required_free_before_training"], "current_free": free_before}, sort_keys=True), flush=True)
    return 0 if decision != "BLOCKED_RESOURCE_WITH_MEASURED_EVIDENCE" else 3


if __name__ == "__main__":
    raise SystemExit(main())
