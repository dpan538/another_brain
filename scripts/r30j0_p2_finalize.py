#!/usr/bin/env python3
"""Finalize the ignored R30J0-P2 aggregate receipt.

This finalizer never reads raw owner text and never rewrites the R30J0/P1
terminal files.  It consumes only aggregate P2 evidence, verifies the frozen
P1 input hashes, and records the expected handoff to human persona elicitation.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
P2_ROOT = ROOT / "artifacts" / "r30j0" / "persona_excavation"
REPORT_ROOT = P2_ROOT / "reports"
SUMMARY_PATH = REPORT_ROOT / "persona_excavation_summary.json"
REVIEW_MANIFEST_PATH = P2_ROOT / "owner_review_v2" / "manifest.json"
UI_VALIDATION_RECEIPT_PATH = P2_ROOT / "owner_review_v2" / "validation_receipt.json"
BROWSER_VALIDATION_PATH = REPORT_ROOT / "browser_validation.json"
PACK_PATH = P2_ROOT / "elicitation_pack_v2.json"
LINKAGE_PATH = P2_ROOT / "persona_elicitation_linkage.json"
INPUT_SNAPSHOT_PATH = P2_ROOT / "source_reanalysis" / "p1_input_hash_snapshot.json"

PHASE_TERMINAL = "R30J0_P2_PERSONA_EXCAVATION_READY"
NEXT_STATE = "HUMAN_PERSONA_ELICITATION_REQUIRED"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tests-pass", action="store_true")
    parser.add_argument("--gates-pass", action="store_true")
    parser.add_argument("--browser-verified", action="store_true")
    parser.add_argument("--require-pushed", action="store_true")
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected_json_object:{path.name}")
    return value


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True, indent=2)
            handle.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def git_value(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True, check=True,
    ).stdout.strip()


def run_json(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=True)
    value = json.loads(result.stdout)
    if not isinstance(value, dict):
        raise ValueError("command_did_not_return_json_object")
    return value


def verify_frozen_p1_inputs(snapshot: dict[str, Any]) -> dict[str, Any]:
    records = snapshot.get("files")
    if not isinstance(records, list) or len(records) < 7:
        raise ValueError("p1_input_snapshot_incomplete")
    mismatches: list[str] = []
    for record in records:
        logical_path = record.get("logical_path")
        expected = record.get("sha256")
        if not isinstance(logical_path, str) or not isinstance(expected, str):
            raise ValueError("p1_input_snapshot_record_invalid")
        path = ROOT / logical_path
        if not path.is_file() or sha256_file(path) != expected:
            mismatches.append(logical_path)
    return {
        "snapshot_file_count": len(records),
        "hash_mismatch_count": len(mismatches),
        "old_r30j0_evidence_unchanged": not mismatches,
        "mismatched_logical_paths": mismatches,
    }


def require_summary_contract(summary: dict[str, Any]) -> None:
    required_metrics = {
        "historical_sources_reexamined",
        "normative_personal_evidence_count",
        "microtrait_hypothesis_count",
        "persona_mode_hypothesis_count",
        "register_count",
        "antipattern_count",
        "contradiction_count",
        "unresolved_question_count",
        "elicitation_item_count",
        "crocodile_mode_seed_present",
        "crocodile_mode_boundary_known",
        "deprecated_wired_label_removed",
        "owner_review_v2_ready",
        "retained_microtrait_count",
        "review_linked_microtrait_count",
        "review_linked_mode_count",
        "review_linked_antipattern_count",
        "review_linked_contradiction_count",
        "unresolved_review_target_ref_count",
        "microtrait_positive_trigger_unique_count",
        "microtrait_negative_trigger_unique_count",
        "antipattern_trigger_context_unique_count",
    }
    missing = required_metrics - set(summary)
    if missing:
        raise ValueError("p2_summary_missing:" + ",".join(sorted(missing)))
    if summary["historical_sources_reexamined"] < 1_152:
        raise ValueError("historical_source_reanalysis_incomplete")
    if summary["microtrait_hypothesis_count"] < 40:
        raise ValueError("microtrait_hypothesis_floor_not_met")
    if summary["persona_mode_hypothesis_count"] < 1:
        raise ValueError("persona_mode_hypotheses_missing")
    if summary["register_count"] < 15:
        raise ValueError("register_coverage_incomplete")
    if summary["antipattern_count"] < 1 or summary["contradiction_count"] < 1:
        raise ValueError("negative_or_contradiction_evidence_missing")
    if summary["unresolved_question_count"] < 1:
        raise ValueError("uncertainty_report_missing")
    if summary["elicitation_item_count"] != 190:
        raise ValueError("elicitation_decision_count_must_equal_190")
    if summary["crocodile_mode_seed_present"] is not True:
        raise ValueError("owner_asserted_crocodile_seed_missing")
    if not isinstance(summary["crocodile_mode_boundary_known"], bool):
        raise ValueError("crocodile_boundary_status_must_be_boolean")
    if summary["deprecated_wired_label_removed"] is not True:
        raise ValueError("deprecated_wired_label_not_removed")
    if summary["owner_review_v2_ready"] is not True:
        raise ValueError("owner_review_v2_not_ready")
    if summary["retained_microtrait_count"] != 0:
        raise ValueError("unreviewed_microtrait_was_retained")
    if summary["review_linked_microtrait_count"] != summary["microtrait_hypothesis_count"]:
        raise ValueError("microtrait_review_linkage_incomplete")
    if summary["review_linked_mode_count"] != summary["persona_mode_hypothesis_count"]:
        raise ValueError("mode_review_linkage_incomplete")
    if summary["review_linked_antipattern_count"] != summary["antipattern_count"]:
        raise ValueError("antipattern_review_linkage_incomplete")
    if summary["review_linked_contradiction_count"] != summary["contradiction_count"]:
        raise ValueError("contradiction_review_linkage_incomplete")
    if summary["unresolved_review_target_ref_count"] != 0:
        raise ValueError("review_target_ref_unresolved")
    if summary["microtrait_positive_trigger_unique_count"] != summary["microtrait_hypothesis_count"]:
        raise ValueError("microtrait_positive_triggers_are_template_placeholders")
    if summary["microtrait_negative_trigger_unique_count"] != summary["microtrait_hypothesis_count"]:
        raise ValueError("microtrait_negative_triggers_are_template_placeholders")
    if summary["antipattern_trigger_context_unique_count"] != summary["antipattern_count"]:
        raise ValueError("antipattern_triggers_are_template_placeholders")


def main() -> int:
    args = parse_args()
    timestamp = datetime.now(timezone.utc).isoformat()
    summary = load_json(SUMMARY_PATH)
    require_summary_contract(summary)
    review = load_json(REVIEW_MANIFEST_PATH)
    ui_validation = load_json(UI_VALIDATION_RECEIPT_PATH)
    browser_validation = load_json(BROWSER_VALIDATION_PATH)
    pack = load_json(PACK_PATH)
    linkage = load_json(LINKAGE_PATH)
    pack_sha256 = sha256_file(PACK_PATH)
    frozen = verify_frozen_p1_inputs(load_json(INPUT_SNAPSHOT_PATH))
    production_gate = run_json(["node", "scripts/r30j0_no_production_change_gate.mjs"])
    secret_scan = run_json(
        [
            "python3",
            "scripts/r30j0_secret_scan.py",
            "--artifact-root",
            "artifacts/r30j0/persona_excavation",
            "--output",
            "artifacts/r30j0/persona_excavation/reports/secret_scan.json",
        ]
    )

    branch = git_value("branch", "--show-current")
    head = git_value("rev-parse", "HEAD")
    origin_main = git_value("rev-parse", "origin/main")
    worktree_clean = git_value("status", "--porcelain") == ""
    pushed = head == origin_main

    safety_expectations = {
        "training_started": False,
        "classification_updates": 0,
        "optimizer_tokens": 0,
        "checkpoint": None,
        "candidate": None,
        "r30j1_authorized": False,
        "owner_review_completed": False,
        "profile_frozen": False,
        "api_requests": 0,
        "deployment_performed": False,
        "production_modified": False,
    }
    summary_safety = {
        key: summary.get(key) == expected for key, expected in safety_expectations.items()
    }
    invariants = {
        "branch_main": branch == "main",
        "old_r30j0_and_p1_evidence_unchanged": frozen["old_r30j0_evidence_unchanged"],
        "historical_sources_reexamined": summary["historical_sources_reexamined"] >= 1_152,
        "microtrait_floor_met": summary["microtrait_hypothesis_count"] >= 40,
        "register_coverage_met": summary["register_count"] >= 15,
        "owner_asserted_seed_admitted": summary["crocodile_mode_seed_present"] is True,
        "deprecated_wired_label_removed": summary["deprecated_wired_label_removed"] is True,
        "owner_review_v2_ready": summary["owner_review_v2_ready"] is True,
        "review_decisions_190": review.get("decision_item_count") == 190,
        "optional_owner_answers_40": review.get("optional_owner_write_prompt_count") == 40,
        "review_sessions_exact": review.get("session_counts") == {"A": 40, "B": 40, "C": 40, "D": 40, "E": 30},
        "all_review_sections_have_unique_sources": set(review.get("source_section_counts", {})) == set(pack.get("sections", [])) and all(count > 0 for count in review.get("source_section_counts", {}).values()),
        "unique_source_plus_repeat_partition": review.get("unique_case_count") == 166 and review.get("blind_repeat_case_count") == 24,
        "weird_battery_floor": review.get("unique_weird_case_count", 0) >= 40,
        "crocodile_boundary_floor": review.get("unique_crocodile_boundary_pair_count", 0) >= 24,
        "generic_good_floor": review.get("unique_generic_good_case_count", 0) >= 50,
        "reverse_control_floor": review.get("unique_reverse_control_case_count", 0) >= 40,
        "open_ended_range": 20 <= review.get("open_ended_count", 0) <= 30,
        "blind_repeat_floor": review.get("blind_repeat_rate", 0) >= 0.12,
        "owner_review_v1_paused": review.get("owner_review_v1_paused") is True and review.get("owner_review_v1_item_count") == 174,
        "pack_identity_bound": pack.get("pack_id") == review.get("pack_id") == linkage.get("pack_id") == ui_validation.get("pack_id") == browser_validation.get("pack_id"),
        "pack_hash_bound": pack_sha256 == review.get("input_sha256") == linkage.get("pack_sha256") == ui_validation.get("pack_sha256") == browser_validation.get("pack_sha256"),
        "linkage_ready": linkage.get("status") == "OWNER_REVIEW_LINKAGE_READY",
        "linkage_resolves_all_targets": linkage.get("unresolved_target_refs") == [] and linkage.get("uncovered_high_value_target_counts") == {"antipattern": 0, "contradiction": 0, "grammar": 0, "microtrait": 0, "mode": 0},
        "full_candidate_review_coverage": linkage.get("linked_target_counts", {}).get("microtrait") == summary["microtrait_hypothesis_count"] and linkage.get("linked_target_counts", {}).get("mode") == summary["persona_mode_hypothesis_count"] and linkage.get("linked_target_counts", {}).get("antipattern") == summary["antipattern_count"] and linkage.get("linked_target_counts", {}).get("contradiction") == summary["contradiction_count"],
        "ui_validation_current_pack": ui_validation.get("status") == "VALIDATION_PASSED" and ui_validation.get("browser_reverification", {}).get("status") == "PASSED",
        "browser_validation_current_pack": browser_validation.get("verified") is True and browser_validation.get("test_draft_cleared_after_validation") is True and browser_validation.get("console_error_count") == 0 and browser_validation.get("external_network_request_count") == 0,
        "owner_answers_zero": review.get("owner_answers_present") is False,
        "owner_labels_zero": review.get("owner_labels_present") is False,
        "owner_review_incomplete": review.get("owner_review_completed") is False,
        "profile_not_frozen": review.get("profile_frozen") is False,
        "training_not_authorized": review.get("training_authorized") is False,
        "training_not_started": review.get("training_started") is False,
        "network_not_required": review.get("network_required") is False,
        "summary_safety_flags": all(summary_safety.values()),
        "production_diff_gate_pass": production_gate.get("passed") is True,
        "no_production_surface_diff": production_gate.get("production_surface_diff_count") == 0,
        "secret_scan_pass": secret_scan.get("violations") == 0 and secret_scan.get("secret_file_read") is False,
        "tests_pass": args.tests_pass,
        "gates_pass": args.gates_pass,
        "browser_verified": args.browser_verified,
    }
    failed = sorted(key for key, value in invariants.items() if not value)
    if failed:
        raise SystemExit("r30j0_p2_finalize_invariant_failed:" + ",".join(failed))
    if args.require_pushed and (not pushed or not worktree_clean):
        raise SystemExit("r30j0_p2_finalize_requires_pushed_clean_main")

    aggregate_keys = (
        "historical_sources_reexamined",
        "normative_personal_evidence_count",
        "microtrait_hypothesis_count",
        "persona_mode_hypothesis_count",
        "register_count",
        "antipattern_count",
        "contradiction_count",
        "unresolved_question_count",
        "elicitation_item_count",
        "crocodile_mode_seed_present",
        "crocodile_mode_boundary_known",
        "deprecated_wired_label_removed",
        "owner_review_v2_ready",
    )
    aggregate = {key: summary[key] for key in aggregate_keys}
    final_report = {
        "schema_version": "r30j0.p2-final-report.v1",
        "campaign": "R30J0-P2",
        "phase_terminal_state": PHASE_TERMINAL,
        "next_state": NEXT_STATE,
        "generated_at": timestamp,
        "repository": {
            "branch": branch,
            "head": head,
            "origin_main": origin_main,
            "head_equals_origin_main": pushed,
            "worktree_clean": worktree_clean,
        },
        "aggregate_safe_results": aggregate,
        "frozen_input_verification": frozen,
        "validation": invariants,
        "execution": {
            "training_started": False,
            "classification_updates": 0,
            "optimizer_tokens": 0,
            "checkpoint": None,
            "candidate": None,
            "api_requests": 0,
            "external_network_requests": 0,
            "local_loopback_ui_validation_requests": browser_validation.get("loopback_request_count", 0),
            "model_architecture_changed": False,
            "production_modified": False,
            "deployment_performed": False,
        },
        "owner_review_v1_paused": True,
        "owner_review_v1_item_count": 174,
        "owner_review_completed": False,
        "profile_frozen": False,
        "r30j1_authorized": False,
        "contains_owner_excerpts": False,
        "contains_owner_answers": False,
        "contains_owner_labels": False,
    }
    terminal = {
        "schema_version": "r30j0.p2-final-terminal.v1",
        "campaign": "R30J0-P2",
        "terminal_state": PHASE_TERMINAL,
        "next_state": NEXT_STATE,
        "r30j0_state_preserved": "HUMAN_OWNER_REVIEW_REQUIRED",
        "r30j0_p_state_preserved": "PERSONAL_SOURCE_EVIDENCE_READY",
        "owner_review_completed": False,
        "training_started": False,
        "classification_updates": 0,
        "optimizer_tokens": 0,
        "checkpoint": None,
        "candidate": None,
        "r30j1_authorized": False,
        "generated_at": timestamp,
    }
    campaign_state = {
        "campaign": "R30J0-P2",
        "phase_state": PHASE_TERMINAL,
        "state": NEXT_STATE,
        "current_process": None,
        "owner_review_v1_paused": True,
        "owner_review_completed": False,
        "profile_frozen": False,
        "training_started": False,
        "classification_updates": 0,
        "optimizer_tokens": 0,
        "r30j1_authorized": False,
        "updated_at": timestamp,
    }
    heartbeat = {
        "campaign": "R30J0-P2",
        "phase_state": PHASE_TERMINAL,
        "state": NEXT_STATE,
        "process_running": False,
        "heartbeat_healthy": True,
        "training_running": False,
        "api_request_running": False,
        "updated_at": timestamp,
    }
    atomic_json(REPORT_ROOT / "production_diff_gate.json", production_gate)
    atomic_json(REPORT_ROOT / "frozen_input_verification.json", frozen)
    atomic_json(REPORT_ROOT / "final_report.json", final_report)
    atomic_json(REPORT_ROOT / "final_terminal.json", terminal)
    atomic_json(P2_ROOT / "campaign_state.json", campaign_state)
    atomic_json(P2_ROOT / "heartbeat_latest.json", heartbeat)
    print(
        json.dumps(
            {
                "phase_terminal_state": PHASE_TERMINAL,
                "next_state": NEXT_STATE,
                "owner_review_completed": False,
                "training_started": False,
                "r30j1_authorized": False,
                "head_equals_origin_main": pushed,
                "worktree_clean": worktree_clean,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
