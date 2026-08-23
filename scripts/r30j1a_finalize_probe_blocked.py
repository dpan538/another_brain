#!/usr/bin/env python3
"""Finalize R30J1A at the DEV probe gate without opening heldout data."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CAMPAIGN_ID = "r30j1a_personal_representation_bootstrap_v1"
LEGAL_PROBE_BLOCKERS = {"BLOCKED_SHORTCUT_DOMINANCE", "BLOCKED_PERSONAL_SIGNAL"}
ARM_SPECS = {
    "A": ("probe_arm_a_0050_cache_replay", "r28m1_q4_recovered", "causal"),
    "B": ("probe_arm_b_0050", "r28m1_q4_recovered", "bidirectional"),
    "C": ("probe_arm_c_0050", "r3_stage_a_080k", "causal"),
    "D": ("probe_arm_d_0050", "r3_stage_a_080k", "bidirectional"),
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def directory_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file()) if path.exists() else 0


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def secret_scan_passes(
    report: dict[str, Any], *, expected_head: str | None = None, expected_scope: str = "artifacts/r30j1a"
) -> bool:
    return (
        report.get("schema_version") == "r30j1a.secret-scan.v1"
        and (expected_head is None or report.get("scanned_head") == expected_head)
        and report.get("artifact_scope") == expected_scope
        and int(report.get("files_scanned", 0)) > 0
        and report.get("excluded_heldout_file_count") == 1
        and int(report.get("excluded_binary_file_count", -1)) >= 0
        and report.get("passed") is True
        and report.get("violations") == 0
        and report.get("read_errors") == 0
        and report.get("secret_exists") is True
        and report.get("secret_ignored") is True
        and report.get("secret_tracked") is False
        and report.get("secret_permission_safe") is True
        and report.get("secret_file_read") is False
        and report.get("heldout_file_read") is False
        and report.get("checkpoint_binary_read") is False
        and report.get("key_value_logged") is False
        and report.get("secret_metadata_logged") is False
        and report.get("secret_exposure") is False
    )


def class_f1(report: dict[str, Any], label: str, label_index: int) -> float:
    per_class = report["per_class"]
    row = per_class[label] if isinstance(per_class, dict) else per_class[label_index]
    return float(row["f1"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--require-pushed", action="store_true")
    args = parser.parse_args()
    artifact = args.artifact_root
    reports = artifact / "reports"

    head = git("rev-parse", "HEAD")
    origin = git("rev-parse", "origin/main")
    clean = git("status", "--porcelain") == ""
    if args.require_pushed and not (head == origin and clean):
        raise SystemExit("r30j1a_probe_blocked_finalize_requires_pushed_clean_main")

    manifest = load(artifact / "dataset" / "dataset_manifest.json")
    config = load(ROOT / "config" / "r30j1a_personal_representation_bootstrap_v1.json")
    baselines = load(reports / "shortcut_baselines.json")
    first = load(reports / "first_report_before_optimizer_step_1.json")
    validation = load(reports / "final_validation.json")
    secret = load(reports / "secret_scan.json")
    history = load(reports / "p2_historical_freeze_receipt.json")
    campaign = load(artifact / "campaign_state.json")
    probe = load(reports / "probe_decision.json")

    if probe.get("terminal_recommendation") not in LEGAL_PROBE_BLOCKERS:
        raise ValueError("probe_decision_missing_legal_blocked_terminal")
    if probe.get("selected_candidate_count") != 0 or probe.get("qualified_candidate_count") != 0:
        raise ValueError("probe_blocked_finalize_requires_zero_qualified_candidates")
    if len(probe.get("ranked", [])) != 4:
        raise ValueError("probe_blocked_finalize_requires_four_ranked_candidates")
    if (
        probe.get("selection_outcome") != "NO_QUALIFIED_CANDIDATE"
        or probe.get("selected_arm") is not None
        or probe.get("selected_lineage") is not None
        or probe.get("selected_attention") is not None
        or probe.get("selected_checkpoint_logical_path") is not None
        or probe.get("main_scope_planned") is not None
        or probe.get("main_training_authorized") is not False
        or probe.get("exact_resume_required_before_main") is not False
        or probe.get("heldout_evaluation_authorized") is not False
        or probe.get("heldout_opened") is not False
        or any(row.get("qualified_for_main") is not False for row in probe.get("ranked", []))
    ):
        raise ValueError("probe_blocked_authorization_boundary_invalid")

    historical_unchanged = history["valid"] is True and all(
        (ROOT / row["logical_path"]).is_file()
        and (ROOT / row["logical_path"]).stat().st_size == int(row["bytes"])
        and sha256(ROOT / row["logical_path"]) == row["sha256"]
        for row in history["sources"]
    )
    dataset_files_unchanged = all(
        (artifact / "dataset" / name).is_file()
        and (artifact / "dataset" / name).stat().st_size == int(receipt["bytes"])
        and sha256(artifact / "dataset" / name) == receipt["sha256"]
        for name, receipt in manifest["files"].items()
        if name != "heldout.sealed.jsonl"
    )
    heldout_receipt = manifest["files"]["heldout.sealed.jsonl"]
    heldout_path = artifact / "dataset" / "heldout.sealed.jsonl"
    heldout_file_unchanged_without_opening = (
        heldout_path.is_file()
        and heldout_path.stat().st_size == int(heldout_receipt["bytes"])
    )

    segment_roots = sorted((artifact / "training_flight_recorder" / "segments").iterdir())
    if not segment_roots:
        raise ValueError("segment_evidence_missing")
    segment_receipts = [load(path / "segment_receipt.json") for path in segment_roots]
    parent_decisions = [load(path / "parent_decision.json") for path in segment_roots]
    completed_segments = [row for row in segment_receipts if row.get("completed") is True]
    failed_segments = [row for row in segment_receipts if row.get("failed") is True and row.get("completed") is False]
    all_segments_supervised = (
        len(segment_receipts) == len(parent_decisions)
        and len(completed_segments) + len(failed_segments) == len(segment_receipts)
        and all(
            row.get("foreground_training") is True
            and row.get("background_training") is False
            and row.get("parent_decision_pending") is False
            for row in segment_receipts
        )
        and all(
            row.get("all_synchronous_auditors_returned") is True
            and row.get("training_running_during_audit") is False
            for row in parent_decisions
        )
        and all(
            decision["decision"] in {"ADJUST_ONE_VARIABLE", "HOLD", "ABORT"}
            for receipt, decision in zip(segment_receipts, parent_decisions)
            if receipt.get("failed") is True
        )
    )

    probe_segments = {row["segment"] for row in probe["ranked"]}
    expected_probe_segments = {spec[0] for spec in ARM_SPECS.values()}
    probe_roots = [artifact / "training_flight_recorder" / "segments" / name for name in sorted(probe_segments)]
    probes_complete = probe_segments == expected_probe_segments and all(
        root.is_dir()
        and load(root / "segment_receipt.json").get("completed") is True
        and load(root / "segment_receipt.json").get("checkpoint_verified") is True
        and load(root / "segment_receipt.json").get("heldout_opened") is False
        and load(root / "dev_eval.json").get("heldout_opened") is False
        for root in probe_roots
    )
    probe_resources_safe = all(
        load(root / "segment_receipt.json").get("resource_telemetry_complete") is True
        and int(load(root / "segment_receipt.json")["peak_mlx_memory_bytes"]) <= 6_500_000_000
        and int(load(root / "segment_receipt.json")["swap_delta_bytes"]) <= 1_000_000_000
        and load(root / "parent_decision.json")["resource_reviewed"]["status"] != "FAIL"
        for root in probe_roots
    )
    frozen_gates = config["value_gates"]
    surface_domain = float(baselines["surface_s1"]["domain"]["macro_f1"])
    lexical_domain = float(baselines["lexical_s2"]["domain"]["macro_f1"])
    probe_decision_matches_evidence = (
        probe.get("schema_version") == "r30j1a.probe-decision.v2"
        and probe.get("selection_split") == "dev"
        and probe.get("candidate_count") == 4
        and {row.get("arm") for row in probe["ranked"]} == set(ARM_SPECS)
        and len({row.get("segment") for row in probe["ranked"]}) == 4
        and probe.get("frozen_value_gates") == frozen_gates
        and probe.get("dev_baselines", {}).get("surface_domain_macro_f1") == surface_domain
        and probe.get("dev_baselines", {}).get("lexical_domain_macro_f1") == lexical_domain
        and probe.get("selection_outcome") == "NO_QUALIFIED_CANDIDATE"
    )
    for row in probe["ranked"]:
        expected_segment, expected_lineage, expected_attention = ARM_SPECS[row["arm"]]
        root = artifact / "training_flight_recorder" / "segments" / row["segment"]
        segment_manifest = load(root / "segment_manifest.json")
        dev = load(root / "dev_eval.json")
        receipt = load(root / "segment_receipt.json")
        parent = load(root / "parent_decision.json")
        domain = float(dev["domain"]["macro_f1"])
        register = float(dev["register"]["macro_f1"])
        mechanics = float(dev["mechanics"]["macro_f1"])
        matched = float(dev["representation"]["matched_style_contrast_accuracy"])
        shortcut = float(dev["maximum_shortcut_drop_points"])
        collapsed = bool(dev["representation"]["collapsed"])
        surface_uplift = (domain - surface_domain) * 100.0
        expected_qualification = {
            "domain_macro_f1": domain >= float(frozen_gates["domain_macro_f1"]),
            "register_macro_f1": register >= float(frozen_gates["register_macro_f1"]),
            "matched_style_contrast_accuracy": matched >= float(frozen_gates["matched_style_contrast_accuracy"]),
            "dev_domain_surface_uplift_points": surface_uplift >= float(frozen_gates["surface_baseline_uplift_points"]),
            "shortcut_slice_robustness": shortcut <= float(frozen_gates["maximum_shortcut_slice_drop_points"]),
            "representation_not_collapsed": not collapsed,
            "shortcut_audit": parent["shortcut_reviewed"]["status"] != "FAIL",
            "resource_audit": parent["resource_reviewed"]["status"] != "FAIL",
            "parent_continue": parent["decision"] == "CONTINUE",
        }
        expected_rank = [
            int(not collapsed), matched, domain, register, mechanics, -shortcut,
            -int(receipt["peak_mlx_memory_bytes"]),
        ]
        probe_decision_matches_evidence = probe_decision_matches_evidence and (
            row["segment"] == expected_segment
            and row["lineage"] == expected_lineage
            and row["attention"] == expected_attention
            and segment_manifest.get("phase") == "PROBE"
            and segment_manifest.get("planned_steps") == 50
            and segment_manifest.get("architecture", {}).get("lineage_label") == expected_lineage
            and segment_manifest.get("architecture", {}).get("attention_mode") == expected_attention
            and segment_manifest.get("architecture", {}).get("trainable_scope") == "probe"
            and row["domain_macro_f1"] == domain
            and row["register_macro_f1"] == register
            and row["mechanics_macro_f1"] == mechanics
            and row["authentic_owner_f1"] == class_f1(dev["domain"], "AUTHENTIC_OWNER", 0)
            and row["controlled_owner_style_variant_f1"]
            == class_f1(dev["domain"], "CONTROLLED_OWNER_STYLE_VARIANT", 1)
            and row["matched_style_contrast_accuracy"] == matched
            and row["maximum_shortcut_drop_points"] == shortcut
            and row["domain_surface_uplift_points"] == surface_uplift
            and row["same_register_nearest_neighbor_rate"]
            == float(dev["representation"]["same_register_nearest_neighbor_rate"])
            and row["effective_rank"] == float(dev["representation"]["effective_rank"])
            and row["representation_collapsed"] is collapsed
            and row["surface_domain_macro_f1"] == surface_domain
            and row["lexical_domain_macro_f1"] == lexical_domain
            and row["metrics_audit_status"] == parent["metrics_reviewed"]["status"]
            and row["shortcut_audit_status"] == parent["shortcut_reviewed"]["status"]
            and row["resource_audit_status"] == parent["resource_reviewed"]["status"]
            and row["parent_decision"] == parent["decision"]
            and row["parent_decision_reason"] == parent["reason"]
            and row["peak_mlx_memory_bytes"] == int(receipt["peak_mlx_memory_bytes"])
            and row["checkpoint_logical_path"] == receipt["checkpoint_logical_path"]
            and row["qualification_gates"] == expected_qualification
            and row["qualified_for_main"] is all(expected_qualification.values())
            and row["disqualification_reasons"]
            == sorted(name for name, passed in expected_qualification.items() if not passed)
            and row["rank_tuple"] == expected_rank
        )
    probe_decision_matches_evidence = probe_decision_matches_evidence and all(
        tuple(left["rank_tuple"]) >= tuple(right["rank_tuple"])
        for left, right in zip(probe["ranked"], probe["ranked"][1:])
    )
    expected_shortcut_dominated = all(row["shortcut_audit_status"] == "FAIL" for row in probe["ranked"]) and (
        all(not row["qualification_gates"]["dev_domain_surface_uplift_points"] for row in probe["ranked"])
        or any(not row["qualification_gates"]["shortcut_slice_robustness"] for row in probe["ranked"])
    )
    expected_terminal = "BLOCKED_SHORTCUT_DOMINANCE" if expected_shortcut_dominated else "BLOCKED_PERSONAL_SIGNAL"
    probe_decision_matches_evidence = probe_decision_matches_evidence and (
        probe["qualified_candidate_count"] == sum(row["qualified_for_main"] for row in probe["ranked"])
        and probe["selected_candidate_count"] == 0
        and probe["relative_best_arm"] == probe["ranked"][0]["arm"]
        and probe["relative_best_is_qualified"] is probe["ranked"][0]["qualified_for_main"]
        and probe["relative_best_diagnostic_only"] is True
        and probe["terminal_recommendation"] == expected_terminal
    )

    heldout_sealed = (
        manifest["permanent_heldout_opened"] is False
        and manifest["heldout_used_for_architecture_selection"] is False
        and manifest["heldout_used_for_early_stopping"] is False
        and campaign.get("heldout_opened") is False
        and all(row.get("heldout_opened") is False for row in segment_receipts)
        and not (reports / "heldout_open_receipt.json").exists()
        and not (reports / "heldout_final_evaluation.json").exists()
    )
    no_main_or_resume = (
        all(row.get("phase") in {"RESOURCE_REHEARSAL", "PROBE"} for row in completed_segments)
        and not (artifact / "resume_proof" / "exact_resume_report.json").exists()
        and probe["exact_resume_required_before_main"] is False
    )
    correction_pack_created = (artifact / "owner_correction_pack").exists()
    secret_ok = secret_scan_passes(secret, expected_head=head)
    dataset_boundary_ok = (
        manifest["example_count"] >= 2500
        and manifest["authentic_owner_examples"] > 0
        and manifest["source_leakage"] == 0
        and manifest["semantic_family_leakage"] == 0
        and manifest["mutation_family_leakage"] == 0
        and manifest["lm_generation_targets"] == 0
        and manifest["normative_persona_labels"] == 0
        and manifest["personal_fit_labels"] == 0
        and manifest["persona_mode_labels"] == 0
        and manifest["p2_elicitation_examples"] == 0
        and manifest["future_owner_correction_examples"] == 0
    )
    integrity_gates = {
        "probe_comparison_complete": probes_complete,
        "probe_decision_matches_frozen_dev_evidence": probe_decision_matches_evidence,
        "zero_qualified_candidates": probe["qualified_candidate_count"] == 0,
        "main_training_not_authorized": probe["main_training_authorized"] is False,
        "heldout_remains_sealed": heldout_sealed,
        "sealed_heldout_receipt_and_size_present_without_content_read": heldout_file_unchanged_without_opening,
        "exact_resume_not_applicable_without_candidate": no_main_or_resume,
        "owner_correction_pack_not_created": not correction_pack_created,
        "all_segments_supervised": all_segments_supervised,
        "probe_resources_safe_after_approved_repair": probe_resources_safe,
        "train_dev_and_metadata_integrity": dataset_files_unchanged,
        "dataset_and_training_boundary": dataset_boundary_ok,
        "historical_states_unchanged": historical_unchanged,
        "repository_validation": validation["passed"] is True,
        "secret": secret_ok,
        "git_pushed_and_clean": head == origin and clean,
        "no_product_or_deployment": True,
        "no_q4_export": True,
    }
    failed_integrity = sorted(name for name, passed in integrity_gates.items() if not passed)
    if failed_integrity:
        raise SystemExit("r30j1a_probe_blocked_finalize_invariant_failed:" + ",".join(failed_integrity))

    measured_swap = [int(row["swap_delta_bytes"]) for row in segment_receipts if row.get("swap_delta_bytes") is not None]
    completed_swap = [int(row["swap_delta_bytes"]) for row in completed_segments if row.get("swap_delta_bytes") is not None]
    probe_receipts = [load(root / "segment_receipt.json") for root in probe_roots]
    completed_optimizer_tokens = sum(int(row["training_state"]["optimizer_tokens"]) for row in completed_segments)
    failed_attempted_optimizer_tokens = sum(
        int(row.get("attempted_training_state", {}).get("optimizer_tokens", 0)) for row in failed_segments
    )
    completed_assistant_tokens = sum(int(row["training_state"]["assistant_target_tokens"]) for row in completed_segments)
    failed_assistant_tokens = sum(
        int(row.get("attempted_training_state", {}).get("assistant_target_tokens", 0)) for row in failed_segments
    )
    checkpoint_bytes = sum(int(row["checkpoint"]["checkpoint_bytes"]) for row in probe_receipts)
    optimizer_bytes = sum(int(row["checkpoint"]["optimizer_bytes"]) for row in probe_receipts)
    terminal = probe["terminal_recommendation"]
    if campaign.get("terminal_state") not in {None, terminal}:
        raise ValueError("existing_campaign_terminal_conflicts_with_probe_evidence")
    primary_failure_family = (
        "shortcut_dominance_and_source_family_generalization_failure"
        if terminal == "BLOCKED_SHORTCUT_DOMINANCE"
        else "insufficient_reliable_personal_signal"
    )
    timestamp = utc_now()
    resource_report = {
        "machine_ram_bytes": first["measured_pretraining_ram"]["total_bytes"],
        "free_ram_before_bytes": first["measured_pretraining_ram"]["available_bytes"],
        "swap_before": first["swap"],
        "swap_after_last_probe": probe_receipts[-1]["resource_after"]["swap"],
        "maximum_observed_segment_swap_growth_bytes": max(measured_swap),
        "maximum_completed_segment_swap_growth_bytes": max(completed_swap),
        "maximum_accepted_probe_swap_growth_bytes": max(int(row["swap_delta_bytes"]) for row in probe_receipts),
        "historical_resource_stop_count": sum(
            str(row.get("failure_code", "")).endswith(("swap_growth_stop", "memory_pressure_not_normal", "mlx_hard_stop_exceeded"))
            for row in failed_segments
        ),
        "peak_probe_mlx_memory_bytes": max(int(row["peak_mlx_memory_bytes"]) for row in probe_receipts),
        "peak_probe_process_rss_bytes": max(int(row["peak_process_rss_bytes"]) for row in probe_receipts),
        "four_probe_checkpoint_bytes": checkpoint_bytes,
        "four_probe_optimizer_bytes": optimizer_bytes,
        "dataset_bytes_from_frozen_manifest_without_heldout_content_read": sum(
            int(row["bytes"]) for row in manifest["files"].values()
        ),
        "artifact_bytes_before_terminal_reports": directory_bytes(artifact),
        "campaign_storage_peak_bytes": max(int(row["checkpoint"]["campaign_storage_bytes_after"]) for row in completed_segments),
        "free_disk_before_bytes": first["free_disk_bytes"],
        "free_disk_after_bytes": shutil.disk_usage(artifact).free,
        "campaign_storage_allowance_bytes": 20_000_000_000,
        "campaign_storage_preferred_bytes": 14_000_000_000,
        "campaign_storage_hard_bytes": 16_000_000_000,
    }
    report = {
        "schema_version": "r30j1a.probe-blocked-final-report.v1",
        "campaign_id": CAMPAIGN_ID,
        "terminal_state": terminal,
        "terminal_reason": probe["ranked"][0]["parent_decision_reason"],
        "next_state": None,
        "created_at": timestamp,
        "evidence_split": "dev",
        "heldout_source_generalization_claim": False,
        "heldout_status": "SEALED_NOT_OPENED",
        "probe_selection": probe,
        "representation_bootstrap_pass": False,
        "owner_preference_learned_claim": False,
        "selected_checkpoint": None,
        "main_adaptation_started": False,
        "exact_resume_status": "NOT_RUN_NOT_APPLICABLE_WITHOUT_QUALIFIED_CANDIDATE",
        "owner_correction_authorized": False,
        "r30j1b_authorized": False,
        "historical_states_preserved": history["required_historical_states"],
        "integrity_gates": integrity_gates,
        "representation_value_gates_pass": False,
        "optimizer_accounting": {
            "independent_completed_segment_optimizer_tokens_sum": completed_optimizer_tokens,
            "failed_segment_attempted_optimizer_tokens_sum": failed_attempted_optimizer_tokens,
            "total_optimizer_tokens_processed_across_independent_attempts": completed_optimizer_tokens + failed_attempted_optimizer_tokens,
            "selected_candidate_optimizer_tokens": 0,
            "last_probe_optimizer_tokens": campaign["optimizer_tokens"],
            "per_probe_optimizer_tokens": {row["segment_id"]: row["training_state"]["optimizer_tokens"] for row in probe_receipts},
            "assistant_target_tokens": completed_assistant_tokens + failed_assistant_tokens,
            "discarded_uncheckpointed_optimizer_updates": sum(
                int(row.get("discarded_uncheckpointed_optimizer_updates", 0)) for row in failed_segments
            ),
        },
        "resource_report": resource_report,
        "supervision_history": {
            "segment_count": len(segment_receipts),
            "completed_segment_count": len(completed_segments),
            "failed_segment_count": len(failed_segments),
            "parent_decision_count": len(parent_decisions),
            "last_parent_decision": campaign["last_parent_decision"],
            "training_running": False,
        },
        "automation_contract": {
            "training_backgrounded": False,
            "automation_used": False,
            "detached_process_used": False,
            "tmux_used": False,
            "nohup_used": False,
            "cron_used": False,
            "subagents_synchronous_only": True,
            "parent_supervised_every_segment": True,
        },
        "dataset": {
            "examples": manifest["example_count"],
            "authentic_owner_examples": manifest["authentic_owner_examples"],
            "controlled_variants": manifest["controlled_owner_variants"],
            "generic_examples": manifest["generic_examples"],
            "source_leakage": manifest["source_leakage"],
            "semantic_family_leakage": manifest["semantic_family_leakage"],
            "mutation_family_leakage": manifest["mutation_family_leakage"],
            "heldout_examples": manifest["split_example_counts"]["heldout"],
            "heldout_opened": False,
        },
        "correction_pack": {
            "created": False,
            "owner_review_completed": False,
            "allowed_for_training": False,
            "r30j1b_authorized": False,
        },
        "checkpoint_retention": {
            "selected_checkpoint": None,
            "relative_best_probe_checkpoint": probe["ranked"][0]["checkpoint_logical_path"],
            "continuation_checkpoint_authorized": False,
            "retired_resource_rehearsal_checkpoint": "artifacts/r30j1a/retired_checkpoints/resource_rehearsal_0002",
            "retirement_recoverable": True,
            "permanent_checkpoint_deletion_performed": False,
        },
        "product_admission": False,
        "browser_admission": False,
        "q4_replacement": False,
        "network_api_requests": 0,
        "deepseek_requests": 0,
        "secret_exposure": False,
        "weights_committed": False,
        "corpus_committed": False,
        "git": {
            "head": head,
            "origin_main": origin,
            "head_equals_origin_main": head == origin,
            "worktree_clean": clean,
        },
    }
    terminal_report = {
        "schema_version": "r30j1a.probe-blocked-final-terminal.v1",
        "campaign_id": CAMPAIGN_ID,
        "terminal_state": terminal,
        "primary_failure_family": primary_failure_family,
        "next_state": None,
        "required_integrity_gates_pass": all(integrity_gates.values()),
        "representation_value_gates_pass": False,
        "selected_candidate_count": 0,
        "main_adaptation_started": False,
        "heldout_opened": False,
        "tuning_after_heldout": None,
        "owner_correction_authorized": False,
        "normative_persona_training_authorized": False,
        "final_persona_training_authorized": False,
        "r30j1b_authorized": False,
    }
    receipt = {
        "schema_version": "r30j1a.probe-blocked-receipt.v1",
        "campaign_id": CAMPAIGN_ID,
        "terminal_state": terminal,
        "created_at": timestamp,
        "probe_decision_sha256": sha256(reports / "probe_decision.json"),
        "dataset_manifest_sha256": sha256(artifact / "dataset" / "dataset_manifest.json"),
        "heldout_content_read_by_finalizer": False,
        "heldout_opened": False,
        "selected_candidate_count": 0,
        "main_training_started": False,
        "exact_resume_run": False,
        "owner_correction_pack_created": False,
    }

    atomic_json(reports / "resource_report.json", resource_report)
    atomic_json(reports / "final_report.json", report)
    atomic_json(reports / "final_terminal.json", terminal_report)
    atomic_json(reports / "probe_blocked_receipt.json", receipt)
    previous_checkpoint = campaign.get("active_checkpoint") or campaign.get("last_probe_checkpoint")
    campaign.update({
        "state": terminal,
        "terminal_state": terminal,
        "next_state": None,
        "current_process": None,
        "active_checkpoint": None,
        "last_probe_checkpoint": previous_checkpoint,
        "selected_candidate_count": 0,
        "main_adaptation_started": False,
        "exact_resume_run": False,
        "heldout_opened": False,
        "owner_correction_authorized": False,
        "r30j1b_authorized": False,
        "updated_at": timestamp,
    })
    atomic_json(artifact / "campaign_state.json", campaign)
    atomic_json(artifact / "heartbeat_latest.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": terminal,
        "terminal_state": terminal,
        "current_process": None,
        "process_running": False,
        "training_running": False,
        "parent_decision_pending": False,
        "last_parent_decision": "HOLD",
        "heldout_opened": False,
        "updated_at": timestamp,
    })
    print(json.dumps({
        "terminal_state": terminal,
        "selected_candidate_count": 0,
        "heldout_opened": False,
        "main_adaptation_started": False,
        "integrity_gates_pass": all(integrity_gates.values()),
        "require_pushed": args.require_pushed,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
