#!/usr/bin/env python3
"""Measure exact R30J1A tensor and trainable-scope counts on MLX."""

from __future__ import annotations

import argparse
import gc
import json
import os
from pathlib import Path
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT))

import mlx.core as mx  # noqa: E402

from src.training.mlx.r30j1a_model import parameter_report  # noqa: E402
from src.training.mlx.r30j1a_training import create_model, load_dataset, resource_snapshot  # noqa: E402


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", type=Path, default=ROOT / "artifacts" / "r30j1a" / "dataset")
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--r28-seed", type=Path, required=True)
    parser.add_argument("--r3-seed", type=Path, required=True)
    args = parser.parse_args()
    dataset = load_dataset(args.dataset_root, open_heldout=False)
    before = resource_snapshot(args.artifact_root)
    arms = {}
    canonical_counts = None
    for arm, label, source, attention in (
        ("A", "r28m1_q4_recovered", args.r28_seed, "causal"),
        ("B", "r28m1_q4_recovered", args.r28_seed, "bidirectional"),
        ("C", "r3_stage_a_080k", args.r3_seed, "causal"),
        ("D", "r3_stage_a_080k", args.r3_seed, "bidirectional"),
    ):
        model, architecture = create_model(
            lineage_path=source,
            lineage_label=label,
            attention_mode=attention,
            trainable_scope="probe",
            register_labels=dataset.register_labels,
        )
        report = parameter_report(model)
        arms[arm] = {
            "lineage": label,
            "attention": attention,
            "warm_start_label": architecture["warm_start_label"],
            "source_checkpoint_parity_claim": False,
            "parameter_report": report,
        }
        canonical_counts = canonical_counts or report
        del model
        gc.collect()
        mx.clear_cache()
    main_model, main_architecture = create_model(
        lineage_path=args.r28_seed,
        lineage_label="r28m1_q4_recovered",
        attention_mode="causal",
        trainable_scope="last_two",
        register_labels=dataset.register_labels,
    )
    main_report = parameter_report(main_model)
    after = resource_snapshot(args.artifact_root)
    expected = {
        "source_base_without_lm_head_and_before_extension": 82_085_248,
        "expanded_base_with_512_positions": 82_314_624,
        "projection": 1_085_440,
        "heads_for_eight_registers": 11_286,
        "probe_trainable": 1_326_102,
        "last_two_partial_adaptation_trainable": 20_618_774,
    }
    actual = {
        "expanded_base_with_512_positions": canonical_counts["base_learned_parameter_count"],
        "projection": canonical_counts["projection_parameter_count"],
        "heads": canonical_counts["head_parameter_count"],
        "probe_trainable": canonical_counts["trainable_parameter_count"],
        "last_two_partial_adaptation_trainable": main_report["trainable_parameter_count"],
    }
    if actual != {key: value for key, value in expected.items() if key != "source_base_without_lm_head_and_before_extension" and key != "heads_for_eight_registers"} | {"heads": expected["heads_for_eight_registers"]}:
        raise ValueError(f"architecture_parameter_contract_mismatch:{actual}")
    report = {
        "schema_version": "r30j1a.architecture-measurement.v1",
        "valid": True,
        "register_labels": list(dataset.register_labels),
        "register_count": len(dataset.register_labels),
        "expected": expected,
        "actual": actual,
        "arms": arms,
        "main_last_two": main_report,
        "main_architecture_sha256": main_architecture["architecture_sha256"],
        "context_length": 512,
        "normal_target": 448,
        "reserve": 64,
        "lm_head_absent": True,
        "autoregressive_decode": False,
        "resource_before": before,
        "resource_after": after,
        "optimizer_updates": 0,
    }
    atomic_json(args.artifact_root / "architecture" / "architecture_measurement.json", report)
    print(json.dumps({"valid": True, **actual, "lm_head_absent": True, "optimizer_updates": 0}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
