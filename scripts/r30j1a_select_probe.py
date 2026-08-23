#!/usr/bin/env python3
"""Select at most one qualified R30J1A probe from frozen DEV evidence."""

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


def class_f1(report: dict[str, Any], label: str, label_index: int) -> float:
    per_class = report["per_class"]
    row = per_class[label] if isinstance(per_class, dict) else per_class[label_index]
    return float(row["f1"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument(
        "--config",
        type=Path,
        default=ROOT / "config" / "r30j1a_personal_representation_bootstrap_v1.json",
    )
    parser.add_argument(
        "--segments",
        nargs=4,
        default=(
            "probe_arm_a_0050_cache_replay",
            "probe_arm_b_0050",
            "probe_arm_c_0050",
            "probe_arm_d_0050",
        ),
    )
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    gates = config["value_gates"]
    baselines = json.loads((args.artifact_root / "reports" / "shortcut_baselines.json").read_text(encoding="utf-8"))
    if baselines["split"] != "dev" or baselines["heldout_opened"] is not False:
        raise ValueError("probe_baseline_not_dev_only")
    surface_domain = float(baselines["surface_s1"]["domain"]["macro_f1"])
    lexical_domain = float(baselines["lexical_s2"]["domain"]["macro_f1"])
    arm_specs = {
        "A": ("r28m1_q4_recovered", "causal"),
        "B": ("r28m1_q4_recovered", "bidirectional"),
        "C": ("r3_stage_a_080k", "causal"),
        "D": ("r3_stage_a_080k", "bidirectional"),
    }
    candidates = []
    for arm, segment in zip(arm_specs, args.segments):
        root = args.artifact_root / "training_flight_recorder" / "segments" / segment
        segment_manifest = json.loads((root / "segment_manifest.json").read_text(encoding="utf-8"))
        dev = json.loads((root / "dev_eval.json").read_text(encoding="utf-8"))
        receipt = json.loads((root / "segment_receipt.json").read_text(encoding="utf-8"))
        decision = json.loads((root / "parent_decision.json").read_text(encoding="utf-8"))
        expected_lineage, expected_attention = arm_specs[arm]
        probe_contract_valid = (
            segment_manifest.get("phase") == "PROBE"
            and segment_manifest.get("planned_steps") == 50
            and segment_manifest.get("foreground_training") is True
            and segment_manifest.get("background_training") is False
            and segment_manifest.get("heldout_opened") is False
            and segment_manifest.get("architecture", {}).get("lineage_label") == expected_lineage
            and segment_manifest.get("architecture", {}).get("attention_mode") == expected_attention
            and segment_manifest.get("architecture", {}).get("trainable_scope") == "probe"
            and dev.get("split") == "dev"
            and dev.get("heldout_opened") is False
            and receipt.get("completed") is True
            and receipt.get("failed") is False
            and receipt.get("exact_bounded_steps") == 50
            and int(receipt.get("ending_global_optimizer_step", -1))
            - int(receipt.get("starting_global_optimizer_step", -1)) == 50
            and receipt.get("foreground_training") is True
            and receipt.get("background_training") is False
            and receipt.get("heldout_opened") is False
            and receipt.get("checkpoint_verified") is True
            and receipt.get("parent_decision_pending") is False
            and decision.get("segment") == segment
            and decision.get("all_synchronous_auditors_returned") is True
            and decision.get("training_running_during_audit") is False
        )
        if (
            not probe_contract_valid
            or decision["decision"] not in {"CONTINUE", "HOLD"}
            or receipt["checkpoint"]["verified"] is not True
        ):
            raise ValueError("probe_not_audited:" + arm)
        domain = float(dev["domain"]["macro_f1"])
        register = float(dev["register"]["macro_f1"])
        mechanics = float(dev["mechanics"]["macro_f1"])
        matched = float(dev["representation"]["matched_style_contrast_accuracy"])
        shortcut = float(dev["maximum_shortcut_drop_points"])
        collapsed = bool(dev["representation"]["collapsed"])
        peak = int(receipt["peak_mlx_memory_bytes"])
        surface_uplift = (domain - surface_domain) * 100.0
        qualification_gates = {
            "domain_macro_f1": domain >= float(gates["domain_macro_f1"]),
            "register_macro_f1": register >= float(gates["register_macro_f1"]),
            "matched_style_contrast_accuracy": matched >= float(gates["matched_style_contrast_accuracy"]),
            "dev_domain_surface_uplift_points": surface_uplift >= float(gates["surface_baseline_uplift_points"]),
            "shortcut_slice_robustness": shortcut <= float(gates["maximum_shortcut_slice_drop_points"]),
            "representation_not_collapsed": not collapsed,
            "shortcut_audit": decision["shortcut_reviewed"]["status"] != "FAIL",
            "resource_audit": decision["resource_reviewed"]["status"] != "FAIL",
            "parent_continue": decision["decision"] == "CONTINUE",
        }
        qualified = all(qualification_gates.values())
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
            "authentic_owner_f1": class_f1(dev["domain"], "AUTHENTIC_OWNER", 0),
            "controlled_owner_style_variant_f1": class_f1(
                dev["domain"], "CONTROLLED_OWNER_STYLE_VARIANT", 1
            ),
            "matched_style_contrast_accuracy": matched,
            "maximum_shortcut_drop_points": shortcut,
            "same_register_nearest_neighbor_rate": float(dev["representation"]["same_register_nearest_neighbor_rate"]),
            "effective_rank": float(dev["representation"]["effective_rank"]),
            "representation_collapsed": collapsed,
            "surface_domain_macro_f1": surface_domain,
            "lexical_domain_macro_f1": lexical_domain,
            "domain_surface_uplift_points": surface_uplift,
            "metrics_audit_status": decision["metrics_reviewed"]["status"],
            "shortcut_audit_status": decision["shortcut_reviewed"]["status"],
            "resource_audit_status": decision["resource_reviewed"]["status"],
            "parent_decision": decision["decision"],
            "parent_decision_reason": decision["reason"],
            "qualification_gates": qualification_gates,
            "qualified_for_main": qualified,
            "disqualification_reasons": sorted(name for name, passed in qualification_gates.items() if not passed),
            "peak_mlx_memory_bytes": peak,
            "checkpoint_logical_path": receipt["checkpoint_logical_path"],
            "rank_tuple": list(rank),
        })
    ranked = sorted(candidates, key=lambda row: tuple(row["rank_tuple"]), reverse=True)
    qualified = [row for row in ranked if row["qualified_for_main"]]
    selected = qualified[0] if qualified else None
    if selected is None:
        shortcut_dominated = all(row["shortcut_audit_status"] == "FAIL" for row in ranked) and (
            all(not row["qualification_gates"]["dev_domain_surface_uplift_points"] for row in ranked)
            or any(not row["qualification_gates"]["shortcut_slice_robustness"] for row in ranked)
        )
        terminal_recommendation = "BLOCKED_SHORTCUT_DOMINANCE" if shortcut_dominated else "BLOCKED_PERSONAL_SIGNAL"
    else:
        terminal_recommendation = None
    report = {
        "schema_version": "r30j1a.probe-decision.v2",
        "valid": True,
        "selection_split": "dev",
        "heldout_opened": False,
        "raw_training_loss_not_primary": True,
        "candidate_count": 4,
        "qualified_candidate_count": len(qualified),
        "selected_candidate_count": int(selected is not None),
        "selection_outcome": "QUALIFIED_CANDIDATE_SELECTED" if selected else "NO_QUALIFIED_CANDIDATE",
        "selected_arm": selected["arm"] if selected else None,
        "selected_lineage": selected["lineage"] if selected else None,
        "selected_attention": selected["attention"] if selected else None,
        "selected_checkpoint_logical_path": selected["checkpoint_logical_path"] if selected else None,
        "relative_best_arm": ranked[0]["arm"],
        "relative_best_is_qualified": ranked[0]["qualified_for_main"],
        "relative_best_diagnostic_only": selected is None,
        "main_scope_planned": "last_two" if selected else None,
        "main_training_authorized": selected is not None,
        "exact_resume_required_before_main": selected is not None,
        "heldout_evaluation_authorized": selected is not None,
        "terminal_recommendation": terminal_recommendation,
        "frozen_value_gates": gates,
        "dev_baselines": {
            "surface_domain_macro_f1": surface_domain,
            "lexical_domain_macro_f1": lexical_domain,
            "probe_uplift_metric": "dev_domain_macro_f1_minus_dev_surface_domain_macro_f1_points",
        },
        "ranked": ranked,
    }
    atomic_json(args.artifact_root / "reports" / "probe_decision.json", report)
    print(json.dumps({
        "valid": True,
        "selected_candidate_count": report["selected_candidate_count"],
        "selected_arm": report["selected_arm"],
        "relative_best_arm": report["relative_best_arm"],
        "terminal_recommendation": terminal_recommendation,
        "heldout_opened": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
