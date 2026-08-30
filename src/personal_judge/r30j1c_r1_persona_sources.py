"""Fail-closed source-pool contract for R30J1C-R1 persona evidence.

This module converts already-reviewed *local* P2 and manual-evidence records
into bounded, opaque references for a later correction-pack builder.  It does
not contain owner values, source identifiers, prompts, labels, or model logic.
Populated records are private artifacts and must remain ignored.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
import hashlib
import re
from typing import Any


POOL_VERSION = "r30j1c-r1.persona-source-pool.v1"
ROW_VERSION = "r30j1c-r1.persona-source-row.v1"

SOURCE_KINDS = (
    "P2_UNRESOLVED_REVIEW_ITEM",
    "P2_MICROTRAIT",
    "P2_MODE",
    "P2_CONTRADICTION",
    "P2_ANTIPATTERN",
    "MANUAL_HYPOTHESIS",
    "MANUAL_CORRECTION_CLUSTER",
)

ELIGIBLE_SESSIONS = ("SESSION_2", "SESSION_3", "SESSION_4", "SESSION_5")
REGISTER_CODES = (
    "ordinary_chat",
    "casual_banter",
    "weird_question",
    "absurd_meta_ai",
    "practical_advice",
    "technical_explanation",
    "debugging",
    "project_discussion",
    "academic_discussion",
    "philosophy",
    "personal_reflection",
    "light_emotional",
    "formal_message",
    "creative_play",
    "roleplay",
)

INFORMATION_SIGNAL_KEYS = (
    "model_confidence",
    "model_error_severity",
    "shortcut_suspicion",
    "persona_uncertainty",
    "register_boundary",
    "historical_evidence_conflict",
    "potential_training_value",
)

_OPAQUE_REF = re.compile(r"^local\.[a-f0-9]{16,64}$")
_SAFE_CODE = re.compile(r"^[A-Za-z][A-Za-z0-9._:-]{2,159}$")
_HELDOUT_TOKEN = re.compile(r"(^|[._:/-])heldout([._:/-]|$)", re.IGNORECASE)


class PersonaSourceIntegrityError(ValueError):
    """A source cannot be used without weakening provenance or privacy."""


def opaque_ref(*parts: str) -> str:
    """Return a deterministic local reference without exposing input values."""

    material = "\x1f".join(str(part) for part in parts).encode("utf-8")
    return "local." + hashlib.sha256(material).hexdigest()


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise PersonaSourceIntegrityError(code)


def _exact_keys(record: Mapping[str, Any], expected: set[str], label: str) -> None:
    _require(set(record) == expected, f"{label}_field_contract_invalid")


def _opaque(value: Any, code: str) -> str:
    _require(isinstance(value, str) and _OPAQUE_REF.fullmatch(value) is not None, code)
    return str(value)


def _safe_code(value: Any, code: str) -> str:
    _require(isinstance(value, str) and _SAFE_CODE.fullmatch(value) is not None, code)
    _require(_HELDOUT_TOKEN.search(value) is None, "heldout_reference_forbidden")
    return str(value)


def _probability(value: Any, code: str) -> float:
    _require(
        isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1,
        code,
    )
    return float(value)


def _nonnegative_int(value: Any, code: str) -> int:
    _require(isinstance(value, int) and not isinstance(value, bool) and value >= 0, code)
    return int(value)


def reject_heldout_reference(value: Any) -> None:
    """Reject heldout paths or identifiers before any source file is opened."""

    if isinstance(value, str):
        _require(_HELDOUT_TOKEN.search(value) is None, "heldout_reference_forbidden")
    elif isinstance(value, Mapping):
        # Contract keys such as ``heldout_eligible`` are expected.  Only
        # source-controlled values may identify a heldout path or record.
        for nested in value.values():
            reject_heldout_reference(nested)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for nested in value:
            reject_heldout_reference(nested)


ROW_FIELDS = {
    "version",
    "pool_ref",
    "source_kind",
    "source_bundle_ref",
    "source_target_ref",
    "source_family_refs",
    "eligible_sessions",
    "register_codes",
    "dimension_codes",
    "review_refs",
    "information_signals",
    "priority_score",
    "local_review_payload",
    "contains_private_text",
    "owner_review_required",
    "normative_status",
    "gold_admission",
    "allowed_for_training",
    "heldout_eligible",
}


def validate_source_row(record: Mapping[str, Any]) -> None:
    """Validate one ignored source-pool row."""

    _exact_keys(record, ROW_FIELDS, "persona_source_row")
    _require(record["version"] == ROW_VERSION, "persona_source_row_version_invalid")
    _opaque(record["pool_ref"], "pool_ref_must_be_opaque")
    _opaque(record["source_bundle_ref"], "source_bundle_ref_must_be_opaque")
    _opaque(record["source_target_ref"], "source_target_ref_must_be_opaque")
    _require(record["source_kind"] in SOURCE_KINDS, "source_kind_invalid")

    family_refs = record["source_family_refs"]
    _require(isinstance(family_refs, list) and family_refs, "source_family_refs_required")
    _require(len(family_refs) == len(set(family_refs)), "source_family_refs_must_be_unique")
    for value in family_refs:
        _opaque(value, "source_family_ref_must_be_opaque")

    sessions = record["eligible_sessions"]
    _require(isinstance(sessions, list) and sessions, "eligible_sessions_required")
    _require(len(sessions) == len(set(sessions)), "eligible_sessions_must_be_unique")
    _require(all(value in ELIGIBLE_SESSIONS for value in sessions), "eligible_session_invalid")

    registers = record["register_codes"]
    _require(isinstance(registers, list) and registers, "register_codes_required")
    _require(len(registers) == len(set(registers)), "register_codes_must_be_unique")
    _require(all(value in REGISTER_CODES for value in registers), "register_code_invalid")

    dimensions = record["dimension_codes"]
    _require(isinstance(dimensions, list) and dimensions, "dimension_codes_required")
    _require(len(dimensions) == len(set(dimensions)), "dimension_codes_must_be_unique")
    for value in dimensions:
        _safe_code(value, "dimension_code_invalid")

    review_refs = record["review_refs"]
    _require(isinstance(review_refs, list) and review_refs, "review_refs_required")
    _require(len(review_refs) == len(set(review_refs)), "review_refs_must_be_unique")
    for value in review_refs:
        _opaque(value, "review_ref_must_be_opaque")

    signals = record["information_signals"]
    _require(isinstance(signals, Mapping), "information_signals_must_be_object")
    _exact_keys(signals, set(INFORMATION_SIGNAL_KEYS), "information_signals")
    for key in INFORMATION_SIGNAL_KEYS:
        _probability(signals[key], f"information_signal_invalid:{key}")
    _probability(record["priority_score"], "priority_score_invalid")

    _require(isinstance(record["local_review_payload"], Mapping), "local_review_payload_invalid")
    reject_heldout_reference(record["local_review_payload"])
    _require(isinstance(record["contains_private_text"], bool), "contains_private_text_invalid")
    _require(record["owner_review_required"] is True, "owner_review_required_must_be_true")
    _require(record["normative_status"] == "UNRESOLVED", "normative_status_must_be_unresolved")
    _require(record["gold_admission"] is False, "gold_admission_must_be_false")
    _require(record["allowed_for_training"] is False, "allowed_for_training_must_be_false")
    _require(record["heldout_eligible"] is False, "heldout_eligible_must_be_false")
    reject_heldout_reference(record)


POOL_FIELDS = {
    "version",
    "status",
    "source_rows",
    "source_kind_counts",
    "eligible_session_counts",
    "p2_audit",
    "manual_audit",
    "manual_compression",
    "pack_constraints",
    "heldout_used",
    "api_requests",
    "training_started",
    "optimizer_tokens",
    "classification_updates",
    "assistant_target_tokens",
    "gold_admission",
    "owner_review_completed",
}


def validate_pool_document(record: Mapping[str, Any]) -> None:
    """Validate a ready pool and its aggregate, no-training receipt."""

    _exact_keys(record, POOL_FIELDS, "persona_source_pool")
    _require(record["version"] == POOL_VERSION, "persona_source_pool_version_invalid")
    _require(record["status"] == "SOURCE_POOL_READY", "persona_source_pool_status_invalid")
    rows = record["source_rows"]
    _require(isinstance(rows, list) and rows, "persona_source_rows_required")
    for row in rows:
        _require(isinstance(row, Mapping), "persona_source_row_must_be_object")
        validate_source_row(row)
    refs = [row["pool_ref"] for row in rows]
    _require(len(refs) == len(set(refs)), "persona_source_pool_refs_must_be_unique")

    kind_counts = record["source_kind_counts"]
    _require(isinstance(kind_counts, Mapping), "source_kind_counts_invalid")
    _exact_keys(kind_counts, set(SOURCE_KINDS), "source_kind_counts")
    for kind in SOURCE_KINDS:
        _nonnegative_int(kind_counts[kind], "source_kind_count_type")
        _require(kind_counts[kind] == sum(row["source_kind"] == kind for row in rows), "source_kind_count_mismatch")

    session_counts = record["eligible_session_counts"]
    _require(isinstance(session_counts, Mapping), "eligible_session_counts_invalid")
    _exact_keys(session_counts, set(ELIGIBLE_SESSIONS), "eligible_session_counts")
    for session in ELIGIBLE_SESSIONS:
        _nonnegative_int(session_counts[session], "eligible_session_count_type")
        _require(session_counts[session] == sum(session in row["eligible_sessions"] for row in rows), "eligible_session_count_mismatch")

    _validate_p2_audit(record["p2_audit"])
    _validate_manual_audit(record["manual_audit"])
    _validate_manual_compression(record["manual_compression"], rows)
    _validate_pack_constraints(record["pack_constraints"])
    _require(
        record["p2_audit"]["selected_row_count"]
        == sum(str(row["source_kind"]).startswith("P2_") for row in rows),
        "p2_selected_row_count_mismatch",
    )
    _require(
        record["manual_audit"]["hypothesis_count"]
        == sum(row["source_kind"] == "MANUAL_HYPOTHESIS" for row in rows),
        "manual_hypothesis_row_count_mismatch",
    )

    _require(record["heldout_used"] is False, "heldout_used_must_be_false")
    _require(_nonnegative_int(record["api_requests"], "api_requests_type") == 0, "api_requests_must_be_zero")
    _require(record["training_started"] is False, "training_started_must_be_false")
    for key in ("optimizer_tokens", "classification_updates", "assistant_target_tokens"):
        _require(_nonnegative_int(record[key], f"{key}_type") == 0, f"{key}_must_be_zero")
    _require(record["gold_admission"] is False, "pool_gold_admission_must_be_false")
    _require(record["owner_review_completed"] is False, "owner_review_completed_must_be_false")
    reject_heldout_reference(record)


def _validate_p2_audit(record: Any) -> None:
    _require(isinstance(record, Mapping), "p2_audit_invalid")
    expected = {
        "terminal_state_preserved",
        "microtrait_count",
        "mode_count",
        "antipattern_count",
        "contradiction_count",
        "unresolved_question_count",
        "review_linkage_resolved",
        "selected_row_count",
        "descriptive_promoted_to_normative_count",
    }
    _exact_keys(record, expected, "p2_audit")
    _require(record["terminal_state_preserved"] is True, "p2_terminal_state_not_preserved")
    for key in expected - {"terminal_state_preserved", "review_linkage_resolved"}:
        _require(isinstance(record[key], int) and not isinstance(record[key], bool) and record[key] >= 0, f"p2_audit_count_invalid:{key}")
    _require(record["microtrait_count"] >= 40, "p2_microtrait_floor_not_met")
    _require(record["mode_count"] >= 1, "p2_mode_missing")
    _require(record["antipattern_count"] >= 1, "p2_antipattern_missing")
    _require(record["contradiction_count"] >= 1, "p2_contradiction_missing")
    _require(record["unresolved_question_count"] >= 1, "p2_unresolved_questions_missing")
    _require(record["review_linkage_resolved"] is True, "p2_review_linkage_unresolved")
    _require(record["descriptive_promoted_to_normative_count"] == 0, "p2_descriptive_promoted_to_normative")


def _validate_manual_audit(record: Any) -> None:
    _require(isinstance(record, Mapping), "manual_audit_invalid")
    expected = {
        "source_family_count",
        "hypothesis_count",
        "correction_theme_count",
        "quote_blocks_separated",
        "third_party_identifiers_removed",
        "peer_normative_weight_zero",
        "single_family_preserved",
        "owner_review_completed",
        "gold_admitted",
        "allowed_for_training",
    }
    _exact_keys(record, expected, "manual_audit")
    _require(record["source_family_count"] == 1, "manual_source_family_count_must_be_one")
    _require(record["hypothesis_count"] == 9, "manual_hypothesis_count_must_equal_nine")
    _require(record["correction_theme_count"] == 9, "manual_correction_theme_count_must_equal_nine")
    for key in ("quote_blocks_separated", "third_party_identifiers_removed", "peer_normative_weight_zero", "single_family_preserved"):
        _require(record[key] is True, f"manual_audit_{key}_must_be_true")
    for key in ("owner_review_completed", "gold_admitted", "allowed_for_training"):
        _require(record[key] is False, f"manual_audit_{key}_must_be_false")


def _validate_manual_compression(record: Any, rows: Sequence[Mapping[str, Any]]) -> None:
    _require(isinstance(record, Mapping), "manual_compression_invalid")
    expected = {
        "input_theme_count",
        "contextual_target_count",
        "all_input_themes_covered_once",
        "maximum_contextual_targets",
    }
    _exact_keys(record, expected, "manual_compression")
    _require(record["input_theme_count"] == 9, "manual_compression_input_count_invalid")
    _require(1 <= record["contextual_target_count"] <= 6, "manual_compression_target_count_invalid")
    _require(record["maximum_contextual_targets"] == 6, "manual_compression_maximum_invalid")
    _require(record["all_input_themes_covered_once"] is True, "manual_compression_coverage_invalid")
    _require(
        record["contextual_target_count"] == sum(row["source_kind"] == "MANUAL_CORRECTION_CLUSTER" for row in rows),
        "manual_compression_row_count_mismatch",
    )


def _validate_pack_constraints(record: Any) -> None:
    _require(isinstance(record, Mapping), "pack_constraints_invalid")
    expected = {
        "crocodile_decision_fraction_minimum",
        "crocodile_decision_fraction_maximum",
        "manual_source_family_must_remain_one",
        "manual_contextual_target_maximum",
    }
    _exact_keys(record, expected, "pack_constraints")
    _require(record["crocodile_decision_fraction_minimum"] == 0.15, "crocodile_fraction_minimum_invalid")
    _require(record["crocodile_decision_fraction_maximum"] == 0.20, "crocodile_fraction_maximum_invalid")
    _require(record["manual_source_family_must_remain_one"] is True, "manual_family_constraint_invalid")
    _require(record["manual_contextual_target_maximum"] == 6, "manual_target_maximum_invalid")


def information_signals(
    *,
    persona_uncertainty: float,
    register_boundary: float,
    historical_evidence_conflict: float,
    potential_training_value: float,
) -> dict[str, float]:
    """Build the source-only portion of the R30J1C information-gain vector."""

    result = {
        "model_confidence": 0.0,
        "model_error_severity": 0.0,
        "shortcut_suspicion": 0.0,
        "persona_uncertainty": persona_uncertainty,
        "register_boundary": register_boundary,
        "historical_evidence_conflict": historical_evidence_conflict,
        "potential_training_value": potential_training_value,
    }
    for key, value in result.items():
        _probability(value, f"information_signal_invalid:{key}")
    return result


def priority_from_signals(signals: Mapping[str, float]) -> float:
    """Rank review value without claiming a normative preference."""

    weights = {
        "persona_uncertainty": 0.30,
        "register_boundary": 0.25,
        "historical_evidence_conflict": 0.25,
        "potential_training_value": 0.20,
    }
    score = sum(float(signals[key]) * weight for key, weight in weights.items())
    return round(min(1.0, max(0.0, score)), 6)


def aggregate_counts(rows: Iterable[Mapping[str, Any]]) -> tuple[dict[str, int], dict[str, int]]:
    material = list(rows)
    kind_counts = {kind: sum(row["source_kind"] == kind for row in material) for kind in SOURCE_KINDS}
    session_counts = {session: sum(session in row["eligible_sessions"] for row in material) for session in ELIGIBLE_SESSIONS}
    return kind_counts, session_counts
