#!/usr/bin/env python3
"""Dynamic R3 resource decision based on the measured R1 checkpoint contract."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_r1_campaign import calculate_dynamic_budget  # noqa: E402
from src.training.mlx.r29b2m_r3_campaign import CAMPAIGN_ID, atomic_json, utc_now  # noqa: E402
from src.training.mlx.r29b2m_r3_loader import sha256_file  # noqa: E402


def directory_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--prior-resource-measurement", type=Path, required=True)
    parser.add_argument("--seed", type=Path, required=True)
    parser.add_argument("--dataset-root", type=Path, required=True)
    args = parser.parse_args()
    artifact_root = args.artifact_root.resolve()
    prior = json.loads(args.prior_resource_measurement.read_text(encoding="utf-8"))
    adopted = json.loads((artifact_root / "reports" / "adopted_evidence.json").read_text(encoding="utf-8"))
    if prior.get("valid") is not True or prior.get("model_trainable_parameter_count") != 96_421_248:
        raise ValueError("prior_dynamic_resource_measurement_invalid")
    if sha256_file(args.seed) != adopted["parent_seed"]["sha256"]:
        raise ValueError("resource_gate_parent_seed_mismatch")
    full_checkpoint_bytes = int(prior["full_checkpoint_bytes"])
    dataset_bytes = directory_bytes(args.dataset_root.resolve())
    budget = calculate_dynamic_budget(full_checkpoint_bytes=full_checkpoint_bytes, measured_final_dataset_bytes=dataset_bytes)
    free = shutil.disk_usage(artifact_root).free
    projected = free - budget["retained_checkpoint_budget"] - budget["dataset_budget"] - budget["evaluation_and_log_budget"]
    free_after_atomic = free - full_checkpoint_bytes
    if free < budget["required_free_before_training"] or free_after_atomic < budget["post_campaign_hard_floor"]:
        decision = "BLOCKED_RESOURCE_WITH_MEASURED_EVIDENCE"
    elif projected < budget["post_campaign_warning_floor"]:
        decision = "RESOURCE_WARNING"
    else:
        decision = "RESOURCE_READY"
    report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": True,
        "measurement_kind": "hash-bound-adoption-of-r1-real-model-adamw-serialization-plus-current-r3-disk-and-r2-dataset-measurement",
        "prior_measurement_sha256": sha256_file(args.prior_resource_measurement),
        "parent_seed_sha256": adopted["parent_seed"]["sha256"],
        "model_weight_bytes": prior["model_weight_bytes"],
        "optimizer_state_bytes": prior["optimizer_state_bytes"],
        "full_checkpoint_bytes": full_checkpoint_bytes,
        "dataset_bytes": dataset_bytes,
        "current_free_disk_bytes": free,
        "dynamic_disk_contract": budget,
        "projected_post_campaign_free_bytes": projected,
        "checkpoint_prewrite_free_after_atomic_save_bytes": free_after_atomic,
        "checkpoint_prewrite_hard_floor_met": free_after_atomic >= budget["post_campaign_hard_floor"],
        "decision": decision,
        "training_started": False,
        "optimizer_update_executed": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }
    atomic_json(artifact_root / "reports" / "resource_report.json", report)
    print(json.dumps({"decision": decision, "current_free": free, "required_free": budget["required_free_before_training"], "full_checkpoint_bytes": full_checkpoint_bytes}, sort_keys=True), flush=True)
    return 0 if decision != "BLOCKED_RESOURCE_WITH_MEASURED_EVIDENCE" else 3


if __name__ == "__main__":
    raise SystemExit(main())
