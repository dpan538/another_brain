"""Evidence and privacy contract for R30J0-P2 persona excavation.

P2 is an offline discovery phase.  It may produce hypotheses and owner-review
questions, but it must not silently promote descriptive writing patterns into
normative owner preferences.  This module deliberately contains no actual
owner profile values, source excerpts, or model-training logic.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import re
from typing import Any


MICROTRAIT_FAMILIES = (
    "response_shape",
    "social_stance",
    "epistemic_stance",
    "humour_strategy",
    "roleplay_persona",
    "seriousness_switching",
    "explanation_strategy",
    "agreement_disagreement",
    "emotional_response_style",
    "philosophical_response_style",
    "technical_response_style",
    "weird_question_handling",
    "language_code_switching",
    "opening_closing_behaviour",
    "interaction_rhythm",
    "ai_self_presentation",
    "anti_patterns",
)

BEHAVIOUR_CLASSES = (
    "TEXT_SEMANTIC",
    "TEXT_STYLE",
    "PRESENTATION",
    "INTERACTION_POLICY",
    "ROLEPLAY",
    "META_AI",
    "UNKNOWN",
)

EPISTEMIC_PERSONA_CLASSES = (
    "REAL_UNCERTAINTY",
    "PLAYFUL_FAUX_IGNORANCE",
    "ROLEPLAYED_IGNORANCE",
    "REFUSAL_TO_OVEREXPLAIN",
    "DEADPAN_MISDIRECTION",
)

EVIDENCE_KINDS = (
    "CURRENT_EXPLICIT_OWNER_ASSERTION",
    "HISTORICAL_NORMATIVE_OWNER_FEEDBACK",
    "DESCRIPTIVE_OWNER_WRITING",
    "OWNER_AUTHORED_EDITED_SECONDARY",
    "HISTORICAL_ASSET_METADATA",
    "RESEARCH_GAP",
)

CLAIM_STATUSES = (
    "OWNER_ASSERTED_SEED",
    "HISTORICAL_NORMATIVE_CANDIDATE",
    "DESCRIPTIVE_HYPOTHESIS_ONLY",
    "RESEARCH_QUESTION_ONLY",
    "OWNER_CONFIRMED",
    "OWNER_REJECTED",
)

BOUNDARY_STATUSES = (
    "BOUNDARY_NOT_YET_KNOWN",
    "BOUNDARY_PARTIALLY_KNOWN",
    "BOUNDARY_OWNER_CONFIRMED",
)

OWNER_REVIEW_STATUSES = (
    "UNREVIEWED",
    "ACCEPT",
    "REJECT",
    "EDIT",
    "DEPENDS",
    "UNSURE",
)

TIME_BUCKETS = ("early_project", "middle_project", "recent_project", "current", "unknown")

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

MODE_DECISIONS = ("KEEP", "MERGE", "SPLIT", "DROP", "ADD", "REVIEW")
MODE_HYPOTHESIS_STATUSES = ("OWNER_ASSERTED_SEED", "HYPOTHESIS_REQUIRES_OWNER_REVIEW")

VAGUE_NON_BEHAVIOURAL_LABELS = frozenset(
    {"quirky", "smart", "creative", "funny", "warm"}
)

# Artifact records must contain references and aggregate counts, never source
# passages.  The key check is intentionally conservative.
_FORBIDDEN_CONTENT_KEYS = frozenset(
    {
        "excerpt",
        "raw_excerpt",
        "raw_text",
        "source_text",
        "prompt_text",
        "answer_text",
        "private_content",
        "user_answer_raw",
        "user_answer_clean",
        "target_answer",
    }
)
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$")
_TRAIT_ID = re.compile(r"^[a-z][a-z0-9_]{4,127}$")


def deprecated_persona_label(value: str, deprecated_labels: Sequence[str] = ()) -> bool:
    """Return whether a vague historic label is forbidden as a model label."""

    normalized = {str(label).strip().casefold() for label in deprecated_labels}
    return value.strip().casefold() in normalized


def validate_safe_reference(value: Any) -> str:
    if not isinstance(value, str) or _SAFE_ID.fullmatch(value) is None:
        raise ValueError("evidence_reference_must_be_opaque_safe_id")
    return value


def validate_no_private_excerpt_fields(value: Any, path: str = "$") -> None:
    """Reject excerpt-bearing fields recursively.

    This does not attempt to identify all private language.  It enforces the
    stronger structural rule used by P2: evidence artifacts carry opaque IDs,
    counts and classifications, not verbatim passages.
    """

    if isinstance(value, Mapping):
        for key, child in value.items():
            normalized = str(key).strip().casefold()
            if normalized == "contains_raw_excerpt":
                if child is not False:
                    raise ValueError(f"private_excerpt_presence_forbidden:{path}.{key}")
                continue
            if normalized in _FORBIDDEN_CONTENT_KEYS or normalized.endswith("_excerpt"):
                raise ValueError(f"private_excerpt_field_forbidden:{path}.{key}")
            validate_no_private_excerpt_fields(child, f"{path}.{key}")
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for index, child in enumerate(value):
            validate_no_private_excerpt_fields(child, f"{path}[{index}]")


def evidence_strength(
    *,
    current_explicit_owner_assertions: int = 0,
    independent_historical_normative_items: int = 0,
    descriptive_items: int = 0,
    owner_elicitation_confirmed: bool = False,
) -> str:
    """Apply the P2 evidence-strength rule without inferring preferences."""

    if current_explicit_owner_assertions >= 1:
        return "EXPLICIT_OWNER_ASSERTION"
    if independent_historical_normative_items >= 3:
        return "HISTORICAL_NORMATIVE_CONVERGENCE"
    if independent_historical_normative_items >= 2 and owner_elicitation_confirmed:
        return "ELICITATION_CONFIRMED_CONVERGENCE"
    if descriptive_items > 0:
        return "DESCRIPTIVE_HYPOTHESIS_ONLY"
    return "INSUFFICIENT_FOR_PERSONAL_PREFERENCE"


def normative_preference_established(
    *,
    current_explicit_owner_assertions: int = 0,
    independent_historical_normative_items: int = 0,
    descriptive_items: int = 0,
    owner_elicitation_confirmed: bool = False,
) -> bool:
    """Pure descriptive frequency can never establish a preference."""

    del descriptive_items
    return (
        current_explicit_owner_assertions >= 1
        or independent_historical_normative_items >= 3
        or (independent_historical_normative_items >= 2 and owner_elicitation_confirmed)
    )


def validate_microtrait(record: Mapping[str, Any]) -> None:
    required = {
        "trait_id",
        "family",
        "behaviour_class",
        "candidate_behaviour",
        "claim_status",
        "evidence_kind",
        "evidence_refs",
        "descriptive_evidence_count",
        "normative_evidence_count",
        "evidence_strength",
        "registers",
        "owner_review_status",
        "owner_review_required",
        "allowed_for_training",
    }
    missing = required - set(record)
    if missing:
        raise ValueError(f"microtrait_missing_fields:{','.join(sorted(missing))}")
    trait_id = record["trait_id"]
    if not isinstance(trait_id, str) or _TRAIT_ID.fullmatch(trait_id) is None:
        raise ValueError("microtrait_id_invalid")
    if trait_id in VAGUE_NON_BEHAVIOURAL_LABELS:
        raise ValueError("deprecated_or_vague_microtrait_label")
    if record["family"] not in MICROTRAIT_FAMILIES:
        raise ValueError("microtrait_family_invalid")
    if record["behaviour_class"] not in BEHAVIOUR_CLASSES:
        raise ValueError("microtrait_behaviour_class_invalid")
    if record["claim_status"] not in CLAIM_STATUSES:
        raise ValueError("microtrait_claim_status_invalid")
    if record["evidence_kind"] not in EVIDENCE_KINDS:
        raise ValueError("microtrait_evidence_kind_invalid")
    if record["owner_review_status"] not in OWNER_REVIEW_STATUSES:
        raise ValueError("microtrait_owner_review_status_invalid")
    if not isinstance(record["candidate_behaviour"], str) or len(record["candidate_behaviour"].strip()) < 12:
        raise ValueError("microtrait_must_describe_observable_behaviour")
    if not isinstance(record["evidence_refs"], list):
        raise ValueError("microtrait_evidence_refs_invalid")
    for reference in record["evidence_refs"]:
        validate_safe_reference(reference)
    if record["claim_status"] == "OWNER_ASSERTED_SEED" and not record["evidence_refs"]:
        raise ValueError("owner_asserted_seed_requires_evidence_reference")
    if record["descriptive_evidence_count"] > 0 and not record["evidence_refs"]:
        raise ValueError("descriptive_hypothesis_requires_opaque_evidence_reference")
    if record["claim_status"] == "DESCRIPTIVE_HYPOTHESIS_ONLY" and record["normative_evidence_count"] != 0:
        raise ValueError("descriptive_hypothesis_cannot_claim_normative_evidence")
    if record["claim_status"] == "OWNER_ASSERTED_SEED" and record["evidence_kind"] != "CURRENT_EXPLICIT_OWNER_ASSERTION":
        raise ValueError("owner_asserted_seed_requires_current_explicit_assertion")
    if record["owner_review_required"] is not True or record["allowed_for_training"] is not False:
        raise ValueError("p2_microtraits_must_remain_review_only")
    registers = record["registers"]
    if not isinstance(registers, list) or not registers or any(item not in REGISTER_CANDIDATES for item in registers):
        raise ValueError("microtrait_registers_invalid")
    validate_no_private_excerpt_fields(record)


def validate_persona_mode(record: Mapping[str, Any]) -> None:
    required = {
        "mode_id",
        "status",
        "boundary_status",
        "trigger_positive",
        "trigger_negative",
        "minimum_confidence",
        "compatible_registers",
        "forbidden_registers",
        "maximum_intensity",
        "fallback_mode",
        "evidence_count",
        "contradiction_count",
        "owner_review_status",
        "owner_review_required",
        "allowed_for_training",
    }
    missing = required - set(record)
    if missing:
        raise ValueError(f"persona_mode_missing_fields:{','.join(sorted(missing))}")
    mode_id = record["mode_id"]
    if not isinstance(mode_id, str) or _TRAIT_ID.fullmatch(mode_id) is None:
        raise ValueError("persona_mode_id_invalid")
    if record["status"] not in MODE_HYPOTHESIS_STATUSES:
        raise ValueError("persona_mode_status_invalid")
    if record["boundary_status"] not in BOUNDARY_STATUSES:
        raise ValueError("persona_mode_boundary_status_invalid")
    if not isinstance(record["trigger_positive"], list) or not record["trigger_positive"]:
        raise ValueError("persona_mode_positive_boundary_required")
    if not isinstance(record["trigger_negative"], list) or not record["trigger_negative"]:
        raise ValueError("persona_mode_negative_boundary_required")
    if not isinstance(record["minimum_confidence"], (int, float)) or not 0 <= record["minimum_confidence"] <= 1:
        raise ValueError("persona_mode_minimum_confidence_invalid")
    if not isinstance(record["maximum_intensity"], (int, float)) or not 0 <= record["maximum_intensity"] <= 1:
        raise ValueError("persona_mode_maximum_intensity_invalid")
    for key in ("compatible_registers", "forbidden_registers"):
        if not isinstance(record[key], list) or any(item not in REGISTER_CANDIDATES for item in record[key]):
            raise ValueError(f"persona_mode_{key}_invalid")
    if record["owner_review_status"] not in OWNER_REVIEW_STATUSES:
        raise ValueError("persona_mode_owner_review_status_invalid")
    if record["owner_review_required"] is not True or record["allowed_for_training"] is not False:
        raise ValueError("p2_persona_modes_must_remain_review_only")
    validate_no_private_excerpt_fields(record)


def validate_grammar_rule(record: Mapping[str, Any]) -> None:
    required = {
        "rule_id",
        "trigger",
        "context",
        "preferred_behaviour_candidate",
        "anti_behaviour",
        "intensity",
        "exceptions",
        "registers",
        "confidence",
        "evidence_refs",
        "claim_status",
        "owner_review_status",
        "allowed_for_training",
    }
    missing = required - set(record)
    if missing:
        raise ValueError(f"grammar_rule_missing_fields:{','.join(sorted(missing))}")
    if not isinstance(record["rule_id"], str) or _TRAIT_ID.fullmatch(record["rule_id"]) is None:
        raise ValueError("grammar_rule_id_invalid")
    if record["claim_status"] not in CLAIM_STATUSES:
        raise ValueError("grammar_rule_claim_status_invalid")
    if not isinstance(record["exceptions"], list) or not record["exceptions"]:
        raise ValueError("grammar_rule_requires_exception_boundary")
    if not isinstance(record["evidence_refs"], list):
        raise ValueError("grammar_rule_evidence_refs_invalid")
    for reference in record["evidence_refs"]:
        validate_safe_reference(reference)
    if record["owner_review_status"] not in OWNER_REVIEW_STATUSES:
        raise ValueError("grammar_rule_review_status_invalid")
    if record["allowed_for_training"] is not False:
        raise ValueError("p2_grammar_hypothesis_cannot_train")
    validate_no_private_excerpt_fields(record)


def assert_p2_training_guard(record: Mapping[str, Any]) -> None:
    expected = {
        "training_started": False,
        "classification_updates": 0,
        "optimizer_tokens": 0,
        "checkpoint": None,
        "candidate": None,
        "r30j1_authorized": False,
        "owner_review_v1_paused": True,
        "profile_frozen": False,
    }
    for key, value in expected.items():
        if record.get(key) != value:
            raise ValueError(f"p2_training_guard_violation:{key}")
