"""Fail-closed contracts for R30J1C manual owner evidence.

This module contains only generic field and invariant validation.  It has no
actual source identifier, alias, source text, object fact, hypothesis value,
owner answer, or training path.  Populated records belong under ignored local
artifacts and remain review-only.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
import re
from typing import Any


EVIDENCE_CLASSES = (
    "CURRENT_EXPLICIT_OWNER_ASSERTION",
    "OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE",
    "PEER_RECEPTION_EVIDENCE",
    "PEER_PLAYFUL_MYTHOLOGY",
)

OWNER_CHAT_AUTHORSHIP_CLASS = "OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE"
OWNER_CHAT_ATTESTATION_KIND = "OWNER_SUPPLIED_CHAT_SCREENSHOT_RECORD"

REVIEW_ACTIONS = ("ACCEPT", "REJECT", "EDIT", "DEPENDS", "UNSURE")

REGISTER_CANDIDATES = (
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

EPISTEMIC_CATEGORIES = (
    "REAL_UNCERTAINTY",
    "PLAYFUL_FAUX_IGNORANCE",
    "ROLEPLAYED_IGNORANCE",
    "REFUSAL_TO_OVEREXPLAIN",
    "DEADPAN_MISDIRECTION",
)

_OPAQUE_REF = re.compile(r"^local\.[a-f0-9]{16,64}$")
_CORRECTION_REF = re.compile(r"^local\.correction\.[a-f0-9]{16,64}$")
_SAFE_CODE = re.compile(r"^[a-z][a-z0-9._-]{2,127}$")
_PEER_ID = re.compile(r"^PEER_[0-9]{3}$")


def _exact_keys(record: Mapping[str, Any], required: set[str], label: str) -> None:
    missing = required - set(record)
    extra = set(record) - required
    if missing:
        raise ValueError(f"{label}_missing_fields:{','.join(sorted(missing))}")
    if extra:
        raise ValueError(f"{label}_unexpected_fields:{','.join(sorted(extra))}")


def _opaque_ref(value: Any, label: str) -> str:
    if not isinstance(value, str) or _OPAQUE_REF.fullmatch(value) is None:
        raise ValueError(f"{label}_must_be_opaque_local_ref")
    return value


def _safe_code(value: Any, label: str) -> str:
    if not isinstance(value, str) or _SAFE_CODE.fullmatch(value) is None:
        raise ValueError(f"{label}_must_be_safe_code")
    return value


def _probability(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1:
        raise ValueError(f"{label}_must_be_probability")
    return float(value)


def _nonnegative_integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{label}_must_be_nonnegative_integer")
    return value


def _false(record: Mapping[str, Any], key: str, label: str) -> None:
    if record.get(key) is not False:
        raise ValueError(f"{label}_{key}_must_be_false")


def _true(record: Mapping[str, Any], key: str, label: str) -> None:
    if record.get(key) is not True:
        raise ValueError(f"{label}_{key}_must_be_true")


SOURCE_ENVELOPE_FIELDS = {
    "version",
    "status",
    "artifact_class",
    "local_only",
    "must_remain_ignored",
    "portable_public_safe",
    "contains_owner_specific_values",
    "owner_review_completed",
    "gold_admission_status",
    "profile_frozen",
    "allowed_for_training",
    "training_authorized",
    "source_family",
    "evidence_class_counts",
    "privacy_receipt",
    "authorship_receipt",
    "split_receipt",
    "hypothesis_receipt",
    "correction_pack_receipt",
    "training_state",
}


def validate_source_envelope(record: Mapping[str, Any]) -> None:
    """Validate an ignored aggregate envelope without reading source content."""

    _exact_keys(record, SOURCE_ENVELOPE_FIELDS, "source_envelope")
    if record["version"] != "r30j1c.manual-owner-evidence-source.v1":
        raise ValueError("source_envelope_version_invalid")
    if record["status"] not in {
        "EMPTY_TEMPLATE",
        "LOCAL_EVIDENCE_PENDING_REVIEW",
        "OWNER_CORRECTION_PENDING",
        "OWNER_CORRECTION_IN_PROGRESS",
    }:
        raise ValueError("source_envelope_status_invalid")
    if record["artifact_class"] != "MANUAL_HIGH_VALUE_OWNER_EVIDENCE_SOURCE":
        raise ValueError("source_envelope_artifact_class_invalid")
    _true(record, "local_only", "source_envelope")
    _true(record, "must_remain_ignored", "source_envelope")
    for key in (
        "portable_public_safe",
        "owner_review_completed",
        "profile_frozen",
        "allowed_for_training",
        "training_authorized",
    ):
        _false(record, key, "source_envelope")
    if record["gold_admission_status"] != "PENDING_OWNER_CORRECTION":
        raise ValueError("source_envelope_gold_admission_invalid")

    counts = record["evidence_class_counts"]
    required_counts = {
        "current_explicit_owner_assertion",
        "owner_chat_direct",
        "peer_reception",
        "peer_playful_mythology",
    }
    if not isinstance(counts, Mapping):
        raise ValueError("source_envelope_evidence_counts_invalid")
    _exact_keys(counts, required_counts, "source_envelope_evidence_counts")
    for key in required_counts:
        _nonnegative_integer(counts[key], f"evidence_count_{key}")

    if record["status"] == "EMPTY_TEMPLATE":
        if record["contains_owner_specific_values"] is not False:
            raise ValueError("empty_template_owner_values_must_be_false")
        if record["source_family"] is not None:
            raise ValueError("empty_template_source_family_must_be_null")
        if any(counts.values()):
            raise ValueError("empty_template_evidence_counts_must_be_zero")
    else:
        if record["contains_owner_specific_values"] is not True:
            raise ValueError("populated_local_envelope_owner_values_flag_required")
        validate_source_family(record["source_family"])

    validate_privacy_receipt(record["privacy_receipt"], populated=record["status"] != "EMPTY_TEMPLATE")
    validate_authorship_receipt(record["authorship_receipt"], populated=record["status"] != "EMPTY_TEMPLATE")
    validate_split_receipt(record["split_receipt"])
    validate_hypothesis_receipt(record["hypothesis_receipt"])
    validate_correction_pack_receipt(record["correction_pack_receipt"], empty=record["status"] == "EMPTY_TEMPLATE")
    validate_training_state(record["training_state"])


def validate_source_family(record: Any) -> str:
    if not isinstance(record, Mapping):
        raise ValueError("source_family_must_be_object")
    fields = {"source_family_ref", "document_group_ref", "idea_group_ref", "family_group_ref"}
    _exact_keys(record, fields, "source_family")
    values = [_opaque_ref(record[key], f"source_family_{key}") for key in sorted(fields)]
    if len(set(values)) != 1:
        raise ValueError("one_conversation_must_use_one_split_family")
    return values[0]


def validate_privacy_receipt(record: Any, *, populated: bool) -> None:
    if not isinstance(record, Mapping):
        raise ValueError("privacy_receipt_must_be_object")
    fields = {
        "raw_assets_local_only",
        "raw_assets_tracked",
        "raw_excerpts_tracked",
        "private_paths_tracked",
        "content_hashes_tracked",
        "deidentification_complete",
        "quote_blocks_separated",
        "third_party_identifiers_removed",
        "third_party_body_optimizer_eligible",
        "sensitive_values_persisted_in_receipt",
    }
    _exact_keys(record, fields, "privacy_receipt")
    _true(record, "raw_assets_local_only", "privacy_receipt")
    for key in (
        "raw_assets_tracked",
        "raw_excerpts_tracked",
        "private_paths_tracked",
        "content_hashes_tracked",
        "third_party_body_optimizer_eligible",
        "sensitive_values_persisted_in_receipt",
    ):
        _false(record, key, "privacy_receipt")
    for key in ("deidentification_complete", "quote_blocks_separated", "third_party_identifiers_removed"):
        if not isinstance(record[key], bool):
            raise ValueError(f"privacy_receipt_{key}_must_be_boolean")
        if populated and record[key] is not True:
            raise ValueError(f"populated_privacy_receipt_{key}_must_be_true")


def validate_authorship_receipt(record: Any, *, populated: bool) -> None:
    if not isinstance(record, Mapping):
        raise ValueError("authorship_receipt_must_be_object")
    fields = {
        "owner_chat_authorship_class",
        "owner_chat_attestation_kind",
        "owner_attestation_present",
        "direct_body_attribution_pass",
        "quoted_text_owner_admissible",
        "peer_text_owner_admissible",
        "peer_reception_normative",
        "playful_mythology_owner_identity_truth",
        "raw_mixed_container_training_eligible",
    }
    _exact_keys(record, fields, "authorship_receipt")
    if record["owner_chat_authorship_class"] != OWNER_CHAT_AUTHORSHIP_CLASS:
        raise ValueError("owner_chat_authorship_class_invalid")
    if record["owner_chat_attestation_kind"] != OWNER_CHAT_ATTESTATION_KIND:
        raise ValueError("owner_chat_attestation_kind_invalid")
    for key in ("owner_attestation_present", "direct_body_attribution_pass"):
        if not isinstance(record[key], bool):
            raise ValueError(f"authorship_receipt_{key}_must_be_boolean")
        if populated and record[key] is not True:
            raise ValueError(f"populated_authorship_receipt_{key}_must_be_true")
    for key in (
        "quoted_text_owner_admissible",
        "peer_text_owner_admissible",
        "peer_reception_normative",
        "playful_mythology_owner_identity_truth",
        "raw_mixed_container_training_eligible",
    ):
        _false(record, key, "authorship_receipt")


def validate_split_receipt(record: Any) -> None:
    if not isinstance(record, Mapping):
        raise ValueError("split_receipt_must_be_object")
    true_fields = {
        "one_conversation_one_family",
        "owner_utterances_share_family",
        "derived_variants_share_family",
        "peer_annotations_share_family",
        "correction_items_share_family",
    }
    false_fields = {"cross_split_family_leakage", "heldout_eligible"}
    _exact_keys(record, true_fields | false_fields, "split_receipt")
    for key in true_fields:
        _true(record, key, "split_receipt")
    for key in false_fields:
        _false(record, key, "split_receipt")


def validate_hypothesis_receipt(record: Any) -> None:
    if not isinstance(record, Mapping):
        raise ValueError("hypothesis_receipt_must_be_object")
    fields = {
        "source_specific_hypotheses_tracked",
        "descriptive_promoted_to_normative",
        "peer_convergence_promoted_to_preference",
        "owner_review_required",
        "runtime_modes_created",
        "actual_profile_values_present",
    }
    _exact_keys(record, fields, "hypothesis_receipt")
    _true(record, "owner_review_required", "hypothesis_receipt")
    for key in fields - {"owner_review_required"}:
        _false(record, key, "hypothesis_receipt")


def validate_correction_pack_receipt(record: Any, *, empty: bool) -> None:
    if not isinstance(record, Mapping):
        raise ValueError("correction_pack_receipt_must_be_object")
    fields = {
        "correction_item_count",
        "actual_question_text_tracked",
        "owner_responses_present",
        "same_source_family",
        "owner_review_required",
        "gold_admission",
        "allowed_for_training",
    }
    _exact_keys(record, fields, "correction_pack_receipt")
    count = _nonnegative_integer(record["correction_item_count"], "correction_item_count")
    if empty and count != 0:
        raise ValueError("empty_template_correction_count_must_be_zero")
    for key in ("same_source_family", "owner_review_required"):
        _true(record, key, "correction_pack_receipt")
    for key in ("actual_question_text_tracked", "owner_responses_present", "gold_admission", "allowed_for_training"):
        _false(record, key, "correction_pack_receipt")


def validate_training_state(record: Any) -> None:
    if not isinstance(record, Mapping):
        raise ValueError("training_state_must_be_object")
    fields = {
        "training_started",
        "optimizer_tokens",
        "assistant_target_tokens",
        "classification_updates",
        "checkpoint",
        "candidate",
    }
    _exact_keys(record, fields, "training_state")
    _false(record, "training_started", "training_state")
    for key in ("optimizer_tokens", "assistant_target_tokens", "classification_updates"):
        if record[key] != 0:
            raise ValueError(f"training_state_{key}_must_be_zero")
    for key in ("checkpoint", "candidate"):
        if record[key] is not None:
            raise ValueError(f"training_state_{key}_must_be_null")


MESSAGE_FIELDS = {
    "message_id",
    "sequence_index",
    "turn_cluster_ref",
    "source_family_ref",
    "speaker",
    "speaker_role",
    "body",
    "quoted_speaker",
    "quoted_body",
    "quoted_body_owner_style_admissible",
    "body_provenance",
    "message_kind",
    "privacy_status",
    "raw_username_present",
    "avatar_present",
    "exact_timestamp_present",
    "evidence_class",
    "owner_style_admissible",
    "peer_reception_analysis_eligible",
    "normative_evidence",
    "owner_identity_truth",
    "owner_review_required",
    "allowed_for_training",
}


def validate_deidentified_message(record: Mapping[str, Any]) -> None:
    """Validate one local deidentified message and its quote boundary."""

    _exact_keys(record, MESSAGE_FIELDS, "message")
    _opaque_ref(record["message_id"], "message_id")
    _opaque_ref(record["turn_cluster_ref"], "turn_cluster_ref")
    _opaque_ref(record["source_family_ref"], "message_source_family_ref")
    _nonnegative_integer(record["sequence_index"], "message_sequence_index")
    if record["speaker_role"] not in {"OWNER", "PEER"}:
        raise ValueError("message_speaker_role_invalid")
    if record["speaker_role"] == "OWNER" and record["speaker"] != "OWNER":
        raise ValueError("owner_message_speaker_must_be_deidentified_owner")
    if record["speaker_role"] == "PEER" and (
        not isinstance(record["speaker"], str) or _PEER_ID.fullmatch(record["speaker"]) is None
    ):
        raise ValueError("peer_message_speaker_must_be_stable_anonymous_id")

    quoted_speaker = record["quoted_speaker"]
    quoted_body = record["quoted_body"]
    if (quoted_speaker is None) != (quoted_body is None):
        raise ValueError("quoted_speaker_and_body_must_be_both_null_or_present")
    if quoted_speaker is not None and quoted_speaker != "OWNER" and (
        not isinstance(quoted_speaker, str) or _PEER_ID.fullmatch(quoted_speaker) is None
    ):
        raise ValueError("quoted_speaker_must_be_deidentified")
    if quoted_body is not None and (not isinstance(quoted_body, str) or not quoted_body):
        raise ValueError("quoted_body_invalid")
    _false(record, "quoted_body_owner_style_admissible", "message")

    if record["body_provenance"] not in {"DIRECT_MESSAGE_BODY", "CONTEXT_ONLY", "MEDIA_ONLY"}:
        raise ValueError("message_body_provenance_invalid")
    if record["message_kind"] not in {"TEXT", "MEDIA_ONLY"}:
        raise ValueError("message_kind_invalid")
    if not isinstance(record["body"], str):
        raise ValueError("message_body_must_be_string")
    if record["message_kind"] == "TEXT" and not record["body"]:
        raise ValueError("text_message_body_required")
    if record["message_kind"] == "MEDIA_ONLY" and record["body"]:
        raise ValueError("media_only_message_body_must_be_empty")
    if record["privacy_status"] not in {"PASS", "REVIEW_REQUIRED", "REJECT"}:
        raise ValueError("message_privacy_status_invalid")
    for key in ("raw_username_present", "avatar_present", "exact_timestamp_present"):
        _false(record, key, "message")
    if record["evidence_class"] not in {
        OWNER_CHAT_AUTHORSHIP_CLASS,
        "PEER_RECEPTION_EVIDENCE",
        "PEER_PLAYFUL_MYTHOLOGY",
        "CONTEXT_ONLY",
    }:
        raise ValueError("message_evidence_class_invalid")

    expected_owner_admissible = (
        record["speaker_role"] == "OWNER"
        and record["speaker"] == "OWNER"
        and record["body_provenance"] == "DIRECT_MESSAGE_BODY"
        and record["message_kind"] == "TEXT"
        and record["privacy_status"] == "PASS"
        and record["evidence_class"] == OWNER_CHAT_AUTHORSHIP_CLASS
    )
    if record["owner_style_admissible"] is not expected_owner_admissible:
        raise ValueError("owner_style_admissibility_must_follow_direct_body_rule")

    expected_peer_reception = (
        record["speaker_role"] == "PEER"
        and record["body_provenance"] == "DIRECT_MESSAGE_BODY"
        and record["message_kind"] == "TEXT"
        and record["privacy_status"] == "PASS"
        and record["evidence_class"] == "PEER_RECEPTION_EVIDENCE"
    )
    if record["peer_reception_analysis_eligible"] is not expected_peer_reception:
        raise ValueError("peer_reception_eligibility_invalid")
    for key in ("normative_evidence", "owner_identity_truth", "allowed_for_training"):
        _false(record, key, "message")
    _true(record, "owner_review_required", "message")


OWNER_ASSERTION_FIELDS = {
    "assertion_id",
    "source_family_ref",
    "assertion_kind",
    "assertion_scope",
    "attestation_kind",
    "value_local",
    "value_tracked",
    "authorship_confidence",
    "descriptive_confidence",
    "normative_confidence",
    "generalization_scope",
    "provenance_usable",
    "model_feature_eligible",
    "owner_review_required",
    "allowed_for_training",
}


def validate_owner_assertion(record: Mapping[str, Any]) -> None:
    """Keep explicit source/context assertions distinct from preference gold."""

    _exact_keys(record, OWNER_ASSERTION_FIELDS, "owner_assertion")
    _opaque_ref(record["assertion_id"], "assertion_id")
    _opaque_ref(record["source_family_ref"], "assertion_source_family_ref")
    _safe_code(record["assertion_kind"], "assertion_kind")
    if record["assertion_scope"] not in {
        "PROVENANCE_DISAMBIGUATION",
        "CONTEXT_FACT",
        "OBJECT_SPECIFIC_EVALUATION",
        "RESEARCH_HYPOTHESIS_SEED",
    }:
        raise ValueError("owner_assertion_scope_invalid")
    if record["attestation_kind"] != "CURRENT_EXPLICIT_OWNER_ASSERTION":
        raise ValueError("owner_assertion_attestation_invalid")
    if record["value_local"] is None:
        raise ValueError("owner_assertion_local_value_required")
    _false(record, "value_tracked", "owner_assertion")
    _probability(record["authorship_confidence"], "owner_assertion_authorship_confidence")
    _probability(record["descriptive_confidence"], "owner_assertion_descriptive_confidence")
    if _probability(record["normative_confidence"], "owner_assertion_normative_confidence") != 0:
        raise ValueError("owner_assertion_normative_confidence_must_be_zero_before_correction")
    _safe_code(record["generalization_scope"], "owner_assertion_generalization_scope")
    _true(record, "provenance_usable", "owner_assertion")
    _false(record, "model_feature_eligible", "owner_assertion")
    _true(record, "owner_review_required", "owner_assertion")
    _false(record, "allowed_for_training", "owner_assertion")


ALIAS_TIMELINE_FIELDS = {
    "version",
    "subject_ref",
    "events",
    "aliases_are_distinct_personas",
    "provenance_disambiguation_only",
    "model_input_eligible",
    "owner_review_required",
    "allowed_for_training",
}


def validate_alias_timeline(record: Mapping[str, Any]) -> None:
    _exact_keys(record, ALIAS_TIMELINE_FIELDS, "alias_timeline")
    if record["version"] != "r30j1c.owner-alias-timeline.local.v1":
        raise ValueError("alias_timeline_version_invalid")
    _opaque_ref(record["subject_ref"], "alias_timeline_subject_ref")
    events = record["events"]
    if not isinstance(events, Sequence) or isinstance(events, (str, bytes)) or not events:
        raise ValueError("alias_timeline_events_required")
    for event in events:
        if not isinstance(event, Mapping):
            raise ValueError("alias_timeline_event_must_be_object")
        _exact_keys(event, {"era_code", "alias_local", "same_person", "value_tracked"}, "alias_timeline_event")
        _safe_code(event["era_code"], "alias_timeline_era_code")
        if not isinstance(event["alias_local"], str) or not event["alias_local"]:
            raise ValueError("alias_timeline_alias_local_required")
        _true(event, "same_person", "alias_timeline_event")
        _false(event, "value_tracked", "alias_timeline_event")
    _false(record, "aliases_are_distinct_personas", "alias_timeline")
    _true(record, "provenance_disambiguation_only", "alias_timeline")
    _false(record, "model_input_eligible", "alias_timeline")
    _true(record, "owner_review_required", "alias_timeline")
    _false(record, "allowed_for_training", "alias_timeline")


PEER_EVIDENCE_FIELDS = {
    "evidence_id",
    "source_family_ref",
    "source_message_ref",
    "anonymous_speaker_ref",
    "evidence_class",
    "claim_code",
    "convergence_cluster_ref",
    "independent_speaker_count",
    "descriptive_confidence",
    "normative_confidence",
    "owner_authored",
    "owner_identity_truth",
    "owner_preference_gold",
    "hypothesis_context_allowed",
    "anti_caricature_context_allowed",
    "raw_excerpt_present",
    "owner_review_required",
    "allowed_for_training",
}


def validate_peer_evidence(record: Mapping[str, Any]) -> None:
    _exact_keys(record, PEER_EVIDENCE_FIELDS, "peer_evidence")
    for key in ("evidence_id", "source_family_ref", "source_message_ref", "convergence_cluster_ref"):
        _opaque_ref(record[key], f"peer_evidence_{key}")
    if not isinstance(record["anonymous_speaker_ref"], str) or _PEER_ID.fullmatch(record["anonymous_speaker_ref"]) is None:
        raise ValueError("peer_evidence_speaker_must_be_anonymous")
    if record["evidence_class"] not in {"PEER_RECEPTION_EVIDENCE", "PEER_PLAYFUL_MYTHOLOGY"}:
        raise ValueError("peer_evidence_class_invalid")
    _safe_code(record["claim_code"], "peer_evidence_claim_code")
    if _nonnegative_integer(record["independent_speaker_count"], "peer_independent_speaker_count") < 1:
        raise ValueError("peer_independent_speaker_count_must_be_positive")
    _probability(record["descriptive_confidence"], "peer_descriptive_confidence")
    if _probability(record["normative_confidence"], "peer_normative_confidence") != 0:
        raise ValueError("peer_normative_confidence_must_be_zero")
    for key in (
        "owner_authored",
        "owner_identity_truth",
        "owner_preference_gold",
        "raw_excerpt_present",
        "allowed_for_training",
    ):
        _false(record, key, "peer_evidence")
    _true(record, "owner_review_required", "peer_evidence")
    if record["evidence_class"] == "PEER_RECEPTION_EVIDENCE":
        _true(record, "hypothesis_context_allowed", "peer_reception")
        _false(record, "anti_caricature_context_allowed", "peer_reception")
    else:
        _false(record, "hypothesis_context_allowed", "peer_playful_mythology")
        _true(record, "anti_caricature_context_allowed", "peer_playful_mythology")


HYPOTHESIS_FIELDS = {
    "hypothesis_id",
    "source_family_ref",
    "latent_family_ref",
    "behaviour_code",
    "claim_status",
    "evidence_basis",
    "evidence_refs",
    "authorship_confidence",
    "descriptive_confidence",
    "normative_confidence",
    "generalization_scope",
    "topic_slice_ref",
    "positive_boundary",
    "negative_boundary",
    "compatible_registers",
    "forbidden_registers",
    "epistemic_category",
    "is_runtime_mode",
    "is_owner_identity_truth",
    "contains_raw_excerpt",
    "profile_frozen",
    "owner_review_required",
    "allowed_for_training",
}


def validate_hypothesis(record: Mapping[str, Any]) -> None:
    _exact_keys(record, HYPOTHESIS_FIELDS, "hypothesis")
    for key in ("hypothesis_id", "source_family_ref", "latent_family_ref"):
        _opaque_ref(record[key], f"hypothesis_{key}")
    _safe_code(record["behaviour_code"], "hypothesis_behaviour_code")
    if record["claim_status"] not in {"DESCRIPTIVE_HYPOTHESIS_ONLY", "CANDIDATE_ONLY"}:
        raise ValueError("hypothesis_claim_status_invalid")
    if record["evidence_basis"] not in {
        "DIRECT_OWNER_TRANSCRIPT",
        "PEER_RECEPTION_CONVERGENCE",
        "CURRENT_EXPLICIT_OWNER_ASSERTION",
        "MIXED_DESCRIPTIVE",
    }:
        raise ValueError("hypothesis_evidence_basis_invalid")
    refs = record["evidence_refs"]
    if not isinstance(refs, Sequence) or isinstance(refs, (str, bytes)) or not refs:
        raise ValueError("hypothesis_evidence_refs_required")
    if len(set(refs)) != len(refs):
        raise ValueError("hypothesis_evidence_refs_must_be_unique")
    for ref in refs:
        _opaque_ref(ref, "hypothesis_evidence_ref")
    _probability(record["authorship_confidence"], "hypothesis_authorship_confidence")
    _probability(record["descriptive_confidence"], "hypothesis_descriptive_confidence")
    if _probability(record["normative_confidence"], "hypothesis_normative_confidence") != 0:
        raise ValueError("descriptive_hypothesis_normative_confidence_must_be_zero")
    _safe_code(record["generalization_scope"], "hypothesis_generalization_scope")
    if record["topic_slice_ref"] is not None:
        _opaque_ref(record["topic_slice_ref"], "hypothesis_topic_slice_ref")
    for key in ("positive_boundary", "negative_boundary"):
        values = record[key]
        if not isinstance(values, Sequence) or isinstance(values, (str, bytes)) or not values:
            raise ValueError(f"hypothesis_{key}_required")
        if any(not isinstance(value, str) or not value for value in values):
            raise ValueError(f"hypothesis_{key}_text_invalid")
    compatible = record["compatible_registers"]
    forbidden = record["forbidden_registers"]
    for key, values in (("compatible", compatible), ("forbidden", forbidden)):
        if not isinstance(values, Sequence) or isinstance(values, (str, bytes)):
            raise ValueError(f"hypothesis_{key}_registers_invalid")
        if any(value not in REGISTER_CANDIDATES for value in values):
            raise ValueError(f"hypothesis_{key}_register_unknown")
    if not compatible:
        raise ValueError("hypothesis_compatible_registers_required")
    if set(compatible) & set(forbidden):
        raise ValueError("hypothesis_registers_must_not_overlap")
    if record["epistemic_category"] is not None and record["epistemic_category"] not in EPISTEMIC_CATEGORIES:
        raise ValueError("hypothesis_epistemic_category_invalid")
    for key in ("is_runtime_mode", "is_owner_identity_truth", "contains_raw_excerpt", "profile_frozen", "allowed_for_training"):
        _false(record, key, "hypothesis")
    _true(record, "owner_review_required", "hypothesis")


CORRECTION_FIELDS = {
    "version",
    "status",
    "local_only",
    "must_remain_ignored",
    "correction_id",
    "source_family_ref",
    "split_family_ref",
    "target_hypothesis_refs",
    "evidence_refs",
    "information_goal",
    "question_family",
    "register_context",
    "topic_slice_ref",
    "question_text_local",
    "contains_source_excerpt",
    "review_actions",
    "depends_requires_condition",
    "owner_response_present",
    "owner_review_status",
    "owner_review_required",
    "gold_admission",
    "allowed_for_training",
    "heldout_eligible",
}


def validate_correction_item(record: Mapping[str, Any]) -> None:
    _exact_keys(record, CORRECTION_FIELDS, "correction_item")
    if record["version"] != "r30j1c.owner-correction-item.v1":
        raise ValueError("correction_item_version_invalid")
    if record["status"] not in {"EMPTY_TEMPLATE", "OWNER_REVIEW_REQUIRED"}:
        raise ValueError("correction_item_status_invalid")
    _true(record, "local_only", "correction_item")
    _true(record, "must_remain_ignored", "correction_item")
    if list(record["review_actions"]) != list(REVIEW_ACTIONS):
        raise ValueError("correction_item_review_actions_invalid")
    _true(record, "depends_requires_condition", "correction_item")
    _true(record, "owner_review_required", "correction_item")
    for key in (
        "contains_source_excerpt",
        "owner_response_present",
        "gold_admission",
        "allowed_for_training",
        "heldout_eligible",
    ):
        _false(record, key, "correction_item")
    if record["owner_review_status"] != "UNREVIEWED":
        raise ValueError("correction_item_owner_review_status_invalid")

    if record["status"] == "EMPTY_TEMPLATE":
        nullable = {
            "correction_id",
            "source_family_ref",
            "split_family_ref",
            "information_goal",
            "question_family",
            "register_context",
            "topic_slice_ref",
            "question_text_local",
        }
        if any(record[key] is not None for key in nullable):
            raise ValueError("empty_correction_template_values_must_be_null")
        if record["target_hypothesis_refs"] or record["evidence_refs"]:
            raise ValueError("empty_correction_template_refs_must_be_empty")
        return

    if not isinstance(record["correction_id"], str) or _CORRECTION_REF.fullmatch(record["correction_id"]) is None:
        raise ValueError("correction_id_must_be_opaque_local_ref")
    source_family = _opaque_ref(record["source_family_ref"], "correction_source_family_ref")
    split_family = _opaque_ref(record["split_family_ref"], "correction_split_family_ref")
    if source_family != split_family:
        raise ValueError("correction_item_must_share_source_split_family")
    for key in ("target_hypothesis_refs", "evidence_refs"):
        values = record[key]
        if not isinstance(values, Sequence) or isinstance(values, (str, bytes)) or not values:
            raise ValueError(f"correction_item_{key}_required")
        if len(set(values)) != len(values):
            raise ValueError(f"correction_item_{key}_must_be_unique")
        for value in values:
            _opaque_ref(value, f"correction_item_{key}")
    _safe_code(record["information_goal"], "correction_information_goal")
    _safe_code(record["question_family"], "correction_question_family")
    if record["register_context"] is not None and record["register_context"] not in REGISTER_CANDIDATES:
        raise ValueError("correction_register_context_invalid")
    if record["topic_slice_ref"] is not None:
        _opaque_ref(record["topic_slice_ref"], "correction_topic_slice_ref")
    if not isinstance(record["question_text_local"], str) or not record["question_text_local"].strip():
        raise ValueError("correction_question_text_local_required")


def validate_single_source_family(source_family_ref: str, records: Iterable[Mapping[str, Any]]) -> None:
    """Require every derived record, annotation and correction to one family."""

    expected = _opaque_ref(source_family_ref, "expected_source_family_ref")
    for index, record in enumerate(records):
        actual = record.get("source_family_ref")
        if actual != expected:
            raise ValueError(f"record_crosses_source_family:{index}")
        if "split_family_ref" in record and record["split_family_ref"] != expected:
            raise ValueError(f"record_crosses_split_family:{index}")


PUBLIC_RECEIPT_FIELDS = {
    "schema_version",
    "status",
    "manual_source_count",
    "evidence_class_counts",
    "correction_item_count",
    "quote_separation_pass",
    "deidentification_pass",
    "single_source_family_pass",
    "third_party_optimizer_count",
    "owner_review_completed",
    "gold_admission",
    "training_started",
    "optimizer_tokens",
    "assistant_target_tokens",
    "raw_values_emitted",
    "source_ids_emitted",
    "paths_or_hashes_emitted",
}


def aggregate_public_receipt(envelope: Mapping[str, Any]) -> dict[str, Any]:
    """Return only a path-, identifier-, hypothesis-, and excerpt-free receipt."""

    validate_source_envelope(envelope)
    if envelope["status"] == "EMPTY_TEMPLATE":
        manual_source_count = 0
    else:
        manual_source_count = 1
    receipt = {
        "schema_version": "r30j1c.manual-owner-evidence-public-receipt.v1",
        "status": "LOCAL_EVIDENCE_REVIEW_ONLY",
        "manual_source_count": manual_source_count,
        "evidence_class_counts": dict(envelope["evidence_class_counts"]),
        "correction_item_count": envelope["correction_pack_receipt"]["correction_item_count"],
        "quote_separation_pass": envelope["privacy_receipt"]["quote_blocks_separated"],
        "deidentification_pass": envelope["privacy_receipt"]["deidentification_complete"],
        "single_source_family_pass": envelope["split_receipt"]["one_conversation_one_family"],
        "third_party_optimizer_count": 0,
        "owner_review_completed": False,
        "gold_admission": False,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "raw_values_emitted": False,
        "source_ids_emitted": False,
        "paths_or_hashes_emitted": False,
    }
    validate_public_receipt(receipt)
    return receipt


def validate_public_receipt(record: Mapping[str, Any]) -> None:
    _exact_keys(record, PUBLIC_RECEIPT_FIELDS, "public_receipt")
    if record["schema_version"] != "r30j1c.manual-owner-evidence-public-receipt.v1":
        raise ValueError("public_receipt_version_invalid")
    if record["status"] != "LOCAL_EVIDENCE_REVIEW_ONLY":
        raise ValueError("public_receipt_status_invalid")
    _nonnegative_integer(record["manual_source_count"], "public_receipt_manual_source_count")
    _nonnegative_integer(record["correction_item_count"], "public_receipt_correction_item_count")
    if record["third_party_optimizer_count"] != 0:
        raise ValueError("public_receipt_third_party_optimizer_count_must_be_zero")
    for key in (
        "owner_review_completed",
        "gold_admission",
        "training_started",
        "raw_values_emitted",
        "source_ids_emitted",
        "paths_or_hashes_emitted",
    ):
        _false(record, key, "public_receipt")
    for key in ("optimizer_tokens", "assistant_target_tokens"):
        if record[key] != 0:
            raise ValueError(f"public_receipt_{key}_must_be_zero")
    if not isinstance(record["evidence_class_counts"], Mapping):
        raise ValueError("public_receipt_evidence_counts_invalid")
    for value in record["evidence_class_counts"].values():
        _nonnegative_integer(value, "public_receipt_evidence_count")
    for key in ("quote_separation_pass", "deidentification_pass", "single_source_family_pass"):
        if not isinstance(record[key], bool):
            raise ValueError(f"public_receipt_{key}_must_be_boolean")
