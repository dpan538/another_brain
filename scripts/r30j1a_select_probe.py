#!/usr/bin/env python3
"""Select one R30J1A probe architecture from dev evidence only."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--segments", nargs=4, default=("probe_arm_a", "probe_arm_b", "probe_arm_c", "probe_arm_d"))
    args = parser.parse_args()
    arm_specs = {
        "A": ("r28m1_q4_recovered", "causal"),
        "B": ("r28m1_q4_recovered", "bidirectional"),
        "C": ("r3_stage_a_080k", "causal"),
        "D": ("r3_stage_a_080k", "bidirectional"),
    }
    candidates = []
    for arm, segment in zip(arm_specs, args.segments):
        root = args.artifact_root / "training_flight_recorder" / "segments" / segment
        dev = json.loads((root / "dev_eval.json").read_text(encoding="utf-8"))
        receipt = json.loads((root / "segment_receipt.json").read_text(encoding="utf-8"))
        decision = json.loads((root / "parent_decision.json").read_text(encoding="utf-8"))
        if decision["decision"] not in {"CONTINUE", "HOLD"} or receipt["checkpoint"]["verified"] is not True:
            raise ValueError("probe_not_audited:" + arm)
        domain = float(dev["domain"]["macro_f1"])
        register = float(dev["register"]["macro_f1"])
        mechanics = float(dev["mechanics"]["macro_f1"])
        matched = float(dev["representation"]["matched_style_contrast_accuracy"])
        shortcut = float(dev["maximum_shortcut_drop_points"])
        collapsed = bool(dev["representation"]["collapsed"])
        peak = int(receipt["peak_mlx_memory_bytes"])
        # Value and generalisation rank ahead of raw loss and memory.  Lower
        # shortcut drop and resource cost break otherwise similar outcomes.
        rank = (
            int(not collapsed),
            matched,
            domain,
            register,
            mechanics,
            -shortcut,
            -peak,
        )
        candidates.append({
            "arm": arm,
            "segment": segment,
            "lineage": arm_specs[arm][0],
            "attention": arm_specs[arm][1],
            "domain_macro_f1": domain,
            "register_macro_f1": register,
            "mechanics_macro_f1": mechanics,
            "matched_style_contrast_accuracy": matched,
            "maximum_shortcut_drop_points": shortcut,
            "representation_collapsed": collapsed,
            "peak_mlx_memory_bytes": peak,
            "checkpoint_logical_path": receipt["checkpoint_logical_path"],
            "rank_tuple": list(rank),
        })
    ranked = sorted(candidates, key=lambda row: tuple(row["rank_tuple"]), reverse=True)
    selected = ranked[0]
    report = {
        "schema_version": "r30j1a.probe-decision.v1",
        "valid": True,
        "selection_split": "dev",
        "heldout_opened": False,
        "raw_training_loss_not_primary": True,
        "candidate_count": 4,
        "selected_candidate_count": 1,
        "selected_arm": selected["arm"],
        "selected_lineage": selected["lineage"],
        "selected_attention": selected["attention"],
        "selected_checkpoint_logical_path": selected["checkpoint_logical_path"],
        "main_scope_planned": "last_two",
        "ranked": ranked,
    }
    atomic_json(args.artifact_root / "reports" / "probe_decision.json", report)
    print(json.dumps({"valid": True, "selected_arm": selected["arm"], "lineage": selected["lineage"], "attention": selected["attention"], "heldout_opened": False}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
