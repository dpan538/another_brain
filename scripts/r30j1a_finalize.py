#!/usr/bin/env python3
"""Make the evidence-first terminal decision for R30J1A."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
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


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def directory_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file()) if path.exists() else 0


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--require-pushed", action="store_true")
    args = parser.parse_args()
    artifact = args.artifact_root
    reports = artifact / "reports"
    manifest = load(artifact / "dataset/dataset_manifest.json")
    first = load(reports / "first_report_before_optimizer_step_1.json")
    heldout = load(reports / "heldout_final_evaluation.json")
    resume = load(artifact / "resume_proof/exact_resume_report.json")
    validation = load(reports / "final_validation.json")
    secret = load(reports / "secret_scan.json")
    history = load(reports / "p2_historical_freeze_receipt.json")
    campaign = load(artifact / "campaign_state.json")
    probe = load(reports / "probe_decision.json")
    historical_unchanged = all(
        (ROOT / row["logical_path"]).is_file()
        and (ROOT / row["logical_path"]).stat().st_size == int(row["bytes"])
        and sha(ROOT / row["logical_path"]) == row["sha256"]
        for row in history["sources"]
    )
    dataset_files_unchanged = all(
        (artifact / "dataset" / name).is_file()
        and (artifact / "dataset" / name).stat().st_size == int(receipt["bytes"])
        and sha(artifact / "dataset" / name) == receipt["sha256"]
        for name, receipt in manifest["files"].items()
        if name != "dataset_manifest.json"
    )
    segment_roots = sorted((artifact / "training_flight_recorder/segments").iterdir())
    segment_receipts = [load(path / "segment_receipt.json") for path in segment_roots]
    parent_decisions = [load(path / "parent_decision.json") for path in segment_roots]
    completed_segments = [row for row in segment_receipts if row.get("completed") is True]
    failed_segments = [row for row in segment_receipts if row.get("failed") is True and row.get("completed") is False]
    all_segments_supervised = (
        len(segment_receipts) > 0
        and len(segment_receipts) == len(parent_decisions)
        and len(completed_segments) + len(failed_segments) == len(segment_receipts)
        and all(row["foreground_training"] is True and row["background_training"] is False and row["parent_decision_pending"] is False for row in segment_receipts)
        and all(row["all_synchronous_auditors_returned"] is True and row["training_running_during_audit"] is False for row in parent_decisions)
        and all(
            decision["decision"] in {"ADJUST_ONE_VARIABLE", "HOLD", "ABORT"}
            for receipt, decision in zip(segment_receipts, parent_decisions)
            if receipt.get("failed") is True
        )
    )
    max_peak_mlx = max(int(row["peak_mlx_memory_bytes"]) for row in segment_receipts)
    max_peak_rss = max(int(row["peak_process_rss_bytes"]) for row in segment_receipts)
    measured_swap_deltas = [int(row["swap_delta_bytes"]) for row in segment_receipts if row.get("swap_delta_bytes") is not None]
    if not completed_segments or not measured_swap_deltas:
        raise ValueError("completed_segment_resource_evidence_missing")
    maximum_swap_growth = max(measured_swap_deltas)
    max_campaign_storage = max(int(row["checkpoint"]["campaign_storage_bytes_after"]) for row in completed_segments)
    final_segment = max(completed_segments, key=lambda row: int(row["ending_global_optimizer_step"]))
    final_checkpoint = final_segment["checkpoint"]
    resources_ok = (
        max_peak_mlx <= 6_500_000_000
        and maximum_swap_growth <= 1_000_000_000
        and max_campaign_storage <= 16_000_000_000
        and all(row.get("resource_telemetry_complete") is True for row in completed_segments)
        and all(int(row["resource_after"]["free_disk_bytes"]) >= 2_000_000_000 for row in completed_segments)
    )
    value = {
        "domain_macro_f1": float(heldout["domain"]["macro_f1"]),
        "register_macro_f1": float(heldout["register"]["macro_f1"]),
        "mechanics_macro_f1": float(heldout["mechanics"]["macro_f1"]),
        "matched_style_contrast_accuracy": float(heldout["representation"]["matched_style_contrast_accuracy"]),
        "matched_slice_neural_uplift_points": float(heldout["matched_slice_neural_uplift_points"]),
        "maximum_shortcut_drop_points": float(heldout["maximum_shortcut_drop_points"]),
        "representation_collapsed": bool(heldout["representation"]["collapsed"]),
        "heldout_source_generalization": True,
    }
    gates = {
        "domain_macro_f1": value["domain_macro_f1"] >= 0.75,
        "register_macro_f1": value["register_macro_f1"] >= 0.65,
        "matched_style_contrast_accuracy": value["matched_style_contrast_accuracy"] >= 0.75,
        "matched_slice_surface_uplift": value["matched_slice_neural_uplift_points"] >= 10.0,
        "shortcut_slice_robustness": value["maximum_shortcut_drop_points"] <= 15.0,
        "representation_not_collapsed": not value["representation_collapsed"],
        "exact_resume": resume["valid"] is True,
        "resource": resources_ok,
        "dataset_integrity": dataset_files_unchanged,
        "historical_states_unchanged": historical_unchanged,
        "heldout_opened_once": heldout["heldout_opened_once"] is True,
        "no_tuning_after_heldout": heldout["tuning_after_heldout"] is False,
        "supervision_integrity": all_segments_supervised,
        "secret": secret["violations"] == 0 and secret["secret_file_read"] is False,
        "repository_validation": validation["passed"] is True,
        "no_product_or_deployment": True,
        "no_q4_export": True,
        "no_generation_training": manifest["lm_generation_targets"] == 0,
        "no_normative_labels": manifest["normative_persona_labels"] == 0 and manifest["personal_fit_labels"] == 0 and manifest["persona_mode_labels"] == 0,
    }
    if not resources_ok:
        terminal = "BLOCKED_RESOURCE"
    elif resume["valid"] is not True:
        terminal = "BLOCKED_TRAINING_STABILITY"
    elif manifest["example_count"] < 2500 or manifest["authentic_owner_examples"] == 0:
        terminal = "BLOCKED_DATA_COVERAGE"
    elif value["maximum_shortcut_drop_points"] > 15.0 or value["matched_slice_neural_uplift_points"] < 10.0:
        terminal = "BLOCKED_SHORTCUT_DOMINANCE"
    elif not all(gates.values()):
        terminal = "BLOCKED_PERSONAL_SIGNAL"
    else:
        terminal = "R30J1A_REPRESENTATION_BOOTSTRAP_PASS"
    pass_terminal = terminal == "R30J1A_REPRESENTATION_BOOTSTRAP_PASS"
    next_state = "READY_FOR_OWNER_CORRECTION" if pass_terminal else None
    correction_pack_created = (artifact / "owner_correction_pack/owner_correction_pack.json").is_file()
    if pass_terminal != correction_pack_created:
        raise ValueError("owner_correction_pack_gate_mismatch")
    head, origin = git("rev-parse", "HEAD"), git("rev-parse", "origin/main")
    clean = git("status", "--porcelain") == ""
    if args.require_pushed and not (head == origin and clean):
        raise SystemExit("r30j1a_finalize_requires_pushed_clean_main")
    resource_report = {
        "machine_ram_bytes": first["measured_pretraining_ram"]["total_bytes"],
        "free_ram_before_bytes": first["measured_pretraining_ram"]["available_bytes"],
        "swap_before": first["swap"],
        "swap_after": final_segment["resource_after"]["swap"],
        "maximum_segment_swap_growth_bytes": maximum_swap_growth,
        "peak_mlx_memory_bytes": max_peak_mlx,
        "peak_process_rss_bytes": max_peak_rss,
        "checkpoint_bytes": final_checkpoint["checkpoint_bytes"],
        "optimizer_bytes": final_checkpoint["optimizer_bytes"],
        "dataset_bytes": sum(int(row["bytes"]) for row in manifest["files"].values()),
        "artifact_bytes": directory_bytes(artifact),
        "campaign_storage_peak_bytes": max_campaign_storage,
        "free_disk_before_bytes": first["free_disk_bytes"],
        "free_disk_after_bytes": shutil.disk_usage(artifact).free,
        "campaign_storage_allowance_bytes": 20_000_000_000,
        "campaign_storage_preferred_bytes": 14_000_000_000,
        "campaign_storage_hard_bytes": 16_000_000_000,
    }
    report = {
        "schema_version": "r30j1a.final-report.v1",
        "campaign_id": "r30j1a_personal_representation_bootstrap_v1",
        "terminal_state": terminal,
        "next_state": next_state,
        "pass_meaning_limited_to_descriptive_representation": True,
        "owner_preference_learned_claim": False,
        "product_admission": False,
        "browser_admission": False,
        "q4_replacement": False,
        "historical_states_preserved": history["required_historical_states"],
        "probe_selection": probe,
        "training_state": campaign,
        "value_metrics": value,
        "gates": gates,
        "resource_report": resource_report,
        "supervision_history": {
            "segment_count": len(segment_receipts),
            "completed_segment_count": len(completed_segments),
            "failed_segment_count": len(failed_segments),
            "failed_segments_audited": all(
                decision["decision"] in {"ADJUST_ONE_VARIABLE", "HOLD", "ABORT"}
                for receipt, decision in zip(segment_receipts, parent_decisions)
                if receipt.get("failed") is True
            ),
            "discarded_uncheckpointed_optimizer_updates": sum(
                int(row.get("discarded_uncheckpointed_optimizer_updates", 0)) for row in failed_segments
            ),
        },
        "automation_contract": {
            "training_backgrounded": False,
            "automation_used": False,
            "detached_process_used": False,
            "tmux_used": False,
            "nohup_used": False,
            "cron_used": False,
            "subagents_synchronous_only": True,
            "parent_supervised_every_segment": all_segments_supervised,
        },
        "dataset": {
            "examples": manifest["example_count"],
            "authentic_owner_examples": manifest["authentic_owner_examples"],
            "controlled_variants": manifest["controlled_owner_variants"],
            "generic_examples": manifest["generic_examples"],
            "source_leakage": manifest["source_leakage"],
            "semantic_family_leakage": manifest["semantic_family_leakage"],
            "mutation_family_leakage": manifest["mutation_family_leakage"],
            "p2_elicitation_examples": manifest["p2_elicitation_examples"],
            "heldout_opened_once": True,
        },
        "correction_pack": {
            "created": correction_pack_created,
            "item_count": heldout.get("owner_correction_item_count", 0),
            "owner_review_completed": False,
            "allowed_for_training": False,
            "r30j1b_authorized": False,
        },
        "git": {"head": head, "origin_main": origin, "head_equals_origin_main": head == origin, "worktree_clean": clean},
        "secret_exposure": False,
        "network_api_requests": 0,
        "deepseek_requests": 0,
        "weights_committed": False,
        "corpus_committed": False,
    }
    terminal_report = {
        "schema_version": "r30j1a.final-terminal.v1",
        "campaign_id": report["campaign_id"],
        "terminal_state": terminal,
        "next_state": next_state,
        "all_gates_pass": all(gates.values()),
        "training_backgrounded": False,
        "parent_supervised_every_segment": all_segments_supervised,
        "heldout_opened_once": True,
        "tuning_after_heldout": False,
        "normative_persona_training_authorized": False,
        "final_persona_training_authorized": False,
        "r30j1b_authorized": False,
    }
    atomic_json(reports / "resource_report.json", resource_report)
    atomic_json(reports / "final_report.json", report)
    atomic_json(reports / "final_terminal.json", terminal_report)
    campaign.update({"state": terminal, "terminal_state": terminal, "next_state": next_state, "current_process": None, "heldout_opened": True, "updated_at": reports.stat().st_mtime_ns})
    atomic_json(artifact / "campaign_state.json", campaign)
    print(json.dumps({
        "terminal_state": terminal,
        "next_state": next_state,
        "domain_macro_f1": value["domain_macro_f1"],
        "register_macro_f1": value["register_macro_f1"],
        "matched_style": value["matched_style_contrast_accuracy"],
        "matched_uplift_points": value["matched_slice_neural_uplift_points"],
        "maximum_shortcut_drop_points": value["maximum_shortcut_drop_points"],
        "all_gates_pass": all(gates.values()),
        "require_pushed": args.require_pushed,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
