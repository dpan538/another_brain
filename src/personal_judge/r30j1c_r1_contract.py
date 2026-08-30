"""Fail-closed contracts for the R30J1C-R1 local correction review.

Populated packs and owner responses are private ignored artifacts.  This module
contains only structural policy and never infers an owner profile.
"""

from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
import math
import re
from typing import Any, Iterable, Mapping


SCHEMA_VERSION = "r30j1c-r1.owner-correction-pack.v1"
RECORD_SCHEMA_VERSION = "r30j1c-r1.correction-record.v1"
CAMPAIGN_ID = "r30j1c_r1_staged_error_driven_owner_correction_v1"
SESSION_IDS = ("SESSION_1", "SESSION_2", "SESSION_3", "SESSION_4", "SESSION_5")
SESSION_STATES = ("NOT_STARTED", "IN_PROGRESS", "COMPLETED", "VALIDATED")
SOURCE_KINDS = (
    "J1A_DEV_ERROR",
    "J1A_SHORTCUT",
    "P2_HYPOTHESIS",
    "P2_CONTRADICTION",
    "MANUAL_OWNER_EVIDENCE",
    "PUBLIC_SAFE_SYNTHETIC",
)
DECISION_RANGES = {
    "SESSION_1": (18, 20),
    "SESSION_2": (14, 16),
    "SESSION_3": (14, 16),
    "SESSION_4": (12, 14),
}
NOTE_REQUIRED_DECISIONS = frozenset({"DEPENDS", "NONE", "EDIT"})
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
PACK_ID_RE = re.compile(r"^r30j1c-r1-[a-f0-9]{16}$")
OPAQUE_REF_RE = re.compile(r"^local\.[a-z0-9._-]{8,160}$")
SAFE_CODE_RE = re.compile(r"^[a-z][a-z0-9._-]{1,127}$")
ITEM_ID_RE = re.compile(r"^R30J1C-S[1-4]-[0-9]{3}$")
WRITE_ID_RE = re.compile(r"^R30J1C-S5-W[0-9]{3}$")
_PATH_SEPARATOR = "/"
_PRIVATE_PATH_MARKERS = (
    _PATH_SEPARATOR + "Users" + _PATH_SEPARATOR,
    _PATH_SEPARATOR + "private" + _PATH_SEPARATOR + "tmp" + _PATH_SEPARATOR,
    _PATH_SEPARATOR + "private" + _PATH_SEPARATOR + "var" + _PATH_SEPARATOR,
    _PATH_SEPARATOR + "var" + _PATH_SEPARATOR + "folders" + _PATH_SEPARATOR,
    _PATH_SEPARATOR + "Volumes" + _PATH_SEPARATOR,
    "file:" + _PATH_SEPARATOR + _PATH_SEPARATOR,
)
PRIVATE_PATH_RE = re.compile("(?:" + "|".join(re.escape(value) for value in _PRIVATE_PATH_MARKERS) + ")")
HARD_DISPLAY_PROVENANCE_RE = re.compile(
    r"(?:\b(?:j1a_dev_error|j1a_shortcut|train[_ -]?split|dev[_ -]?split|"
    r"heldout|model[_ -]?arm|model[_ -]?(?:probability|confidence)|source[_ -]?(?:file|filename|kind))\b|"
    r"(?:源文件|文件名|训练集|开发集|模型概率|模型置信度|历史别名)|"
    r"\b(?:historical[_ -]?alias|owner[_ -]?alias)\b|\.jsonl?\b)",
    re.IGNORECASE,
)
AUTHENTICITY_DISCLOSURE_RE = re.compile(
    r"(?:\b(?:authentic(?:[_ -]?(?:owner|response|answer|text|source|utterance|message|content))?"
    r"|synthetic(?:[_ -]?(?:owner|response|answer|text|source|utterance|message|content))?"
    r"|owner[_ -]?(?:authored|written)(?:[_ -]?(?:response|answer|text|source|message|content))?"
    r"|real[_ -]?owner(?:[_ -]?(?:response|answer|text|message))?)\b|"
    r"(?:真实(?:写过|说过|回答|回复|文本|原话|内容)|本人(?:写过|说过|写的|说的|回答|回复|文本|原话)"
    r"|合成(?:回答|回复|文本|来源|内容|样本)|这是(?:本人|你)(?:写的|说的|回答|回复)))",
    re.IGNORECASE,
)
REGISTER_CODES = frozenset({
    "CASUAL", "TECHNICAL", "REFLECTIVE", "FORMAL", "PLAYFUL",
    "LIGHT_EMOTIONAL", "PROJECT_DESIGN", "AMBIGUOUS", "MIXED",
})
OWNER_WRITE_CATEGORIES = frozenset({
    "ORDINARY_CHAT", "WEIRD_ABSURD", "META_AI", "TECHNICAL",
    "PHILOSOPHY_REFLECTIVE", "LIGHT_EMOTIONAL", "PROJECT_DESIGN",
    "PLAYFUL", "AMBIGUOUS",
})
OWNER_DECISION_CODES = frozenset({
    "PREFER_A", "PREFER_B", "PREFER_C", "TIE", "NONE", "DEPENDS", "UNSURE",
    "YES_REPRESENTATIVE", "REPRESENTATIVE", "REAL_BUT_NOT_FOR_EFISH",
    "REGISTER_SPECIFIC", "NO_LONGER_REPRESENTATIVE", "NOT_REPRESENTATIVE",
    "ACTUALLY_FITS", "TOO_GENERIC", "TOO_SHORT", "TOO_CASUAL",
    "TOO_POLISHED", "TOO_ASSISTANT_LIKE", "TOO_COLD", "TOO_STRUCTURED",
    "OTHER", "CASUAL", "TECHNICAL", "REFLECTIVE", "FORMAL", "PLAYFUL",
    "MIXED", "SURFACE_DIFFERENCE_NOT_IMPORTANT", "EDIT", "OWNER_WRITTEN",
})
FATIGUE_DECISION_CODES = frozenset({
    "STILL_NATURAL", "NATURAL_ONCE_ONLY", "BECOMES_GIMMICKY", "DEPENDS", "UNSURE",
})
REASON_CODES = frozenset({
    "WRONG_REGISTER", "TOO_FORCED", "TOO_EMPTY", "TOO_COLD", "TOO_GIMMICKY",
    "TOO_IMPRECISE", "SERIOUSNESS_REQUIRED", "NO_REAL_PROBLEM", "OTHER",
})
AUTHENTIC_DECISIONS = frozenset({
    "YES_REPRESENTATIVE", "REAL_BUT_NOT_FOR_EFISH", "REGISTER_SPECIFIC",
    "NO_LONGER_REPRESENTATIVE", "UNSURE",
})
GENERIC_FALSE_POSITIVE_DECISIONS = frozenset({
    "ACTUALLY_FITS", "TOO_GENERIC", "TOO_SHORT", "TOO_CASUAL",
    "TOO_POLISHED", "TOO_ASSISTANT_LIKE", "TOO_COLD", "TOO_STRUCTURED",
    "OTHER", "DEPENDS",
})
REGISTER_CLASSIFICATION_DECISIONS = frozenset({
    "CASUAL", "TECHNICAL", "REFLECTIVE", "FORMAL", "PLAYFUL", "MIXED", "DEPENDS",
})
PAIRWISE_DECISIONS = frozenset({
    "PREFER_A", "PREFER_B", "TIE", "NONE", "DEPENDS", "UNSURE", "EDIT",
})
ITEM_KIND_SESSION = {
    "AUTHENTIC_REPRESENTATIVENESS": "SESSION_1",
    "GENERIC_FALSE_POSITIVE": "SESSION_1",
    "REGISTER_CLASSIFICATION": "SESSION_1",
    "SHORTCUT_PAIR": "SESSION_1",
    "REGISTER_BOUNDARY": "SESSION_2",
    "CROCODILE_BOUNDARY": "SESSION_3",
    "REVERSE_CONTROL": "SESSION_4",
}
UTC_TIMESTAMP_RE = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$",
)
PACK_FIELDS = frozenset({
    "schema_version", "campaign_id", "pack_id", "manifest_sha", "status",
    "local_only", "must_remain_ignored", "network_required", "heldout_used",
    "api_requests", "owner_review_completed", "profile_inference_allowed",
    "profile_frozen", "gold_admission", "allowed_for_training", "training_state",
    "audit_status", "review_contract", "sessions", "decision_items",
    "owner_write_prompts", "coverage", "source_summary",
})
TRAINING_STATE_FIELDS = frozenset({
    "training_started", "optimizer_tokens", "classification_updates",
    "assistant_target_tokens", "training_authorized",
})
AUDIT_STATUS_FIELDS = frozenset({
    "pack_receipt_passed", "source_balance_passed", "question_quality_passed",
    "heldout_integrity_passed", "privacy_passed",
})
REVIEW_CONTRACT_FIELDS = frozenset({
    "session_states", "each_session_independently_completable",
    "each_session_independently_exportable", "partial_export_allowed",
    "local_storage_autosave", "depends_requires_condition",
    "none_owner_rewrite_optional", "notes_required_only_for",
    "partial_export_evidence_class", "partial_export_is_training_gold",
    "automatic_profile_inference",
})
SESSION_FIELDS = frozenset({
    "session_id", "order", "title", "purpose", "required", "decision_item_ids",
    "owner_write_prompt_ids", "expected_count", "estimated_minutes_min",
    "estimated_minutes_max", "separately_completable", "separately_exportable",
    "partial_export_filename", "initial_state",
})
DECISION_ITEM_FIELDS = frozenset({
    "item_id", "session_id", "item_kind", "source_kind", "source_pool_refs",
    "manual_theme_refs", "source_family", "context_family", "elicitation_tags",
    "register", "persona_dimension", "failure_type", "context_text",
    "question_text", "candidates", "decision_options",
    "acceptable_alternatives_allowed", "fatigue_question", "reason_options",
    "reason_required_for", "boundary_question", "ownership_question",
    "source_identity_hidden", "model_metadata_hidden", "information_gain",
    "priority_score", "blind_repeat", "repeat_of", "canonical_decision_ref",
    "surface_variant", "crocodile_related", "privacy_review_pass",
    "contains_third_party_identity", "fact_preservation_pass",
    "normative_label_leakage", "heldout_used", "gold_admission",
    "allowed_for_training",
})
CANDIDATE_FIELDS = frozenset({
    "option_id", "response_text", "mechanism", "canonical_option_ref",
    "factually_compatible",
})
DECISION_OPTION_FIELDS = frozenset({"value", "label"})
FATIGUE_FIELDS = frozenset({"question", "options"})
INFORMATION_GAIN_FIELDS = frozenset({
    "model_confidence", "model_error_severity", "shortcut_suspicion",
    "persona_uncertainty", "register_boundary", "historical_evidence_conflict",
    "potential_training_value",
})
OWNER_WRITE_FIELDS = frozenset({
    "prompt_id", "session_id", "source_kind", "source_pool_refs", "source_family",
    "context_family", "register", "persona_dimension", "elicitation_category", "prompt_text",
    "instruction", "candidate_answers_shown", "minimum_characters",
    "privacy_review_required", "heldout_used", "gold_admission",
    "allowed_for_training", "privacy_review_pass", "contains_third_party_identity",
})
COVERAGE_FIELDS = frozenset({
    "decision_item_count", "owner_write_prompt_count", "blind_repeat_count",
    "blind_repeat_rate", "crocodile_related_count", "crocodile_related_rate",
    "fatigue_followup_count", "manual_correction_theme_count",
})
SOURCE_SUMMARY_FIELDS = frozenset({
    "j1a_dev_error_count", "j1a_shortcut_count", "p2_hypothesis_count",
    "p2_contradiction_count", "manual_owner_evidence_count",
    "public_safe_synthetic_count", "distinct_source_family_count",
})
CORRECTION_RECORD_FIELDS = frozenset({
    "schema_version", "status", "item_id", "session_id", "context_family",
    "owner_decision", "owner_condition", "owner_note", "owner_written_response",
    "acceptable_alternatives", "fatigue_decision", "reason_codes",
    "normative_strength", "register", "persona_dimension", "source_family",
    "boundary_question", "review_hash", "completed_at", "evidence_class",
    "privacy_review_status", "metadata_reconciliation_status",
    "profile_inference_allowed", "gold_admission",
    "allowed_for_training", "training_started",
})
PARTIAL_EXPORT_FIELDS = frozenset({
    "schema_version", "pack_id", "session_id", "manifest_sha", "session_state",
    "completed_items", "total_items", "records", "review_hash", "completed_at",
    "evidence_class", "owner_review_completed", "profile_inference_allowed",
    "profile_frozen", "gold_admission", "allowed_for_training", "training_started",
})


class ContractError(ValueError):
    """A bounded, content-free validation error."""


def _fail(code: str) -> None:
    raise ContractError(code)


def _require(condition: bool, code: str) -> None:
    if not condition:
        _fail(code)


def _exact_keys(value: Mapping[str, Any], expected: frozenset[str], code: str) -> None:
    _require(set(value) == expected, code)


def _opaque(value: Any, code: str) -> None:
    _require(isinstance(value, str) and OPAQUE_REF_RE.fullmatch(value) is not None, code)


def _safe_code(value: Any, code: str) -> None:
    _require(isinstance(value, str) and SAFE_CODE_RE.fullmatch(value) is not None, code)


def _reject_private_paths(value: Any) -> None:
    if isinstance(value, str):
        _require(PRIVATE_PATH_RE.search(value) is None, "machine_private_path")
    elif isinstance(value, Mapping):
        for key, nested in value.items():
            _reject_private_paths(key)
            _reject_private_paths(nested)
    elif isinstance(value, list):
        for nested in value:
            _reject_private_paths(nested)


def _nonblank(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _bounded_text(value: Any, maximum: int, code: str, *, blank_allowed: bool = True) -> None:
    _require(isinstance(value, str) and len(value) <= maximum, code)
    if not blank_allowed:
        _require(bool(value.strip()), code)


def canonical_review_hash(value: Mapping[str, Any]) -> str:
    """Hash the exact canonical JSON form shared with the offline browser UI."""

    material = dict(value)
    material["review_hash"] = None
    encoded = json.dumps(
        material,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def canonical_pack_manifest_sha(pack: Mapping[str, Any]) -> str:
    """Bind one populated pack identity to every stimulus and control field."""

    material = dict(pack)
    material["manifest_sha"] = None
    encoded = json.dumps(
        material,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _unique(values: Iterable[Any]) -> bool:
    materialized = list(values)
    return len(materialized) == len(set(materialized))


def _ratio(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator else 0.0


def _all_false_training_state(value: Mapping[str, Any]) -> bool:
    return (
        value.get("training_started") is False
        and _is_exact_zero(value.get("optimizer_tokens"))
        and _is_exact_zero(value.get("classification_updates"))
        and _is_exact_zero(value.get("assistant_target_tokens"))
        and value.get("training_authorized") is False
    )


def _is_exact_zero(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value == 0


def _display_text_values(item: Mapping[str, Any]) -> Iterable[str]:
    yield str(item.get("context_text", ""))
    yield str(item.get("question_text", ""))
    for candidate in item.get("candidates", []):
        if isinstance(candidate, Mapping):
            yield str(candidate.get("response_text", ""))
    for key in ("decision_options", "reason_options"):
        for option in item.get(key, []):
            if isinstance(option, Mapping):
                yield str(option.get("label", ""))
    fatigue = item.get("fatigue_question")
    if isinstance(fatigue, Mapping):
        yield str(fatigue.get("question", ""))
        for option in fatigue.get("options", []):
            if isinstance(option, Mapping):
                yield str(option.get("label", ""))


def _validate_blinded_display_text(values: Iterable[str], *, allow_authenticity: bool) -> None:
    materialized = list(values)
    _require(
        all(HARD_DISPLAY_PROVENANCE_RE.search(value) is None for value in materialized),
        "display_provenance_leak",
    )
    if not allow_authenticity:
        _require(
            all(AUTHENTICITY_DISCLOSURE_RE.search(value) is None for value in materialized),
            "display_authenticity_leak",
        )


def _validate_global_safety(pack: Mapping[str, Any]) -> None:
    _require(pack.get("local_only") is True, "pack_not_local_only")
    _require(pack.get("must_remain_ignored") is True, "pack_not_ignored")
    _require(pack.get("network_required") is False, "network_boundary")
    _require(pack.get("heldout_used") is False, "heldout_opened")
    _require(_is_exact_zero(pack.get("api_requests")), "api_request_nonzero")
    _require(pack.get("owner_review_completed") is False, "review_completion_claim")
    _require(pack.get("profile_inference_allowed") is False, "profile_inference_enabled")
    _require(pack.get("profile_frozen") is False, "profile_frozen")
    _require(pack.get("gold_admission") is False, "gold_admitted")
    _require(pack.get("allowed_for_training") is False, "training_material_enabled")
    state = pack.get("training_state")
    _require(isinstance(state, Mapping) and _all_false_training_state(state), "training_state_nonzero")
    _exact_keys(state, TRAINING_STATE_FIELDS, "training_state_fields")


def validate_pack(pack: Mapping[str, Any]) -> None:
    """Validate one empty public template or one populated ignored pack."""

    _exact_keys(pack, PACK_FIELDS, "pack_fields")
    _reject_private_paths(pack)
    _require(pack.get("schema_version") == SCHEMA_VERSION, "schema_version")
    _require(pack.get("campaign_id") == CAMPAIGN_ID, "campaign_id")
    _validate_global_safety(pack)

    status = pack.get("status")
    _require(status in {"EMPTY_TEMPLATE", "OWNER_CORRECTION_IN_PROGRESS"}, "status")
    sessions = pack.get("sessions")
    items = pack.get("decision_items")
    prompts = pack.get("owner_write_prompts")
    _require(isinstance(sessions, list), "sessions_type")
    _require(isinstance(items, list), "decision_items_type")
    _require(isinstance(prompts, list), "owner_write_prompts_type")

    review = pack.get("review_contract")
    _require(isinstance(review, Mapping), "review_contract_type")
    _exact_keys(review, REVIEW_CONTRACT_FIELDS, "review_contract_fields")
    _require(review.get("session_states") == list(SESSION_STATES), "session_states")
    for key in (
        "each_session_independently_completable",
        "each_session_independently_exportable",
        "partial_export_allowed",
        "local_storage_autosave",
        "depends_requires_condition",
        "none_owner_rewrite_optional",
    ):
        _require(review.get(key) is True, f"review_contract_{key}")
    _require(review.get("notes_required_only_for") == ["BOUNDARY_ITEM", "DEPENDS", "NONE", "EDIT"], "note_contract")
    _require(review.get("partial_export_evidence_class") == "OWNER_CORRECTION_EVIDENCE", "partial_evidence_class")
    _require(review.get("partial_export_is_training_gold") is False, "partial_is_gold")
    _require(review.get("automatic_profile_inference") is False, "automatic_profile_inference")

    audits = pack.get("audit_status")
    _require(isinstance(audits, Mapping), "audit_status_type")
    _exact_keys(audits, AUDIT_STATUS_FIELDS, "audit_status_fields")
    coverage = pack.get("coverage")
    summary = pack.get("source_summary")
    _require(isinstance(coverage, Mapping), "coverage_type")
    _require(isinstance(summary, Mapping), "source_summary_type")
    _exact_keys(coverage, COVERAGE_FIELDS, "coverage_fields")
    _exact_keys(summary, SOURCE_SUMMARY_FIELDS, "source_summary_fields")

    if status == "EMPTY_TEMPLATE":
        _require(pack.get("pack_id") is None and pack.get("manifest_sha") is None, "empty_identifiers")
        _require(not sessions and not items and not prompts, "empty_template_populated")
        _require(all(audits.get(key) is False for key in AUDIT_STATUS_FIELDS), "empty_audit_status")
        for key in COVERAGE_FIELDS:
            value = coverage.get(key)
            if key.endswith("_rate"):
                _require(
                    isinstance(value, (int, float)) and not isinstance(value, bool)
                    and math.isfinite(float(value)) and value == 0,
                    f"empty_coverage_{key}",
                )
            else:
                _require(_is_exact_zero(value), f"empty_coverage_{key}")
        _require(all(_is_exact_zero(summary.get(key)) for key in SOURCE_SUMMARY_FIELDS), "empty_source_summary")
        return

    _require(bool(PACK_ID_RE.fullmatch(str(pack.get("pack_id", "")))), "pack_id")
    _require(bool(SHA256_RE.fullmatch(str(pack.get("manifest_sha", "")))), "manifest_sha")
    _require(pack.get("manifest_sha") == canonical_pack_manifest_sha(pack), "manifest_sha_mismatch")
    _require(all(audits.get(key) is True for key in AUDIT_STATUS_FIELDS), "required_audit_not_passed")

    _require(len(sessions) == 5, "session_count")
    _require([session.get("session_id") for session in sessions] == list(SESSION_IDS), "session_order")
    _require([session.get("order") for session in sessions] == [1, 2, 3, 4, 5], "session_ordinals")
    _require(60 <= len(items) <= 64, "decision_budget")
    _require(12 <= len(prompts) <= 18, "write_prompt_budget")

    item_ids = [item.get("item_id") for item in items]
    prompt_ids = [prompt.get("prompt_id") for prompt in prompts]
    _require(_unique(item_ids), "duplicate_item_id")
    _require(_unique(prompt_ids), "duplicate_prompt_id")
    item_by_id = {item["item_id"]: item for item in items}

    session_items: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for item in items:
        validate_decision_item(item)
        session_items[item["session_id"]].append(item)
    session_prompts: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for prompt in prompts:
        validate_owner_write_prompt(prompt)
        session_prompts[prompt["session_id"]].append(prompt)

    for session in sessions:
        _require(isinstance(session, Mapping), "session_type")
        _exact_keys(session, SESSION_FIELDS, "session_fields")
        session_id = session["session_id"]
        for key in ("order", "expected_count", "estimated_minutes_min", "estimated_minutes_max"):
            _require(isinstance(session.get(key), int) and not isinstance(session.get(key), bool), f"session_{key}_type")
        _require(1 <= session["order"] <= 5, "session_order_range")
        _require(0 <= session["expected_count"] <= 64, "session_expected_count_range")
        _require(1 <= session["estimated_minutes_min"] <= 25, "session_time_min_range")
        _require(1 <= session["estimated_minutes_max"] <= 30, "session_time_max_range")
        _require(session.get("separately_completable") is True, "session_not_independent")
        _require(session.get("separately_exportable") is True, "session_not_exportable")
        _require(session.get("initial_state") == "NOT_STARTED", "session_initial_state")
        _bounded_text(session.get("title"), 6000, "session_title", blank_allowed=False)
        _bounded_text(session.get("purpose"), 6000, "session_purpose", blank_allowed=False)
        _validate_blinded_display_text(
            (str(session["title"]), str(session["purpose"])), allow_authenticity=False,
        )
        _require(session.get("partial_export_filename") == f"r30j1c_session{session['order']}_review.json", "session_export_filename")
        declared_items = session.get("decision_item_ids")
        declared_prompts = session.get("owner_write_prompt_ids")
        _require(isinstance(declared_items, list) and _unique(declared_items), "session_item_refs")
        _require(isinstance(declared_prompts, list) and _unique(declared_prompts), "session_prompt_refs")
        _require(set(declared_items) == {item["item_id"] for item in session_items[session_id]}, "session_item_membership")
        _require(set(declared_prompts) == {prompt["prompt_id"] for prompt in session_prompts[session_id]}, "session_prompt_membership")
        _require(session.get("expected_count") == len(declared_items) + len(declared_prompts), "session_expected_count")
        _require(session.get("estimated_minutes_min", 0) <= session.get("estimated_minutes_max", -1), "session_time_range")
        if session_id in DECISION_RANGES:
            low, high = DECISION_RANGES[session_id]
            _require(low <= len(declared_items) <= high and not declared_prompts, "session_decision_budget")
            _require(session.get("required") is True, "required_session_optional")
        else:
            _require(not declared_items and 12 <= len(declared_prompts) <= 18, "session5_shape")
            _require(session.get("required") is False, "session5_not_optional")

    _validate_session_content(session_items)
    _validate_owner_write_distribution(prompts)
    _validate_repeat_contract(items, item_by_id)
    _validate_coverage(pack, items, prompts)
    _validate_source_summary(pack, items, prompts)


def validate_decision_item(item: Mapping[str, Any]) -> None:
    """Validate one review decision without reading or logging its private text."""

    _exact_keys(item, DECISION_ITEM_FIELDS, "decision_item_fields")
    _require(isinstance(item.get("item_id"), str) and ITEM_ID_RE.fullmatch(item["item_id"]) is not None, "decision_item_id")
    _require(item.get("session_id") in DECISION_RANGES, "decision_session")
    kind = item.get("item_kind")
    _require(kind in ITEM_KIND_SESSION, "decision_item_kind")
    _require(item.get("session_id") == ITEM_KIND_SESSION[kind], "decision_item_kind_session")
    _require(item.get("source_kind") in SOURCE_KINDS, "source_kind")
    if kind == "SHORTCUT_PAIR":
        _require(item.get("source_kind") == "J1A_SHORTCUT", "shortcut_source_kind")
    elif item.get("session_id") == "SESSION_1":
        _require(item.get("source_kind") == "J1A_DEV_ERROR", "session1_error_source_kind")
    else:
        _require(
            item.get("source_kind") not in {"J1A_DEV_ERROR", "J1A_SHORTCUT"},
            "j1a_source_outside_session1",
        )
    _require(item.get("heldout_used") is False, "decision_heldout")
    _require(item.get("gold_admission") is False, "decision_gold")
    _require(item.get("allowed_for_training") is False, "decision_training")
    _require(item.get("privacy_review_pass") is True, "decision_privacy")
    _require(item.get("contains_third_party_identity") is False, "third_party_identity")
    _require(item.get("fact_preservation_pass") is True, "fact_preservation")
    _require(item.get("normative_label_leakage") is False, "normative_label_leakage")
    _require(item.get("model_metadata_hidden") is True, "model_metadata_visible")
    for key in (
        "acceptable_alternatives_allowed", "boundary_question", "ownership_question",
        "source_identity_hidden", "model_metadata_hidden", "blind_repeat",
        "crocodile_related", "privacy_review_pass", "contains_third_party_identity",
        "fact_preservation_pass", "normative_label_leakage", "heldout_used",
        "gold_admission", "allowed_for_training",
    ):
        _require(isinstance(item.get(key), bool), f"decision_boolean_type:{key}")
    _bounded_text(item.get("context_text"), 6000, "display_context_text", blank_allowed=False)
    _bounded_text(item.get("question_text"), 6000, "display_question_text", blank_allowed=False)
    source_refs = item.get("source_pool_refs")
    _require(isinstance(source_refs, list) and 1 <= len(source_refs) <= 8 and _unique(source_refs), "source_pool_refs")
    for value in source_refs:
        _opaque(value, "source_pool_ref_format")
    manual_refs = item.get("manual_theme_refs")
    _require(isinstance(manual_refs, list) and len(manual_refs) <= 9 and _unique(manual_refs), "manual_theme_refs")
    for value in manual_refs:
        _opaque(value, "manual_theme_ref_format")
    if item.get("source_kind") == "MANUAL_OWNER_EVIDENCE":
        _require(bool(item["manual_theme_refs"]), "manual_theme_refs_missing")
    else:
        _require(not item["manual_theme_refs"], "manual_theme_refs_wrong_source")
    _opaque(item.get("source_family"), "source_family_format")
    _opaque(item.get("canonical_decision_ref"), "canonical_decision_ref_format")
    _safe_code(item.get("context_family"), "context_family_format")
    _safe_code(item.get("failure_type"), "failure_type_format")
    tags = item.get("elicitation_tags")
    _require(isinstance(tags, list) and 1 <= len(tags) <= 12 and _unique(tags), "elicitation_tags")
    for value in tags:
        _safe_code(value, "elicitation_tag_format")
    _require(item.get("register") in REGISTER_CODES, "decision_register")
    if item.get("persona_dimension") is not None:
        _safe_code(item.get("persona_dimension"), "persona_dimension_format")
    displayed_text = list(_display_text_values(item))
    _validate_blinded_display_text(
        displayed_text, allow_authenticity=item.get("ownership_question") is True,
    )
    if item.get("source_identity_hidden") is False:
        _require(item.get("ownership_question") is True, "source_identity_leak")
    expected_ownership = kind == "AUTHENTIC_REPRESENTATIVENESS"
    _require(item.get("ownership_question") is expected_ownership, "ownership_question_scope")
    _require(item.get("source_identity_hidden") is (not expected_ownership), "source_identity_scope")

    candidates = item.get("candidates")
    _require(isinstance(candidates, list) and len(candidates) <= 3, "candidates")
    for candidate in candidates:
        _require(isinstance(candidate, Mapping), "candidate_type")
        _exact_keys(candidate, CANDIDATE_FIELDS, "candidate_fields")
        _require(candidate.get("option_id") in {"A", "B", "C"}, "candidate_option_id")
        _opaque(candidate.get("canonical_option_ref"), "candidate_canonical_ref")
        if candidate.get("mechanism") is not None:
            _safe_code(candidate.get("mechanism"), "candidate_mechanism")
    candidate_ids = [candidate.get("option_id") for candidate in candidates]
    _require(_unique(candidate_ids), "candidate_ids")
    if kind in {
        "AUTHENTIC_REPRESENTATIVENESS", "GENERIC_FALSE_POSITIVE", "REGISTER_CLASSIFICATION",
    }:
        _require(not candidates, "noncomparison_candidates_forbidden")
    elif kind == "SHORTCUT_PAIR":
        _require(len(candidates) == 2 and set(candidate_ids) == {"A", "B"}, "shortcut_candidate_shape")
    else:
        _require(2 <= len(candidates) <= 3, "comparison_candidate_shape")
        _require(set(candidate_ids) == set(("A", "B", "C")[:len(candidates)]), "comparison_candidate_ids")
    for candidate in candidates:
        _require(candidate.get("factually_compatible") is True, "candidate_fact_mismatch")
        _bounded_text(candidate.get("response_text"), 6000, "candidate_blank", blank_allowed=False)

    decision_options = item.get("decision_options")
    _require(isinstance(decision_options, list) and 2 <= len(decision_options) <= 12, "decision_options")
    for option in decision_options:
        _require(isinstance(option, Mapping), "decision_option_type")
        _exact_keys(option, DECISION_OPTION_FIELDS, "decision_option_fields")
    decision_values = [option.get("value") for option in decision_options]
    _require(_unique(decision_values), "decision_option_values")
    _require(all(value in OWNER_DECISION_CODES - {"OWNER_WRITTEN"} for value in decision_values), "decision_option_code")
    _require(all(isinstance(option.get("label"), str) and 0 < len(option["label"].strip()) <= 6000 for option in decision_options), "decision_option_label")
    expected_decisions = {
        "AUTHENTIC_REPRESENTATIVENESS": AUTHENTIC_DECISIONS,
        "GENERIC_FALSE_POSITIVE": GENERIC_FALSE_POSITIVE_DECISIONS,
        "REGISTER_CLASSIFICATION": REGISTER_CLASSIFICATION_DECISIONS,
    }.get(kind, PAIRWISE_DECISIONS | ({"PREFER_C"} if len(candidates) == 3 else set()))
    _require(set(decision_values) == set(expected_decisions), "decision_options_wrong_for_item_kind")
    reason_options = item.get("reason_options")
    reason_required = item.get("reason_required_for")
    _require(isinstance(reason_options, list) and isinstance(reason_required, list), "reason_contract")
    for option in reason_options:
        _require(isinstance(option, Mapping), "reason_option_type")
        _exact_keys(option, DECISION_OPTION_FIELDS, "reason_option_fields")
        _require(option.get("value") in REASON_CODES, "reason_option_code")
        _bounded_text(option.get("label"), 6000, "reason_option_label", blank_allowed=False)
    reason_values = [option.get("value") for option in reason_options]
    _require(_unique(reason_values), "reason_option_values")
    _require(_unique(reason_required), "reason_required_duplicates")
    _require(set(reason_required).issubset(set(decision_values)), "reason_required_unknown_decision")
    _require(not reason_required or bool(reason_options), "reason_options_missing")
    if kind == "REVERSE_CONTROL":
        _require(set(reason_values) == set(REASON_CODES), "reverse_reason_options_incomplete")
        _require(bool(reason_required), "reverse_reason_required_missing")
    else:
        _require(not reason_options and not reason_required, "reason_contract_wrong_item_kind")

    fatigue = item.get("fatigue_question")
    if fatigue is not None:
        _require(isinstance(fatigue, Mapping), "fatigue_type")
        _exact_keys(fatigue, FATIGUE_FIELDS, "fatigue_fields")
        _require(item.get("session_id") == "SESSION_3", "fatigue_wrong_session")
        _require(_nonblank(fatigue.get("question")), "fatigue_question_blank")
        _require(3 <= len(fatigue.get("options", [])) <= 5, "fatigue_options")
        for option in fatigue["options"]:
            _require(isinstance(option, Mapping), "fatigue_option_type")
            _exact_keys(option, DECISION_OPTION_FIELDS, "fatigue_option_fields")
            _require(option.get("value") in FATIGUE_DECISION_CODES, "fatigue_option_code")
            _bounded_text(option.get("label"), 6000, "fatigue_option_label", blank_allowed=False)
        _require(_unique(option.get("value") for option in fatigue["options"]), "fatigue_option_values")

    info = item.get("information_gain")
    _require(isinstance(info, Mapping), "information_gain")
    _exact_keys(info, INFORMATION_GAIN_FIELDS, "information_gain_components")
    _require(all(isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1 for value in info.values()), "information_gain_range")
    _require(
        isinstance(item.get("priority_score"), (int, float))
        and not isinstance(item.get("priority_score"), bool)
        and math.isfinite(float(item["priority_score"]))
        and 0 <= item["priority_score"] <= 1,
        "priority_score",
    )
    _require(
        isinstance(item.get("surface_variant"), int)
        and not isinstance(item.get("surface_variant"), bool)
        and 0 <= item["surface_variant"] <= 9,
        "surface_variant",
    )

    repeat_of = item.get("repeat_of")
    if item.get("blind_repeat") is True:
        _require(isinstance(repeat_of, str), "repeat_source_missing")
        _require(item.get("surface_variant", 0) > 0, "repeat_surface_variant")
    else:
        _require(repeat_of is None and item.get("surface_variant") == 0, "nonrepeat_metadata")


def validate_owner_write_prompt(prompt: Mapping[str, Any]) -> None:
    _exact_keys(prompt, OWNER_WRITE_FIELDS, "owner_write_fields")
    _require(isinstance(prompt.get("prompt_id"), str) and WRITE_ID_RE.fullmatch(prompt["prompt_id"]) is not None, "write_prompt_id")
    _require(prompt.get("session_id") == "SESSION_5", "write_prompt_session")
    _require(prompt.get("source_kind") in SOURCE_KINDS, "write_source_kind")
    refs = prompt.get("source_pool_refs")
    _require(isinstance(refs, list) and len(refs) <= 8 and _unique(refs), "write_source_refs")
    for value in refs:
        _opaque(value, "write_source_ref_format")
    _opaque(prompt.get("source_family"), "write_source_family_format")
    _safe_code(prompt.get("context_family"), "write_context_family_format")
    _require(prompt.get("register") in REGISTER_CODES, "write_register")
    _require(prompt.get("elicitation_category") in OWNER_WRITE_CATEGORIES, "write_elicitation_category")
    if prompt.get("persona_dimension") is not None:
        _safe_code(prompt.get("persona_dimension"), "write_persona_dimension_format")
    _bounded_text(prompt.get("prompt_text"), 6000, "write_prompt_blank", blank_allowed=False)
    _require(prompt.get("instruction") == "一句话就够也可以。", "write_instruction")
    _validate_blinded_display_text(
        (str(prompt["prompt_text"]), str(prompt["instruction"])), allow_authenticity=False,
    )
    _require(prompt.get("candidate_answers_shown") is False, "write_prompt_primed")
    _require(_is_exact_zero(prompt.get("minimum_characters")), "write_minimum_length")
    _require(prompt.get("privacy_review_required") is True, "write_privacy_review")
    _require(prompt.get("privacy_review_pass") is True, "write_prompt_privacy")
    _require(prompt.get("contains_third_party_identity") is False, "write_prompt_third_party_identity")
    _require(prompt.get("heldout_used") is False, "write_heldout")
    _require(prompt.get("gold_admission") is False, "write_gold")
    _require(prompt.get("allowed_for_training") is False, "write_training")


def _validate_session_content(session_items: Mapping[str, list[Mapping[str, Any]]]) -> None:
    session1 = Counter(item["item_kind"] for item in session_items["SESSION_1"])
    _require(5 <= session1["AUTHENTIC_REPRESENTATIVENESS"] <= 6, "session1_authentic_count")
    _require(5 <= session1["GENERIC_FALSE_POSITIVE"] <= 6, "session1_generic_count")
    _require(session1["REGISTER_CLASSIFICATION"] == 4, "session1_register_count")
    _require(2 <= session1["SHORTCUT_PAIR"] <= 4, "session1_shortcut_count")
    _require(sum(session1.values()) == len(session_items["SESSION_1"]), "session1_unknown_kind")

    _require(all(item["item_kind"] == "REGISTER_BOUNDARY" for item in session_items["SESSION_2"]), "session2_kind")
    _require(all(item["item_kind"] == "CROCODILE_BOUNDARY" for item in session_items["SESSION_3"]), "session3_kind")
    _require(all(item["item_kind"] == "REVERSE_CONTROL" for item in session_items["SESSION_4"]), "session4_kind")
    session2_registers = Counter(item["register"] for item in session_items["SESSION_2"])
    for register in ("CASUAL", "TECHNICAL", "REFLECTIVE"):
        _require(2 <= session2_registers[register] <= 4, f"session2_{register.lower()}_distribution")
    for register in ("LIGHT_EMOTIONAL", "PROJECT_DESIGN"):
        _require(1 <= session2_registers[register] <= 3, f"session2_{register.lower()}_distribution")
    _require(
        1 <= session2_registers["AMBIGUOUS"] + session2_registers["MIXED"] <= 3,
        "session2_crossover_distribution",
    )
    _require(
        sum(session2_registers[value] for value in {
            "CASUAL", "TECHNICAL", "REFLECTIVE", "LIGHT_EMOTIONAL",
            "PROJECT_DESIGN", "AMBIGUOUS", "MIXED",
        }) == len(session_items["SESSION_2"]),
        "session2_unplanned_register",
    )
    _require(sum(item.get("fatigue_question") is not None for item in session_items["SESSION_3"]) >= 3, "fatigue_followup_floor")
    manual_session3 = sum(item["source_kind"] == "MANUAL_OWNER_EVIDENCE" for item in session_items["SESSION_3"])
    _require(1 <= manual_session3 <= 6, "manual_theme_compression")
    manual_theme_refs = {
        reference
        for item in session_items["SESSION_3"]
        if item["source_kind"] == "MANUAL_OWNER_EVIDENCE"
        for reference in item["manual_theme_refs"]
    }
    _require(len(manual_theme_refs) == 9, "manual_theme_coverage")

    required_session2 = {
        "relationship.complete_vs_minimal",
        "relationship.direct_vs_exploratory",
        "relationship.serious_vs_playful",
        "relationship.solution_vs_acknowledgement",
        "relationship.closed_vs_open",
        "relationship.precision_vs_compression",
    }
    required_session3 = {
        "croc_context.harmless_absurd",
        "croc_context.meta_ai",
        "croc_context.normal_factual",
        "croc_context.technical",
        "croc_context.serious_personal",
        "croc_context.playful_conversation",
        "croc_context.already_serious",
        "croc_context.explicit_roleplay",
        "croc_context.no_roleplay",
        "croc_context.one_off",
        "croc_context.repeated_use",
    }
    required_session4 = {
        "reverse.too_short",
        "reverse.too_deadpan",
        "reverse.too_crocodile",
        "reverse.too_casual",
        "reverse.too_vague",
        "reverse.too_quirky",
        "reverse.too_anti_helpful",
        "reverse.too_incomplete",
        "reverse.too_provocative",
        "reverse.too_playful",
        "reverse.too_emotionally_detached",
        "reverse.too_self_referential",
    }
    for session_id, required in (
        ("SESSION_2", required_session2),
        ("SESSION_3", required_session3),
        ("SESSION_4", required_session4),
    ):
        observed = {tag for item in session_items[session_id] for tag in item["elicitation_tags"]}
        _require(required.issubset(observed), f"{session_id.lower()}_required_coverage")


def _validate_owner_write_distribution(prompts: list[Mapping[str, Any]]) -> None:
    counts = Counter(prompt["elicitation_category"] for prompt in prompts)
    required = {
        "ORDINARY_CHAT": 2,
        "WEIRD_ABSURD": 2,
        "META_AI": 2,
        "TECHNICAL": 2,
        "PHILOSOPHY_REFLECTIVE": 2,
        "LIGHT_EMOTIONAL": 1,
        "PROJECT_DESIGN": 1,
        "PLAYFUL": 1,
        "AMBIGUOUS": 1,
    }
    _require(all(counts[key] >= minimum for key, minimum in required.items()), "owner_write_distribution")
    _require(sum(counts.values()) == len(prompts), "owner_write_unknown_category")


def _validate_repeat_contract(items: list[Mapping[str, Any]], item_by_id: Mapping[str, Mapping[str, Any]]) -> None:
    repeats = [item for item in items if item["blind_repeat"]]
    _require(5 <= len(repeats) <= 6, "blind_repeat_count")
    repeat_rate = _ratio(len(repeats), len(items))
    _require(0.08 <= repeat_rate <= 0.10, "blind_repeat_rate")
    _require(_unique(item["repeat_of"] for item in repeats), "duplicate_repeat_source")
    for repeat in repeats:
        source = item_by_id.get(repeat["repeat_of"])
        _require(source is not None and source.get("blind_repeat") is False, "repeat_source_invalid")
        _require(source.get("canonical_decision_ref") == repeat.get("canonical_decision_ref"), "repeat_semantic_ref")
        _require(source.get("context_family") == repeat.get("context_family"), "repeat_context_family")
        _require(source.get("question_text") != repeat.get("question_text"), "repeat_exact_text")
        source_order = [candidate["canonical_option_ref"] for candidate in source.get("candidates", [])]
        repeat_order = [candidate["canonical_option_ref"] for candidate in repeat.get("candidates", [])]
        if len(source_order) > 1:
            _require(source_order != repeat_order, "repeat_candidate_order")


def _validate_coverage(pack: Mapping[str, Any], items: list[Mapping[str, Any]], prompts: list[Mapping[str, Any]]) -> None:
    coverage = pack.get("coverage")
    _require(isinstance(coverage, Mapping), "coverage_type")
    _exact_keys(coverage, COVERAGE_FIELDS, "coverage_fields")
    blind = sum(item["blind_repeat"] for item in items)
    croc = sum(item["crocodile_related"] for item in items)
    fatigue = sum(item["fatigue_question"] is not None for item in items)
    manual_themes = len({
        reference
        for item in items
        if item["source_kind"] == "MANUAL_OWNER_EVIDENCE"
        for reference in item["manual_theme_refs"]
    })
    expected = {
        "decision_item_count": len(items),
        "owner_write_prompt_count": len(prompts),
        "blind_repeat_count": blind,
        "blind_repeat_rate": _ratio(blind, len(items)),
        "crocodile_related_count": croc,
        "crocodile_related_rate": _ratio(croc, len(items)),
        "fatigue_followup_count": fatigue,
        "manual_correction_theme_count": manual_themes,
    }
    for key, value in expected.items():
        actual = coverage.get(key)
        if isinstance(value, float):
            _require(
                isinstance(actual, (int, float)) and not isinstance(actual, bool)
                and math.isfinite(float(actual))
                and math.isclose(actual, value, rel_tol=0, abs_tol=1e-12),
                f"coverage_{key}",
            )
        else:
            _require(
                isinstance(actual, int) and not isinstance(actual, bool) and actual == value,
                f"coverage_{key}",
            )
    _require(0.15 <= expected["crocodile_related_rate"] <= 0.20, "crocodile_frequency_cap")


def _validate_source_summary(pack: Mapping[str, Any], items: list[Mapping[str, Any]], prompts: list[Mapping[str, Any]]) -> None:
    summary = pack.get("source_summary")
    _require(isinstance(summary, Mapping), "source_summary_type")
    _exact_keys(summary, SOURCE_SUMMARY_FIELDS, "source_summary_fields")
    counts = Counter(item["source_kind"] for item in items)
    expected = {
        "j1a_dev_error_count": counts["J1A_DEV_ERROR"],
        "j1a_shortcut_count": counts["J1A_SHORTCUT"],
        "p2_hypothesis_count": counts["P2_HYPOTHESIS"],
        "p2_contradiction_count": counts["P2_CONTRADICTION"],
        "manual_owner_evidence_count": counts["MANUAL_OWNER_EVIDENCE"],
        "public_safe_synthetic_count": counts["PUBLIC_SAFE_SYNTHETIC"],
        "distinct_source_family_count": len({value["source_family"] for value in [*items, *prompts]}),
    }
    _require(
        all(
            isinstance(summary.get(key), int) and not isinstance(summary.get(key), bool)
            and summary.get(key) == value
            for key, value in expected.items()
        ),
        "source_summary_mismatch",
    )
    _require(counts["J1A_DEV_ERROR"] > 0, "no_real_j1a_error")
    _require(counts["MANUAL_OWNER_EVIDENCE"] > 0, "no_manual_owner_evidence")
    _require(counts["P2_HYPOTHESIS"] + counts["P2_CONTRADICTION"] > 0, "no_p2_evidence")


def derive_normative_strength(owner_decision: str) -> str:
    if owner_decision == "OWNER_WRITTEN":
        return "OWNER_WRITTEN_PENDING_PRIVACY_REVIEW"
    if owner_decision in {"DEPENDS", "REGISTER_SPECIFIC"}:
        return "CONDITIONAL_NORMATIVE_EVIDENCE"
    if owner_decision == "UNSURE":
        return "UNRESOLVED"
    return "EXPLICIT_NORMATIVE_CHOICE"


def validate_correction_record(record: Mapping[str, Any], item: Mapping[str, Any] | None = None) -> None:
    _exact_keys(record, CORRECTION_RECORD_FIELDS, "record_fields")
    _require(record.get("schema_version") == RECORD_SCHEMA_VERSION, "record_schema_version")
    status = record.get("status")
    _require(status in {"EMPTY_TEMPLATE", "OWNER_CORRECTION_EVIDENCE"}, "record_status")
    _require(record.get("profile_inference_allowed") is False, "record_profile_inference")
    _require(record.get("gold_admission") is False, "record_gold")
    _require(record.get("allowed_for_training") is False, "record_training")
    _require(record.get("training_started") is False, "record_training_started")
    if status == "EMPTY_TEMPLATE":
        expected_empty = {
            "item_id": None, "session_id": None, "context_family": None,
            "owner_decision": None, "owner_condition": "", "owner_note": "",
            "owner_written_response": "", "acceptable_alternatives": [],
            "fatigue_decision": None, "reason_codes": [],
            "normative_strength": "UNRESOLVED", "register": None,
            "persona_dimension": None, "source_family": None,
            "boundary_question": False, "review_hash": None,
            "completed_at": None, "evidence_class": "UNREVIEWED",
            "privacy_review_status": "NOT_APPLICABLE",
            "metadata_reconciliation_status": "NOT_APPLICABLE",
        }
        _require(all(record.get(key) == value for key, value in expected_empty.items()), "empty_record_populated")
        return

    decision = record.get("owner_decision")
    session_id = record.get("session_id")
    item_id = record.get("item_id")
    _require(isinstance(item_id, str) and session_id in SESSION_IDS, "record_identity")
    if session_id == "SESSION_5":
        _require(WRITE_ID_RE.fullmatch(item_id) is not None, "record_identity_session")
    else:
        _require(
            ITEM_ID_RE.fullmatch(item_id) is not None
            and item_id.startswith(f"R30J1C-S{session_id[-1]}-"),
            "record_identity_session",
        )
    # Browser exports are deliberately provenance-blind.  These fields stay
    # present but null until a later reconciliation joins the trusted private
    # pack by item_id.  Populated metadata, when supplied, must remain bounded.
    if record.get("context_family") is not None:
        _safe_code(record.get("context_family"), "record_context_family")
    if record.get("register") is not None:
        _require(record.get("register") in REGISTER_CODES, "record_register")
    if record.get("persona_dimension") is not None:
        _safe_code(record.get("persona_dimension"), "record_persona_dimension")
    if record.get("source_family") is not None:
        _opaque(record.get("source_family"), "record_source_family")
    _require(decision in OWNER_DECISION_CODES, "record_decision")
    for key, maximum in (("owner_condition", 10000), ("owner_note", 10000), ("owner_written_response", 20000)):
        _bounded_text(record.get(key), maximum, f"record_{key}_length")
    _require(
        isinstance(record.get("completed_at"), str)
        and UTC_TIMESTAMP_RE.fullmatch(record["completed_at"]) is not None,
        "record_completed_at",
    )
    _require(record.get("evidence_class") == "OWNER_CORRECTION_EVIDENCE", "record_evidence_class")
    _require(record.get("normative_strength") == derive_normative_strength(decision), "record_normative_strength")
    acceptable_values = record.get("acceptable_alternatives")
    reason_values = record.get("reason_codes")
    _require(isinstance(acceptable_values, list) and _unique(acceptable_values) and set(acceptable_values) <= {"A", "B", "C"}, "record_acceptable_values")
    _require(isinstance(reason_values, list) and _unique(reason_values) and set(reason_values) <= REASON_CODES, "record_reason_values")
    _require(record.get("fatigue_decision") is None or record.get("fatigue_decision") in FATIGUE_DECISION_CODES, "record_fatigue_value")
    _require(isinstance(record.get("boundary_question"), bool), "record_boundary_type")
    _require(record.get("privacy_review_status") == "PENDING", "record_privacy_pending")

    reconciliation = record.get("metadata_reconciliation_status")
    required_metadata = (
        record.get("context_family"), record.get("register"), record.get("source_family"),
    )
    all_metadata = (*required_metadata, record.get("persona_dimension"))
    _require(reconciliation in {"PENDING_RECONCILIATION", "RECONCILED"}, "record_reconciliation_status")
    if reconciliation == "PENDING_RECONCILIATION":
        _require(all(value is None for value in all_metadata), "record_pending_metadata_must_be_null")
    else:
        _require(all(value is not None for value in required_metadata), "record_reconciled_metadata_required")

    note_required = decision in NOTE_REQUIRED_DECISIONS or record.get("boundary_question") is True
    if note_required:
        _require(_nonblank(record.get("owner_note")), "record_note_required")
    if decision == "DEPENDS":
        _require(_nonblank(record.get("owner_condition")), "record_condition_required")
    if decision == "REGISTER_SPECIFIC":
        _require(_nonblank(record.get("owner_condition")), "record_register_condition_required")
    if record.get("fatigue_decision") == "DEPENDS":
        _require(_nonblank(record.get("owner_condition")), "record_fatigue_condition_required")
    if decision == "EDIT":
        _require(_nonblank(record.get("owner_written_response")), "record_edit_required")
    if decision == "OWNER_WRITTEN":
        _require(record.get("session_id") == "SESSION_5", "owner_write_session")
        _require(_nonblank(record.get("owner_written_response")), "owner_write_blank")
        _require(WRITE_ID_RE.fullmatch(record["item_id"]) is not None, "owner_write_item_id")
        _require(record.get("owner_condition") == "", "owner_write_condition_forbidden")
        _require(record.get("owner_note") == "", "owner_write_note_forbidden")
        _require(record.get("acceptable_alternatives") == [], "owner_write_alternatives_forbidden")
        _require(record.get("fatigue_decision") is None, "owner_write_fatigue_forbidden")
        _require(record.get("reason_codes") == [], "owner_write_reasons_forbidden")
        _require(record.get("boundary_question") is False, "owner_write_boundary_forbidden")
    else:
        _require(record.get("session_id") != "SESSION_5", "decision_wrong_session5")
        _require(ITEM_ID_RE.fullmatch(record["item_id"]) is not None, "decision_item_id")

    if item is not None:
        _require(record.get("item_id") == item.get("item_id"), "record_item_mismatch")
        _require(record.get("session_id") == item.get("session_id"), "record_session_mismatch")
        if reconciliation == "RECONCILED":
            _require(record.get("context_family") == item.get("context_family"), "record_context_mismatch")
            _require(record.get("register") == item.get("register"), "record_register_mismatch")
            _require(record.get("persona_dimension") == item.get("persona_dimension"), "record_persona_mismatch")
            _require(record.get("source_family") == item.get("source_family"), "record_source_family_mismatch")
        _require(record.get("boundary_question") is item.get("boundary_question"), "record_boundary_mismatch")
        allowed = {option["value"] for option in item["decision_options"]}
        _require(decision in allowed, "record_decision_not_allowed")
        acceptable = record.get("acceptable_alternatives", [])
        _require(item.get("acceptable_alternatives_allowed") or not acceptable, "acceptable_alternatives_forbidden")
        _require(set(acceptable).issubset({candidate["option_id"] for candidate in item.get("candidates", [])}), "acceptable_alternatives_unknown")
        if item.get("fatigue_question") is not None:
            allowed_fatigue = {option["value"] for option in item["fatigue_question"]["options"]}
            _require(record.get("fatigue_decision") in allowed_fatigue, "fatigue_decision_required")
        else:
            _require(record.get("fatigue_decision") is None, "fatigue_decision_unexpected")
        if decision in item.get("reason_required_for", []):
            _require(bool(record.get("reason_codes")), "reason_required")
        allowed_reasons = {option["value"] for option in item.get("reason_options", [])}
        _require(set(record.get("reason_codes", [])).issubset(allowed_reasons), "reason_unknown")
    _require(bool(SHA256_RE.fullmatch(str(record.get("review_hash", "")))), "record_review_hash")
    _require(record.get("review_hash") == canonical_review_hash(record), "record_review_hash_mismatch")


def derive_session_state(completed_items: int, total_items: int, validated: bool = False) -> str:
    _require(
        isinstance(completed_items, int) and not isinstance(completed_items, bool)
        and isinstance(total_items, int) and not isinstance(total_items, bool),
        "progress_type",
    )
    _require(isinstance(validated, bool), "validated_type")
    _require(0 <= completed_items <= total_items, "progress_range")
    if validated:
        _require(completed_items == total_items, "validated_incomplete")
        return "VALIDATED"
    if completed_items == 0:
        return "NOT_STARTED"
    if completed_items == total_items:
        return "COMPLETED"
    return "IN_PROGRESS"


def validate_partial_export(value: Mapping[str, Any], pack: Mapping[str, Any]) -> None:
    # A partial review is meaningful only against the exact, canonical pack
    # the owner saw.  Record/export hashes alone cannot detect a mutated
    # question set when an attacker (or a buggy tool) recomputes those hashes.
    validate_pack(pack)
    _exact_keys(value, PARTIAL_EXPORT_FIELDS, "export_fields")
    _require(value.get("schema_version") == "r30j1c-r1.session-review-export.v1", "export_schema")
    _require(value.get("pack_id") == pack.get("pack_id"), "export_pack")
    _require(value.get("manifest_sha") == pack.get("manifest_sha"), "export_manifest")
    session_id = value.get("session_id")
    _require(session_id in SESSION_IDS, "export_session")
    _require(value.get("session_state") in SESSION_STATES, "export_state")
    _require(value.get("evidence_class") == "OWNER_CORRECTION_EVIDENCE", "export_evidence_class")
    _require(value.get("owner_review_completed") is False, "export_global_completion")
    _require(value.get("profile_inference_allowed") is False, "export_profile_inference")
    _require(value.get("profile_frozen") is False, "export_profile_frozen")
    _require(value.get("gold_admission") is False, "export_gold")
    _require(value.get("allowed_for_training") is False, "export_training")
    _require(value.get("training_started") is False, "export_training_started")
    _require(
        isinstance(value.get("completed_at"), str)
        and UTC_TIMESTAMP_RE.fullmatch(value["completed_at"]) is not None,
        "export_completed_at",
    )
    records = value.get("records")
    _require(isinstance(records, list), "export_records")
    _require(
        isinstance(value.get("completed_items"), int)
        and not isinstance(value.get("completed_items"), bool),
        "export_completed_type",
    )
    _require(
        isinstance(value.get("total_items"), int)
        and not isinstance(value.get("total_items"), bool),
        "export_total_type",
    )
    _require(value.get("completed_items") == len(records), "export_completed_count")
    record_ids = [record.get("item_id") for record in records if isinstance(record, Mapping)]
    _require(len(record_ids) == len(records) and _unique(record_ids), "export_duplicate_or_invalid_record")
    total_items = value.get("total_items")
    session = next((row for row in pack.get("sessions", []) if row.get("session_id") == session_id), None)
    _require(isinstance(session, Mapping), "export_session_missing_from_pack")
    expected_total = len(session["owner_write_prompt_ids"] if session_id == "SESSION_5" else session["decision_item_ids"])
    _require(total_items == expected_total and 0 <= len(records) <= total_items, "export_total_count")
    if session_id == "SESSION_5":
        item_lookup = {prompt["prompt_id"]: prompt for prompt in pack["owner_write_prompts"]}
        for record in records:
            validate_correction_record(record)
            _require(record.get("metadata_reconciliation_status") == "PENDING_RECONCILIATION", "export_record_reconciled")
            _require(
                all(record.get(key) is None for key in ("context_family", "register", "persona_dimension", "source_family")),
                "export_record_metadata_not_null",
            )
            _require(record.get("item_id") in item_lookup, "export_unknown_write_prompt")
            _require(record.get("session_id") == session_id, "export_record_session")
            _require(record.get("owner_decision") == "OWNER_WRITTEN", "export_write_decision")
    else:
        item_lookup = {item["item_id"]: item for item in pack["decision_items"]}
        for record in records:
            item = item_lookup.get(record.get("item_id"))
            _require(item is not None, "export_unknown_item")
            validate_correction_record(record, item)
            _require(record.get("metadata_reconciliation_status") == "PENDING_RECONCILIATION", "export_record_reconciled")
            _require(
                all(record.get(key) is None for key in ("context_family", "register", "persona_dimension", "source_family")),
                "export_record_metadata_not_null",
            )
            _require(record.get("session_id") == session_id, "export_record_session")
    expected_state = derive_session_state(len(records), total_items, validated=value.get("session_state") == "VALIDATED")
    _require(value.get("session_state") == expected_state, "export_state_mismatch")
    _require(bool(SHA256_RE.fullmatch(str(value.get("review_hash", "")))), "export_review_hash")
    _require(value.get("review_hash") == canonical_review_hash(value), "export_review_hash_mismatch")
