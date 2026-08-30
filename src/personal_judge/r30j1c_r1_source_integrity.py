"""Fail-closed terminal evidence for R30J1C-R1 source loss.

The module accepts aggregate machine-local audit receipts only.  It never
opens owner text, screenshots, R30J1A datasets, prediction rows, or heldout
material.  Missing evidence remains unknown rather than being converted into
an observed zero.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


CAMPAIGN_ID = "r30j1c_r1_staged_error_driven_owner_correction_v1"
TERMINAL_STATE = "BLOCKED_SOURCE_INTEGRITY"
PLANNED_COUNTS = {
    "SESSION_1": 19,
    "SESSION_2": 15,
    "SESSION_3": 15,
    "SESSION_4": 13,
    "SESSION_5": 15,
}
HISTORICAL_STATES = {
    "R30J0-P": "PERSONAL_SOURCE_EVIDENCE_READY",
    "R30J0": "HUMAN_OWNER_REVIEW_REQUIRED",
    "R30J0-P2": "R30J0_P2_PERSONA_EXCAVATION_READY",
    "R30J1A": "BLOCKED_SHORTCUT_DOMINANCE",
    "manual_owner_evidence": "HIGH_INFORMATION_AUTHENTIC_PERSONAL_SOURCE",
    "R30J1A_heldout_historical_state": "SEALED_NOT_OPENED",
}


class SourceIntegrityError(ValueError):
    """Aggregate blocker evidence is incomplete or unsafe."""


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise SourceIntegrityError(code)


def _exact_zero(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value == 0


def _zero_execution_boundary(receipt: Mapping[str, Any], label: str) -> None:
    _require(receipt.get("heldout_used") is False, f"{label}_heldout_used")
    _require(receipt.get("training_started") is False, f"{label}_training_started")
    _require(_exact_zero(receipt.get("api_requests")), f"{label}_api_requests")
    for key in ("optimizer_tokens", "classification_updates", "assistant_target_tokens"):
        _require(_exact_zero(receipt.get(key)), f"{label}_{key}")
    _require(receipt.get("gold_admission", False) is False, f"{label}_gold_admission")


def validate_governance_gate(report: Mapping[str, Any]) -> dict[str, bool]:
    """Derive terminal governance claims from the independent diff gate."""

    _require(
        report.get("schema_version") == "r30j1c-r1.no-production-change-gate.v1",
        "governance_gate_version",
    )
    _require(report.get("passed") is True, "governance_gate_failed")
    _require(report.get("branch") == "main", "governance_branch")
    _require(report.get("base_is_ancestor") is True, "governance_base_ancestor")
    zero_fields = (
        "unexpected_path_count",
        "production_surface_diff_count",
        "forbidden_path_count",
        "unsafe_change_status_count",
        "private_absolute_path_count",
        "secret_material_count",
        "network_call_code_count",
        "unsafe_file_type_count",
        "oversized_public_contract_file_count",
        "historical_state_diff_count",
    )
    for field in zero_fields:
        _require(_exact_zero(report.get(field)), f"governance_{field}")
    package_contract = report.get("package_contract")
    _require(
        isinstance(package_contract, Mapping) and package_contract.get("passed") is True,
        "governance_package_contract",
    )
    # Each claim below is computed from audited counts.  None is accepted as a
    # self-attested boolean from the report producer.
    return {
        "no_private_source_committed": all(
            _exact_zero(report.get(field))
            for field in (
                "unexpected_path_count",
                "forbidden_path_count",
                "private_absolute_path_count",
                "secret_material_count",
                "unsafe_file_type_count",
            )
        ),
        "no_production_change": _exact_zero(report.get("production_surface_diff_count")),
        "no_deployment": (
            _exact_zero(report.get("production_surface_diff_count"))
            and _exact_zero(report.get("unexpected_path_count"))
        ),
        "no_q4_export": (
            _exact_zero(report.get("forbidden_path_count"))
            and _exact_zero(report.get("unexpected_path_count"))
        ),
        "no_rag": (
            _exact_zero(report.get("unexpected_path_count"))
            and _exact_zero(report.get("production_surface_diff_count"))
        ),
    }


def validate_j1a_blocker(receipt: Mapping[str, Any]) -> None:
    """Require an aggregate J1A blocker without treating absence as zero."""

    _require(
        receipt.get("schema_version") == "r30j1c-r1.j1a-source-pool-blocked-receipt.v1",
        "j1a_blocker_version",
    )
    _require(receipt.get("status") == TERMINAL_STATE, "j1a_blocker_status")
    failure_codes = receipt.get("failure_codes")
    if failure_codes is None:
        failure_codes = [receipt.get("failure_code")]
    _require(isinstance(failure_codes, list) and failure_codes, "j1a_failure_codes_missing")
    allowed_failures = {
        "J1A_DEV_SOURCE_VAULT_MISSING",
        "J1A_DEV_SOURCE_VAULT_EMPTY",
        "J1A_DEV_SOURCE_PATH_UNSAFE",
        "J1A_DEV_REQUIRED_INPUT_PARTIAL",
        "J1A_DEV_REQUIRED_INPUT_GAP",
        "J1A_DEV_PROVENANCE_ANCHOR_UNAVAILABLE",
    }
    _require(set(failure_codes).issubset(allowed_failures), "j1a_failure_code_unknown")
    _require(
        "J1A_DEV_REQUIRED_INPUT_GAP" in failure_codes
        or "J1A_DEV_PROVENANCE_ANCHOR_UNAVAILABLE" in failure_codes,
        "j1a_blocking_reason_unrecorded",
    )
    _require(receipt.get("source_scope") == "J1A_TRAIN_DEV_DIAGNOSTIC_ONLY", "j1a_source_scope")
    _require(receipt.get("logical_source_root") == "artifacts/r30j1a/dataset", "j1a_logical_root")
    _require(receipt.get("audit_method") == "FIXED_LOGICAL_PATH_LSTAT_ONLY", "j1a_audit_method")
    _require(receipt.get("source_directory_enumerated") is False, "j1a_directory_enumerated")
    _require(receipt.get("source_content_read") is False, "j1a_source_content_read")
    root_state = receipt.get("source_root_state")
    _require(
        root_state in {"MISSING", "SAFE_DIRECTORY", "UNSAFE_SYMLINK", "UNSAFE_NON_DIRECTORY"},
        "j1a_source_root_state",
    )
    _require(isinstance(receipt.get("source_vault_exists"), bool), "j1a_source_vault_exists_type")
    _require(receipt.get("source_vault_exists") is (root_state != "MISSING"), "j1a_source_vault_exists")
    safe_count = receipt.get("safe_regular_file_count_observed")
    _require(
        isinstance(safe_count, int) and not isinstance(safe_count, bool) and safe_count >= 0,
        "j1a_safe_file_count",
    )
    unsafe_count = receipt.get("unsafe_path_count_observed")
    _require(
        isinstance(unsafe_count, int) and not isinstance(unsafe_count, bool) and unsafe_count >= 0,
        "j1a_unsafe_path_count",
    )
    if root_state == "MISSING":
        _require(safe_count == 0, "j1a_missing_root_with_files")
        _require("J1A_DEV_SOURCE_VAULT_MISSING" in failure_codes, "j1a_missing_root_unrecorded")
    elif root_state == "SAFE_DIRECTORY" and safe_count == 0:
        _require("J1A_DEV_SOURCE_VAULT_EMPTY" in failure_codes, "j1a_empty_root_unrecorded")
    if root_state.startswith("UNSAFE") or unsafe_count > 0:
        _require("J1A_DEV_SOURCE_PATH_UNSAFE" in failure_codes, "j1a_unsafe_path_unrecorded")
    required_groups = receipt.get("required_input_group_count")
    satisfied_groups = receipt.get("satisfied_input_group_count")
    _require(required_groups == 4, "j1a_required_group_count")
    _require(
        isinstance(satisfied_groups, int)
        and not isinstance(satisfied_groups, bool)
        and 0 <= satisfied_groups <= required_groups,
        "j1a_satisfied_group_count",
    )
    required_inputs_present = receipt.get("required_inputs_present")
    _require(isinstance(required_inputs_present, bool), "j1a_required_inputs_type")
    expected_required_inputs_present = (
        root_state == "SAFE_DIRECTORY"
        and unsafe_count == 0
        and satisfied_groups == required_groups
    )
    _require(
        required_inputs_present is expected_required_inputs_present,
        "j1a_required_inputs_claim",
    )
    _require(receipt.get("provenance_anchor_available") is False, "j1a_provenance_anchor")
    _require(receipt.get("ready_path_authorized") is False, "j1a_ready_path")
    if required_inputs_present:
        _require("J1A_DEV_REQUIRED_INPUT_GAP" not in failure_codes, "j1a_false_input_gap")
        _require(
            "J1A_DEV_PROVENANCE_ANCHOR_UNAVAILABLE" in failure_codes,
            "j1a_complete_without_provenance_block",
        )
    else:
        _require(
            "J1A_DEV_REQUIRED_INPUT_GAP" in failure_codes
            or "J1A_DEV_SOURCE_PATH_UNSAFE" in failure_codes,
            "j1a_input_gap_or_unsafe_unrecorded",
        )
    _require(receipt.get("available_counts") is None, "j1a_missing_counts_must_be_unknown")
    selected_counts = receipt.get("selected_counts")
    _require(
        isinstance(selected_counts, Mapping)
        and set(selected_counts) == {
            "AUTHENTIC_OWNER_FALSE_NEGATIVE",
            "CONTROLLED_GENERIC_FALSE_POSITIVE",
            "REGISTER_CONFUSION",
            "SHORTCUT_PAIR",
        }
        and all(_exact_zero(value) for value in selected_counts.values()),
        "j1a_selected_counts_nonzero_or_invalid",
    )
    _require(_exact_zero(receipt.get("selected_total")), "j1a_selected_rows_without_source")
    _require(receipt.get("source_rows_written") is False, "j1a_source_rows_written")
    _require(receipt.get("heldout_path_opened") is False, "j1a_heldout_path_opened")
    _require(receipt.get("heldout_content_read") is False, "j1a_heldout_content_read")
    _require(
        receipt.get("heldout_content_read_claim") == "NO_HELDOUT_PATH_OR_CONTENT_OPENED",
        "j1a_heldout_content_claim",
    )
    _require(receipt.get("heldout_derived_content_used") is False, "j1a_heldout_derived")
    _require(receipt.get("sealed_evaluation_used") is False, "j1a_sealed_evaluation_used")
    _require(receipt.get("private_owner_text_reported") is False, "j1a_private_owner_text_reported")
    _require(receipt.get("model_rerun_performed", False) is False, "j1a_model_rerun")
    _require(receipt.get("allowed_for_training") is False, "j1a_training_admission")
    _zero_execution_boundary(receipt, "j1a")


def validate_persona_blocker(receipt: Mapping[str, Any]) -> None:
    """Require distinct P2 and manual-source absence counts."""

    _require(
        receipt.get("version") == "r30j1c-r1.persona-source-integrity-block.v1",
        "persona_blocker_version",
    )
    _require(receipt.get("status") == TERMINAL_STATE, "persona_blocker_status")
    _require(
        receipt.get("error_code") in {
            "required_populated_source_unavailable",
            "trusted_provenance_anchor_unavailable",
        },
        "persona_error_code",
    )
    _require(receipt.get("audit_method") == "FIXED_LOGICAL_PATH_LSTAT_ONLY", "persona_audit_method")
    _require(receipt.get("source_directory_enumerated") is False, "persona_directory_enumerated")
    _require(
        receipt.get("p2_logical_source_root") == "artifacts/r30j0/persona_excavation",
        "persona_p2_logical_root",
    )
    _require(
        receipt.get("manual_logical_source_root")
        == "artifacts/r30j1c/manual_owner_evidence/current",
        "persona_manual_logical_root",
    )
    root_states = {"MISSING", "SAFE_DIRECTORY", "UNSAFE_SYMLINK", "UNSAFE_NON_DIRECTORY"}
    p2_root_state = receipt.get("p2_source_root_state")
    manual_root_state = receipt.get("manual_source_root_state")
    _require(p2_root_state in root_states, "persona_p2_root_state")
    _require(manual_root_state in root_states, "persona_manual_root_state")
    _require(isinstance(receipt.get("p2_source_vault_exists"), bool), "persona_p2_exists_type")
    _require(isinstance(receipt.get("manual_source_vault_exists"), bool), "persona_manual_exists_type")
    _require(receipt.get("p2_source_vault_exists") is (p2_root_state != "MISSING"), "persona_p2_exists")
    _require(
        receipt.get("manual_source_vault_exists") is (manual_root_state != "MISSING"),
        "persona_manual_exists",
    )
    p2_required = receipt.get("p2_required_file_count")
    p2_present = receipt.get("p2_populated_file_count")
    manual_required = receipt.get("manual_required_file_count")
    manual_present = receipt.get("manual_populated_file_count")
    for value, code in (
        (p2_required, "p2_required_count"),
        (p2_present, "p2_present_count"),
        (manual_required, "manual_required_count"),
        (manual_present, "manual_present_count"),
    ):
        _require(isinstance(value, int) and not isinstance(value, bool) and value >= 0, code)
    _require(p2_present <= p2_required, "p2_present_exceeds_required")
    _require(manual_present <= manual_required, "manual_present_exceeds_required")
    p2_unsafe = receipt.get("p2_unsafe_path_count")
    manual_unsafe = receipt.get("manual_unsafe_path_count")
    for value, code in ((p2_unsafe, "p2_unsafe_count"), (manual_unsafe, "manual_unsafe_count")):
        _require(isinstance(value, int) and not isinstance(value, bool) and value >= 0, code)
    if p2_root_state == "MISSING":
        _require(p2_present == 0, "p2_missing_root_with_files")
    if manual_root_state == "MISSING":
        _require(manual_present == 0, "manual_missing_root_with_files")
    _require(_exact_zero(receipt.get("source_rows_written")), "persona_rows_written")
    p2_inputs_present = (
        p2_root_state == "SAFE_DIRECTORY"
        and p2_present == p2_required
        and p2_unsafe == 0
    )
    manual_inputs_present = (
        manual_root_state == "SAFE_DIRECTORY"
        and manual_present == manual_required
        and manual_unsafe == 0
    )
    derived_gap = not (p2_inputs_present and manual_inputs_present)
    _require(
        receipt.get("p2_required_inputs_present") is p2_inputs_present,
        "persona_p2_required_inputs",
    )
    _require(
        receipt.get("manual_required_inputs_present") is manual_inputs_present,
        "persona_manual_required_inputs",
    )
    _require(receipt.get("required_input_gap") is derived_gap, "persona_input_gap_mismatch")
    _require(receipt.get("provenance_anchors_available") is False, "persona_provenance_anchor")
    _require(receipt.get("ready_path_authorized") is False, "persona_ready_path")
    expected_error = (
        "required_populated_source_unavailable"
        if derived_gap else "trusted_provenance_anchor_unavailable"
    )
    _require(receipt.get("error_code") == expected_error, "persona_error_reason_mismatch")
    _require(isinstance(receipt.get("validation_failed"), bool), "persona_validation_failed_type")
    _require(
        receipt.get("validation_failed") is bool(p2_unsafe or manual_unsafe),
        "persona_validation_failed_mismatch",
    )
    _require(receipt.get("source_content_read") is False, "persona_source_content_was_read")
    _require(receipt.get("heldout_content_read") is False, "persona_heldout_content_read")
    expected_claim = (
        "NO_SOURCE_CONTENT_OPENED_BEFORE_INPUT_GAP"
        if derived_gap else "NO_SOURCE_CONTENT_OPENED_DURING_PROVENANCE_BLOCK"
    )
    _require(receipt.get("heldout_content_read_claim") == expected_claim, "persona_heldout_content_claim")
    _zero_execution_boundary(receipt, "persona")


def build_blocked_reports(
    j1a_receipt: Mapping[str, Any],
    persona_receipt: Mapping[str, Any],
    *,
    git_state: Mapping[str, Any],
    governance_gate: Mapping[str, Any],
    created_at: str,
) -> dict[str, dict[str, Any]]:
    """Build aggregate ignored reports for the legal blocked terminal."""

    validate_j1a_blocker(j1a_receipt)
    validate_persona_blocker(persona_receipt)
    _require(isinstance(created_at, str) and created_at.endswith("Z"), "created_at_invalid")
    _require(set(git_state) == {"head", "origin_main", "head_equals_origin_main", "worktree_clean"}, "git_state_fields")
    _require(isinstance(git_state["head"], str) and len(git_state["head"]) == 40, "head_invalid")
    _require(isinstance(git_state["origin_main"], str) and len(git_state["origin_main"]) == 40, "origin_invalid")
    governance_claims = validate_governance_gate(governance_gate)
    _require(all(governance_claims.values()), "governance_claim_not_proven")

    heldout_content_read = (
        j1a_receipt["heldout_content_read"] or persona_receipt["heldout_content_read"]
    )
    _require(heldout_content_read is False, "heldout_content_read_not_proven_false")
    shared_boundary = {
        "heldout_used": False,
        "heldout_content_read": heldout_content_read,
        "api_requests": 0,
        "training_started": False,
        "optimizer_tokens": 0,
        "classification_updates": 0,
        "assistant_target_tokens": 0,
        "gold_admission": False,
        "profile_frozen": False,
    }
    source_integrity = {
        "schema_version": "r30j1c-r1.source-integrity-report.v1",
        "campaign_id": CAMPAIGN_ID,
        "terminal_state": TERMINAL_STATE,
        "created_at": created_at,
        "failure_family": (
            "required_ignored_source_artifacts_unavailable"
            if persona_receipt["required_input_gap"] or not j1a_receipt["required_inputs_present"]
            else "immutable_provenance_anchors_unavailable"
        ),
        "j1a": {
            "required_inputs_present": j1a_receipt["required_inputs_present"],
            "provenance_anchor_available": False,
            "safe_regular_file_count_observed": j1a_receipt.get("safe_regular_file_count_observed"),
            "real_dev_error_count_available": None,
            "fine_grained_dev_diagnostics_available": False,
            "selected_items": 0,
        },
        "p2": {
            "required_file_count": persona_receipt["p2_required_file_count"],
            "populated_file_count": persona_receipt["p2_populated_file_count"],
            "unresolved_high_information_item_count_available": None,
            "selected_items": 0,
            "provenance_anchor_available": False,
        },
        "manual_owner_evidence": {
            "required_file_count": persona_receipt["manual_required_file_count"],
            "populated_file_count": persona_receipt["manual_populated_file_count"],
            "prior_ingested_item_count_available": None,
            "current_owner_instruction_theme_count": 9,
            "current_instruction_not_substituted_for_missing_provenance": True,
            "selected_items": 0,
            "provenance_anchor_available": False,
        },
        "historical_states": HISTORICAL_STATES,
        "historical_heldout_state_preserved_as_record": True,
        "heldout_artifact_presence_currently_verifiable": False,
        "heldout_open_attempted": False,
        "model_rerun_performed": False,
        "synthetic_replacement_performed": False,
        **shared_boundary,
    }
    pack_receipt = {
        "schema_version": "r30j1c-r1.blocked-pack-receipt.v1",
        "campaign_id": CAMPAIGN_ID,
        "terminal_state": TERMINAL_STATE,
        "created_at": created_at,
        "pack_created": False,
        "review_ui_built": False,
        "total_sessions": 0,
        "planned_total_sessions": 5,
        "total_decision_items": 0,
        "planned_total_decision_items": 62,
        "total_owner_write_prompts": 0,
        "planned_total_owner_write_prompts": 15,
        "blind_repeat_count": 0,
        "planned_blind_repeat_count": 6,
        "session1_count": 0,
        "session2_count": 0,
        "session3_count": 0,
        "session4_count": 0,
        "session5_count": 0,
        "planned_session_counts": PLANNED_COUNTS,
        "r30j1a_error_items_used": 0,
        "manual_owner_evidence_items_used": 0,
        "p2_items_used": 0,
        "synthetic_new_items": 0,
        **shared_boundary,
    }
    source_balance = {
        "schema_version": "r30j1c-r1.source-balance.v1",
        "campaign_id": CAMPAIGN_ID,
        "status": "NOT_RUN_SOURCE_INTEGRITY_BLOCK",
        "passed": False,
        "pack_item_count": 0,
        "percentages": None,
        "reason": "no_pack_without_required_sources",
        **shared_boundary,
    }
    question_quality = {
        "schema_version": "r30j1c-r1.question-quality-audit.v1",
        "campaign_id": CAMPAIGN_ID,
        "status": "NOT_RUN_SOURCE_INTEGRITY_BLOCK",
        "performed": False,
        "passed": False,
        "question_count": 0,
        "reason": "no_questions_generated_without_required_sources",
        **shared_boundary,
    }
    input_gap = persona_receipt["required_input_gap"] or not j1a_receipt["required_inputs_present"]
    final_terminal = {
        "schema_version": "r30j1c-r1.final-terminal.v1",
        "campaign_id": CAMPAIGN_ID,
        "terminal_state": TERMINAL_STATE,
        "terminal_reason": (
            "required_source_inputs_unavailable"
            if input_gap else "immutable_source_provenance_anchors_unavailable"
        ),
        "created_at": created_at,
        "next_state": None,
        "correction_pack_ready": False,
        "owner_correction_in_progress": False,
        "owner_review_completed": False,
        "historical_states_preserved": HISTORICAL_STATES,
        "heldout_historical_state": "SEALED_NOT_OPENED",
        "heldout_artifact_presence_currently_verifiable": False,
        "no_private_source_committed": governance_claims["no_private_source_committed"],
        "no_production_change": governance_claims["no_production_change"],
        "no_deployment": governance_claims["no_deployment"],
        "no_q4_export": governance_claims["no_q4_export"],
        "no_rag": governance_claims["no_rag"],
        "governance_gate": {
            "schema_version": governance_gate["schema_version"],
            "passed": governance_gate["passed"],
            "base_is_ancestor": governance_gate["base_is_ancestor"],
            "audited_changed_path_count": governance_gate.get("changed_path_count"),
            "all_forbidden_counts_zero": True,
        },
        "git": dict(git_state),
        **shared_boundary,
    }
    campaign_state = {
        "schema_version": "r30j1c-r1.campaign-state.v1",
        "campaign_id": CAMPAIGN_ID,
        "state": TERMINAL_STATE,
        "terminal_state": TERMINAL_STATE,
        "updated_at": created_at,
        "previous_campaign_states_modified": False,
        "next_state": None,
        "correction_pack_created": False,
        **shared_boundary,
    }
    return {
        "source_integrity_report.json": source_integrity,
        "pack_receipt.json": pack_receipt,
        "source_balance.json": source_balance,
        "question_quality_audit.json": question_quality,
        "reports/final_terminal.json": final_terminal,
        "campaign_state.json": campaign_state,
    }
