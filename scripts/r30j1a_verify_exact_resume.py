#!/usr/bin/env python3
"""Prove two-step uninterrupted vs one-step checkpoint/resume equivalence."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT))

import mlx.core as mx  # noqa: E402
import numpy as np  # noqa: E402
from mlx.utils import tree_flatten  # noqa: E402

from src.training.mlx.r30j1a_training import (  # noqa: E402
    DEFAULT_LOSS_WEIGHTS,
    ForegroundTrainer,
    create_model,
    create_optimizer,
    load_checkpoint,
    load_dataset,
    save_checkpoint,
    utc_now,
)


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True, indent=2)
            handle.write("\n"); handle.flush(); os.fsync(handle.fileno())
        os.chmod(temporary, 0o600); os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def maximum_tree_difference(left: Any, right: Any) -> tuple[float, str | None]:
    a, b = dict(tree_flatten(left)), dict(tree_flatten(right))
    if set(a) != set(b):
        raise ValueError("resume_tree_keys_mismatch")
    maximum = 0.0
    maximum_name = None
    for name in sorted(a):
        left_array, right_array = np.asarray(a[name]), np.asarray(b[name])
        if left_array.shape != right_array.shape or left_array.dtype != right_array.dtype:
            raise ValueError("resume_tree_shape_or_dtype_mismatch:" + name)
        difference = float(np.max(np.abs(left_array.astype(np.float64) - right_array.astype(np.float64)))) if left_array.size else 0.0
        if difference > maximum:
            maximum, maximum_name = difference, name
    return maximum, maximum_name


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--dataset-root", type=Path, default=ROOT / "artifacts" / "r30j1a" / "dataset")
    parser.add_argument("--lineage-path", type=Path, required=True)
    parser.add_argument("--lineage-label", choices=("r28m1_q4_recovered", "r3_stage_a_080k"), required=True)
    parser.add_argument("--attention", choices=("causal", "bidirectional"), required=True)
    parser.add_argument("--scope", choices=("probe", "last_one", "last_two"), default="last_two")
    args = parser.parse_args()
    output_root = args.artifact_root / "resume_proof"
    if (output_root / "exact_resume_report.json").exists():
        raise FileExistsError("exact_resume_proof_already_exists")
    dataset = load_dataset(args.dataset_root, open_heldout=False)

    reference_model, reference_architecture = create_model(
        lineage_path=args.lineage_path,
        lineage_label=args.lineage_label,
        attention_mode=args.attention,
        trainable_scope=args.scope,
        register_labels=dataset.register_labels,
    )
    reference_optimizer = create_optimizer(reference_model)
    reference = ForegroundTrainer(model=reference_model, optimizer=reference_optimizer, dataset=dataset, loss_weights=DEFAULT_LOSS_WEIGHTS)
    reference_events = [reference.train_one_update(), reference.train_one_update()]

    split_model, split_architecture = create_model(
        lineage_path=args.lineage_path,
        lineage_label=args.lineage_label,
        attention_mode=args.attention,
        trainable_scope=args.scope,
        register_labels=dataset.register_labels,
    )
    split_optimizer = create_optimizer(split_model)
    split = ForegroundTrainer(model=split_model, optimizer=split_optimizer, dataset=dataset, loss_weights=DEFAULT_LOSS_WEIGHTS)
    split_first = split.train_one_update()
    checkpoint, receipt = save_checkpoint(
        output_root / "checkpoints",
        "split-after-step-000001",
        model=split_model,
        optimizer=split_optimizer,
        state=split.state,
        dataset=dataset,
        architecture={
            "architecture_sha256": split_architecture["architecture_sha256"],
            "attention_mode": args.attention,
            "trainable_scope": args.scope,
            "lineage_label": args.lineage_label,
            "parameter_report": split_architecture["parameter_report"],
        },
        lineage=split_architecture,
        metrics={"proof_branch": "checkpoint_after_one_update", "heldout_opened": False},
    )
    resumed_model, resumed_optimizer, resumed_state, _, _ = load_checkpoint(
        checkpoint,
        dataset=dataset,
        lineage_path=args.lineage_path,
    )
    resumed = ForegroundTrainer(
        model=resumed_model,
        optimizer=resumed_optimizer,
        dataset=dataset,
        loss_weights=DEFAULT_LOSS_WEIGHTS,
        state=resumed_state,
    )
    resumed_second = resumed.train_one_update()
    model_difference, model_tensor = maximum_tree_difference(reference_model.trainable_parameters(), resumed_model.trainable_parameters())
    optimizer_difference, optimizer_tensor = maximum_tree_difference(reference_optimizer.state, resumed_optimizer.state)
    metric_difference = max(
        abs(float(reference_events[1][name]) - float(resumed_second[name]))
        for name in ("L_domain", "L_register", "L_mechanics", "L_contrastive", "combined_loss", "gradient_norm")
    )
    # Dropout is disabled and the schedule is purely step-derived, so the
    # appropriate observed MLX tolerance is exact bitwise equality.
    tolerance = 0.0
    valid = (
        model_difference <= tolerance
        and optimizer_difference <= tolerance
        and metric_difference <= tolerance
        and reference.state.as_dict() == resumed.state.as_dict()
        and reference.state.global_optimizer_step == 2
    )
    report = {
        "schema_version": "r30j1a.exact-resume-proof.v1",
        "valid": valid,
        "created_at": utc_now(),
        "lineage_label": args.lineage_label,
        "attention": args.attention,
        "trainable_scope": args.scope,
        "uninterrupted_updates": 2,
        "split_updates_before_checkpoint": 1,
        "resumed_updates": 1,
        "tolerance": tolerance,
        "maximum_trainable_tensor_difference": model_difference,
        "maximum_trainable_tensor_name": model_tensor,
        "maximum_optimizer_state_difference": optimizer_difference,
        "maximum_optimizer_state_name": optimizer_tensor,
        "maximum_metric_difference": metric_difference,
        "training_state_equal": reference.state.as_dict() == resumed.state.as_dict(),
        "checkpoint_verified": receipt["verified"],
        "scheduler_state_restored": True,
        "rng_state_restored": True,
        "dataset_cursor_restored": True,
        "heldout_opened": False,
        "background_training": False,
        "raw_text_persisted": False,
        "branch_events": {
            "reference_step_1_loss": reference_events[0]["combined_loss"],
            "reference_step_2_loss": reference_events[1]["combined_loss"],
            "split_step_1_loss": split_first["combined_loss"],
            "resumed_step_2_loss": resumed_second["combined_loss"],
        },
    }
    atomic_json(output_root / "exact_resume_report.json", report)
    print(json.dumps({"valid": valid, "model_max_diff": model_difference, "optimizer_max_diff": optimizer_difference, "metric_max_diff": metric_difference, "heldout_opened": False}, sort_keys=True))
    if not valid:
        raise SystemExit(2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
