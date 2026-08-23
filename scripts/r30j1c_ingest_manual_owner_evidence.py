#!/usr/bin/env python3
"""Ingest one manually supplied owner-evidence family into ignored storage.

The input JSON and screenshot source map must live below ``artifacts/r30j1c``.
This program is deliberately content-agnostic: tracked code contains no owner
alias, source identifier, transcript, product name, hypothesis value, or review
answer.  It separates direct owner message bodies, quote blocks, unverified
quote-only owner attributions, peer reception, and peer mythology before any
future review or dataset admission.

Only aggregate counts and boolean safety receipts are printed.  All populated
outputs remain local, ignored, mode 0600, unreviewed, unassigned to a split,
and ineligible for training.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import tempfile
from typing import Any, Iterable, Mapping

import sys


ROOT = Path(__file__).resolve().parents[1]
LOCAL_ROOT = (ROOT / "artifacts" / "r30j1c").resolve()
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_SCREENSHOT_BYTES = 32 * 1024 * 1024
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$")
ANONYMOUS_PEER_ID = re.compile(r"^PEER_[0-9]{3}$")
SAFE_CODE = re.compile(r"^[a-z][a-z0-9._-]{2,127}$")
CORRECTION_REGISTERS = {
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
}

EVIDENCE_CLASSES = {
    "CURRENT_EXPLICIT_OWNER_ASSERTION",
    "OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE",
    "QUOTED_OWNER_ATTRIBUTION_UNVERIFIED",
    "PEER_RECEPTION_EVIDENCE",
    "PEER_PLAYFUL_MYTHOLOGY",
}

TRUE_FORBIDDEN_KEYS = {
    "allowed_for_training",
    "training_allowed",
    "training_authorized",
    "owner_review_completed",
    "gold_admitted",
    "gold_label",
    "final_persona_truth",
}

sys.path.insert(0, str(ROOT))
from src.personal_judge.r30j1c_manual_evidence_contract import (  # noqa: E402
    aggregate_public_receipt,
    validate_alias_timeline,
    validate_correction_item,
    validate_deidentified_message,
    validate_hypothesis,
    validate_owner_assertion,
    validate_peer_evidence,
    validate_single_source_family,
    validate_source_envelope,
)


class IntakeError(ValueError):
    """Fail-closed input or privacy-boundary error."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _opaque(*parts: str, prefix: str = "local") -> str:
    material = "\x1f".join(parts).encode("utf-8")
    return f"{prefix}.{hashlib.sha256(material).hexdigest()}"


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise IntakeError(code)


def _require_id(value: Any, code: str) -> str:
    _require(isinstance(value, str) and SAFE_ID.fullmatch(value) is not None, code)
    return str(value)


def _require_nonempty(value: Any, code: str) -> str:
    _require(isinstance(value, str) and bool(value.strip()), code)
    return str(value)


def _read_json(path: Path) -> dict[str, Any]:
    _require(path.is_file() and not path.is_symlink(), "input_must_be_regular_file")
    payload = json.loads(path.read_text(encoding="utf-8"))
    _require(isinstance(payload, dict), "input_must_be_json_object")
    return payload


def _within_local_root(path: Path, code: str) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(LOCAL_ROOT)
    except ValueError as exc:
        raise IntakeError(code) from exc
    return resolved


def _walk_forbidden_truth(value: Any) -> None:
    if isinstance(value, Mapping):
        for key, nested in value.items():
            if key in TRUE_FORBIDDEN_KEYS and nested is not False:
                raise IntakeError(f"forbidden_true_or_missing_false:{key}")
            _walk_forbidden_truth(nested)
    elif isinstance(value, list):
        for nested in value:
            _walk_forbidden_truth(nested)


def _atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _atomic_json(path: Path, value: Any) -> None:
    _atomic_text(path, json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n")


def _atomic_jsonl(path: Path, rows: Iterable[Mapping[str, Any]]) -> None:
    serialized = "".join(
        json.dumps(dict(row), ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
        for row in rows
    )
    _atomic_text(path, serialized)


def _copy_png(source: Path, destination: Path) -> dict[str, Any]:
    _require(source.is_file() and not source.is_symlink(), "screenshot_must_be_regular_file")
    size = source.stat().st_size
    _require(0 < size <= MAX_SCREENSHOT_BYTES, "screenshot_size_out_of_bounds")
    with source.open("rb") as handle:
        header = handle.read(24)
    _require(len(header) == 24 and header[:8] == PNG_SIGNATURE, "screenshot_must_be_png")
    _require(header[12:16] == b"IHDR", "png_missing_ihdr")
    width, height = struct.unpack(">II", header[16:24])
    _require(width > 0 and height > 0, "png_invalid_dimensions")

    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(destination.parent, 0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{destination.name}.", dir=destination.parent)
    try:
        with os.fdopen(descriptor, "wb") as target, source.open("rb") as origin:
            shutil.copyfileobj(origin, target, 1024 * 1024)
            target.flush()
            os.fsync(target.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, destination)
        os.chmod(destination, 0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {
        "file": f"raw/{destination.name}",
        "bytes": destination.stat().st_size,
        "sha256": _sha256(destination),
        "width": width,
        "height": height,
    }


def _unique_rows(rows: Any, id_key: str, code: str) -> list[dict[str, Any]]:
    _require(isinstance(rows, list), f"{code}_must_be_list")
    result: list[dict[str, Any]] = []
    identifiers: set[str] = set()
    for row in rows:
        _require(isinstance(row, dict), f"{code}_row_must_be_object")
        identifier = _require_id(row.get(id_key), f"{code}_invalid_id")
        _require(identifier not in identifiers, f"{code}_duplicate_id")
        identifiers.add(identifier)
        result.append(dict(row))
    return result


def _validate_input(payload: dict[str, Any], image_map: dict[str, Any]) -> dict[str, Any]:
    _require(payload.get("version") == "manual-owner-evidence.input.v1", "unsupported_input_version")
    _require(image_map.get("version") == "manual-owner-evidence.image-map.v1", "unsupported_image_map_version")
    _walk_forbidden_truth(payload)

    source_id = _require_id(payload.get("source_id"), "invalid_source_id")
    family_id = _require_id(payload.get("source_family_id"), "invalid_source_family_id")
    _require(payload.get("source_class") == "HIGH_INFORMATION_AUTHENTIC_PERSONAL_SOURCE", "invalid_source_class")
    _require(payload.get("source_scope") == "EVIDENCE_BEARING_MESSAGES_ONLY", "invalid_source_scope")
    _require(payload.get("owner_review_completed") is False, "owner_review_must_be_false")
    _require(payload.get("gold_admission_status") == "PENDING_OWNER_CORRECTION", "gold_must_be_pending")
    _require(payload.get("allowed_for_training") is False, "training_must_be_false")
    _require(payload.get("training_authorized") is False, "training_authorization_must_be_false")

    privacy_review = payload.get("privacy_review")
    _require(isinstance(privacy_review, dict), "privacy_review_required")
    for key in (
        "manual_review_completed",
        "third_party_identifiers_removed",
        "avatars_removed_from_derived",
        "exact_timestamps_removed",
        "quote_blocks_separated",
    ):
        _require(privacy_review.get(key) is True, f"privacy_review_{key}_must_be_true")
    _require(
        privacy_review.get("direct_owner_sensitive_content_detected") is False,
        "owner_sensitive_content_requires_exclusion",
    )
    excluded_count = privacy_review.get("sensitive_sections_excluded_count")
    _require(
        isinstance(excluded_count, int) and not isinstance(excluded_count, bool) and excluded_count >= 0,
        "sensitive_sections_excluded_count_invalid",
    )

    image_rows = _unique_rows(image_map.get("images"), "image_id", "images")
    expected_ids = payload.get("screenshot_ids")
    _require(isinstance(expected_ids, list) and expected_ids, "screenshot_ids_required")
    _require(all(isinstance(item, str) for item in expected_ids), "screenshot_ids_must_be_strings")
    _require(len(set(expected_ids)) == len(expected_ids), "duplicate_screenshot_id")
    _require({row["image_id"] for row in image_rows} == set(expected_ids), "screenshot_map_mismatch")
    for row in image_rows:
        _require_nonempty(row.get("source_path"), "image_source_path_required")

    assertions = _unique_rows(payload.get("owner_assertions"), "assertion_id", "owner_assertions")
    for row in assertions:
        _require(row.get("evidence_class") == "CURRENT_EXPLICIT_OWNER_ASSERTION", "owner_assertion_wrong_class")
        _require_nonempty(row.get("assertion_kind"), "owner_assertion_kind_required")
        _require("value" in row, "owner_assertion_value_required")
        _require(row.get("assertion_scope") in {"PROVENANCE_DISAMBIGUATION", "CONTEXT_FACT", "OBJECT_SPECIFIC_EVALUATION", "RESEARCH_HYPOTHESIS_SEED"}, "owner_assertion_scope_invalid")
        _require(SAFE_CODE.fullmatch(str(row.get("generalization_scope") or "")) is not None, "owner_assertion_generalization_scope_invalid")
        for key in ("authorship_confidence", "descriptive_confidence"):
            value = row.get(key)
            _require(isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1, f"owner_assertion_{key}_invalid")

    alias_timeline = payload.get("alias_timeline")
    _require(isinstance(alias_timeline, list) and alias_timeline, "alias_timeline_required")
    for row in alias_timeline:
        _require(isinstance(row, dict), "alias_row_must_be_object")
        _require_nonempty(row.get("period"), "alias_period_required")
        _require_nonempty(row.get("alias"), "alias_value_required")
        _require(row.get("local_provenance_only") is True, "alias_must_be_local_only")

    messages = _unique_rows(payload.get("messages"), "message_id", "messages")
    _require(messages, "owner_messages_required")
    sequence_indexes: set[int] = set()
    for row in messages:
        _require(row.get("speaker_role") == "OWNER", "messages_must_be_direct_owner_body")
        _require(row.get("evidence_class") == "OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE", "owner_message_wrong_class")
        _require_nonempty(row.get("body"), "owner_message_body_required")
        _require_id(row.get("turn_cluster_id"), "owner_message_turn_cluster_required")
        index = row.get("sequence_index")
        _require(isinstance(index, int) and index > 0 and index not in sequence_indexes, "invalid_message_sequence")
        sequence_indexes.add(index)
        screenshot_ids = row.get("screenshot_ids")
        _require(isinstance(screenshot_ids, list) and screenshot_ids, "message_screenshot_ids_required")
        _require(set(screenshot_ids).issubset(set(expected_ids)), "message_unknown_screenshot_id")
        quote = row.get("quote")
        if quote is not None:
            _require(isinstance(quote, dict), "quote_must_be_object")
            _require(quote.get("speaker_role") == "PEER_ANONYMOUS", "quote_speaker_must_be_peer")
            _require(ANONYMOUS_PEER_ID.fullmatch(str(quote.get("speaker_id") or "")) is not None, "quote_peer_not_anonymous")
            _require_nonempty(quote.get("body"), "quote_body_required")

    non_text_events = _unique_rows(payload.get("non_text_owner_events", []), "event_id", "non_text_owner_events")
    for row in non_text_events:
        _require(row.get("speaker_role") == "OWNER", "non_text_event_must_be_owner")
        _require(row.get("event_type") == "NON_TEXT_MEDIA", "non_text_event_wrong_type")
        _require(row.get("owner_style_admissible") is False, "non_text_event_not_style_evidence")

    quoted_owner = _unique_rows(payload.get("quoted_owner_attributions", []), "attribution_id", "quoted_owner")
    for row in quoted_owner:
        _require(row.get("evidence_class") == "QUOTED_OWNER_ATTRIBUTION_UNVERIFIED", "quoted_owner_wrong_class")
        _require(ANONYMOUS_PEER_ID.fullmatch(str(row.get("quoting_peer_id") or "")) is not None, "quoted_owner_peer_not_anonymous")
        _require_nonempty(row.get("quoted_body"), "quoted_owner_body_required")

    peer_reception = _unique_rows(payload.get("peer_reception"), "evidence_id", "peer_reception")
    for row in peer_reception:
        _require(row.get("evidence_class") == "PEER_RECEPTION_EVIDENCE", "peer_reception_wrong_class")
        _require(ANONYMOUS_PEER_ID.fullmatch(str(row.get("peer_speaker_id") or "")) is not None, "peer_reception_not_anonymous")
        _require_nonempty(row.get("body"), "peer_reception_body_required")
        _require(SAFE_CODE.fullmatch(str(row.get("claim_code") or "")) is not None, "peer_reception_claim_code_invalid")
        _require_id(row.get("convergence_cluster_id"), "peer_reception_convergence_cluster_invalid")
        _require(isinstance(row.get("independent_speaker_count"), int) and row["independent_speaker_count"] >= 1, "peer_reception_speaker_count_invalid")
        _require(isinstance(row.get("descriptive_confidence"), (int, float)) and not isinstance(row["descriptive_confidence"], bool) and 0 <= row["descriptive_confidence"] <= 1, "peer_reception_confidence_invalid")
        _require(isinstance(row.get("screenshot_ids"), list) and row["screenshot_ids"] and set(row["screenshot_ids"]).issubset(set(expected_ids)), "peer_reception_screenshot_ids_invalid")
        _require_id(row.get("turn_cluster_id"), "peer_reception_turn_cluster_required")

    mythology = _unique_rows(payload.get("peer_playful_mythology"), "evidence_id", "peer_mythology")
    for row in mythology:
        _require(row.get("evidence_class") == "PEER_PLAYFUL_MYTHOLOGY", "peer_mythology_wrong_class")
        _require(ANONYMOUS_PEER_ID.fullmatch(str(row.get("peer_speaker_id") or "")) is not None, "peer_mythology_not_anonymous")
        _require_nonempty(row.get("body"), "peer_mythology_body_required")
        _require(SAFE_CODE.fullmatch(str(row.get("claim_code") or "")) is not None, "peer_mythology_claim_code_invalid")
        _require_id(row.get("convergence_cluster_id"), "peer_mythology_convergence_cluster_invalid")
        _require(isinstance(row.get("independent_speaker_count"), int) and row["independent_speaker_count"] >= 1, "peer_mythology_speaker_count_invalid")
        _require(isinstance(row.get("descriptive_confidence"), (int, float)) and not isinstance(row["descriptive_confidence"], bool) and 0 <= row["descriptive_confidence"] <= 1, "peer_mythology_confidence_invalid")
        _require(isinstance(row.get("screenshot_ids"), list) and row["screenshot_ids"] and set(row["screenshot_ids"]).issubset(set(expected_ids)), "peer_mythology_screenshot_ids_invalid")
        _require_id(row.get("turn_cluster_id"), "peer_mythology_turn_cluster_required")

    hypotheses = _unique_rows(payload.get("hypotheses"), "hypothesis_id", "hypotheses")
    available_evidence_ids = (
        {row["message_id"] for row in messages}
        | {row["evidence_id"] for row in peer_reception}
        | {row["evidence_id"] for row in mythology}
    )
    for row in hypotheses:
        _require_nonempty(row.get("dimension"), "hypothesis_dimension_required")
        _require_nonempty(row.get("definition"), "hypothesis_definition_required")
        _require(row.get("evidence_strength") in {"HIGH_DESCRIPTIVE", "MEDIUM_HIGH_DESCRIPTIVE", "MEDIUM_DESCRIPTIVE", "MEDIUM_LOW_DESCRIPTIVE", "LOW_CANDIDATE_ONLY"}, "invalid_hypothesis_strength")
        _require(SAFE_CODE.fullmatch(str(row.get("behaviour_code") or "")) is not None, "hypothesis_behaviour_code_invalid")
        _require(row.get("claim_status") in {"DESCRIPTIVE_HYPOTHESIS_ONLY", "CANDIDATE_ONLY"}, "hypothesis_claim_status_invalid")
        _require(row.get("evidence_basis") in {"DIRECT_OWNER_TRANSCRIPT", "PEER_RECEPTION_CONVERGENCE", "CURRENT_EXPLICIT_OWNER_ASSERTION", "MIXED_DESCRIPTIVE"}, "hypothesis_evidence_basis_invalid")
        _require(isinstance(row.get("evidence_ids"), list) and row["evidence_ids"], "hypothesis_evidence_ids_required")
        _require(set(row["evidence_ids"]).issubset(available_evidence_ids), "hypothesis_unknown_evidence")
        for key in ("authorship_confidence", "descriptive_confidence"):
            value = row.get(key)
            _require(isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1, f"hypothesis_{key}_invalid")
        _require(SAFE_CODE.fullmatch(str(row.get("generalization_scope") or "")) is not None, "hypothesis_generalization_scope_invalid")
        for key in ("positive_boundary", "negative_boundary"):
            _require(isinstance(row.get(key), list) and row[key] and all(isinstance(value, str) and value for value in row[key]), f"hypothesis_{key}_invalid")
        for key in ("compatible_registers", "forbidden_registers"):
            _require(isinstance(row.get(key), list), f"hypothesis_{key}_invalid")

    correction_questions = _unique_rows(payload.get("correction_questions"), "question_id", "correction_questions")
    hypothesis_ids = {row["hypothesis_id"] for row in hypotheses}
    evidence_ids = (
        {row["message_id"] for row in messages}
        | {row["evidence_id"] for row in peer_reception}
        | {row["evidence_id"] for row in mythology}
    )
    for row in correction_questions:
        _require_nonempty(row.get("question"), "correction_question_required")
        _require(row.get("owner_answer") is None, "correction_answer_must_be_empty")
        _require(isinstance(row.get("target_hypothesis_ids"), list) and row["target_hypothesis_ids"], "correction_hypothesis_refs_required")
        _require(set(row["target_hypothesis_ids"]).issubset(hypothesis_ids), "correction_unknown_hypothesis")
        _require(isinstance(row.get("evidence_ids"), list) and row["evidence_ids"], "correction_evidence_refs_required")
        _require(set(row["evidence_ids"]).issubset(evidence_ids), "correction_unknown_evidence")
        _require(SAFE_CODE.fullmatch(str(row.get("information_goal") or "")) is not None, "invalid_information_goal")
        _require(SAFE_CODE.fullmatch(str(row.get("question_family") or "")) is not None, "invalid_question_family")
        _require(row.get("register_context") in CORRECTION_REGISTERS, "invalid_correction_register")

    crocodile = payload.get("crocodile_hypothesis_family")
    _require(isinstance(crocodile, dict), "crocodile_hypothesis_family_required")
    _require(isinstance(crocodile.get("dimensions"), list) and crocodile["dimensions"], "crocodile_dimensions_required")
    _require(crocodile.get("runtime_mode_count") == 0, "dimensions_must_not_be_runtime_modes")
    _require(crocodile.get("final_persona_truth") is False, "crocodile_must_not_be_final_truth")

    register_slice = payload.get("register_slice")
    _require(isinstance(register_slice, dict), "register_slice_required")
    _require_nonempty(register_slice.get("register"), "register_name_required")
    _require(register_slice.get("cross_domain_generalization_authorized") is False, "cross_domain_generalization_forbidden")

    return {
        "source_id": source_id,
        "family_id": family_id,
        "image_rows": image_rows,
        "assertions": assertions,
        "alias_timeline": alias_timeline,
        "messages": sorted(messages, key=lambda row: row["sequence_index"]),
        "non_text_events": non_text_events,
        "quoted_owner": quoted_owner,
        "peer_reception": peer_reception,
        "mythology": mythology,
        "hypotheses": hypotheses,
        "correction_questions": correction_questions,
        "crocodile": crocodile,
        "register_slice": register_slice,
        "privacy_review": privacy_review,
    }


def ingest(input_path: Path, image_map_path: Path, output_root: Path) -> dict[str, Any]:
    input_path = _within_local_root(input_path, "input_must_be_below_ignored_r30j1c_root")
    image_map_path = _within_local_root(image_map_path, "image_map_must_be_below_ignored_r30j1c_root")
    output_root = _within_local_root(output_root, "output_must_be_below_ignored_r30j1c_root")
    _require(output_root != LOCAL_ROOT, "output_must_not_be_campaign_root")

    payload = _read_json(input_path)
    image_map = _read_json(image_map_path)
    normalized = _validate_input(payload, image_map)
    source_id = normalized["source_id"]
    family_id = normalized["family_id"]
    processed_at = _now_iso()
    family_ref = _opaque("source-family", family_id)

    output_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(output_root, 0o700)

    screenshot_manifest: list[dict[str, Any]] = []
    for row in normalized["image_rows"]:
        image_id = row["image_id"]
        source = Path(row["source_path"]).expanduser().resolve()
        receipt = _copy_png(source, output_root / "raw" / f"{image_id}.png")
        screenshot_manifest.append({"image_id": image_id, **receipt})

    message_rows: list[dict[str, Any]] = []
    owner_index: list[dict[str, Any]] = []
    quoted_block_count = 0
    for row in normalized["messages"]:
        quote = row.get("quote")
        quoted_block_count += quote is not None
        base = {
            "message_id": row["message_id"],
            "sequence_index": row["sequence_index"],
            "turn_cluster_id": row["turn_cluster_id"],
            "source_id": source_id,
            "source_family_id": family_id,
            "speaker": "OWNER",
            "speaker_role": "OWNER",
            "body": row["body"],
            "quoted_speaker": None if quote is None else quote["speaker_id"],
            "quoted_speaker_role": None if quote is None else "PEER_ANONYMOUS",
            "quoted_body": None if quote is None else quote["body"],
            "screenshot_ids": row["screenshot_ids"],
            "evidence_class": "OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE",
            "evidence_category": "DESCRIPTIVE_STYLE_EVIDENCE",
            "normative_preference": False,
            "owner_style_admissible": True,
            "owner_review_completed": False,
            "allowed_for_training": False,
            "split": "UNASSIGNED",
        }
        message_rows.append(base)
        owner_index.append(
            {
                "message_id": row["message_id"],
                "source_id": source_id,
                "source_family_id": family_id,
                "body": row["body"],
                "evidence_class": "OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE",
                "quoted_text_excluded": True,
                "normative_preference": False,
                "owner_review_completed": False,
                "allowed_for_training": False,
                "split": "UNASSIGNED",
            }
        )

    quoted_owner_rows = [
        {
            **row,
            "source_id": source_id,
            "source_family_id": family_id,
            "owner_authorship_verified": False,
            "owner_style_admissible": False,
            "normative_preference": False,
            "owner_review_completed": False,
            "allowed_for_training": False,
            "split": "UNASSIGNED",
        }
        for row in normalized["quoted_owner"]
    ]

    peer_rows = [
        {
            **row,
            "source_id": source_id,
            "source_family_id": family_id,
            "descriptive_peer_reception": True,
            "owner_authored": False,
            "owner_truth_weight": 0,
            "normative_preference": False,
            "owner_review_completed": False,
            "allowed_for_training": False,
            "split": "UNASSIGNED",
        }
        for row in normalized["peer_reception"]
    ]
    mythology_rows = [
        {
            **row,
            "source_id": source_id,
            "source_family_id": family_id,
            "owner_authored": False,
            "owner_identity_truth": False,
            "owner_truth_weight": 0,
            "normative_preference": False,
            "rejected_from_persona_truth": True,
            "owner_review_completed": False,
            "allowed_for_training": False,
            "split": "UNASSIGNED",
        }
        for row in normalized["mythology"]
    ]

    # Canonical contract records use only opaque identifiers.  Their local
    # body fields are still populated and therefore remain ignored; quoted
    # bodies are never copied into the owner-style index.
    owner_assertion_records = [
        {
            "assertion_id": _opaque("assertion", source_id, row["assertion_id"]),
            "source_family_ref": family_ref,
            "assertion_kind": row["assertion_kind"],
            "assertion_scope": row["assertion_scope"],
            "attestation_kind": "CURRENT_EXPLICIT_OWNER_ASSERTION",
            "value_local": row["value"],
            "value_tracked": False,
            "authorship_confidence": row["authorship_confidence"],
            "descriptive_confidence": row["descriptive_confidence"],
            "normative_confidence": 0,
            "generalization_scope": row["generalization_scope"],
            "provenance_usable": True,
            "model_feature_eligible": False,
            "owner_review_required": True,
            "allowed_for_training": False,
        }
        for row in normalized["assertions"]
    ]
    alias_timeline_record = {
        "version": "r30j1c.owner-alias-timeline.local.v1",
        "subject_ref": _opaque("owner-subject", family_id),
        "events": [
            {
                "era_code": row["period"],
                "alias_local": row["alias"],
                "same_person": True,
                "value_tracked": False,
            }
            for row in normalized["alias_timeline"]
        ],
        "aliases_are_distinct_personas": False,
        "provenance_disambiguation_only": True,
        "model_input_eligible": False,
        "owner_review_required": True,
        "allowed_for_training": False,
    }

    canonical_message_rows: list[dict[str, Any]] = []
    canonical_message_ref_by_input_id: dict[str, str] = {}
    for row in normalized["messages"]:
        quote = row.get("quote")
        message_ref = _opaque("message", source_id, row["message_id"])
        canonical_message_ref_by_input_id[row["message_id"]] = message_ref
        canonical_message_rows.append(
            {
                "message_id": message_ref,
                "sequence_index": row["sequence_index"],
                "turn_cluster_ref": _opaque("turn-cluster", source_id, row["turn_cluster_id"]),
                "source_family_ref": family_ref,
                "speaker": "OWNER",
                "speaker_role": "OWNER",
                "body": row["body"],
                "quoted_speaker": None if quote is None else quote["speaker_id"],
                "quoted_body": None if quote is None else quote["body"],
                "quoted_body_owner_style_admissible": False,
                "body_provenance": "DIRECT_MESSAGE_BODY",
                "message_kind": "TEXT",
                "privacy_status": "PASS",
                "raw_username_present": False,
                "avatar_present": False,
                "exact_timestamp_present": False,
                "evidence_class": "OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE",
                "owner_style_admissible": True,
                "peer_reception_analysis_eligible": False,
                "normative_evidence": False,
                "owner_identity_truth": False,
                "owner_review_required": True,
                "allowed_for_training": False,
            }
        )

    peer_source_message_ref_by_evidence_id: dict[str, str] = {}
    next_sequence = max(row["sequence_index"] for row in normalized["messages"]) + 1
    for offset, row in enumerate(normalized["peer_reception"] + normalized["mythology"]):
        message_ref = _opaque("message", source_id, "peer", row["evidence_id"])
        peer_source_message_ref_by_evidence_id[row["evidence_id"]] = message_ref
        canonical_message_rows.append(
            {
                "message_id": message_ref,
                "sequence_index": next_sequence + offset,
                "turn_cluster_ref": _opaque("turn-cluster", source_id, row["turn_cluster_id"]),
                "source_family_ref": family_ref,
                "speaker": row["peer_speaker_id"],
                "speaker_role": "PEER",
                "body": row["body"],
                "quoted_speaker": None,
                "quoted_body": None,
                "quoted_body_owner_style_admissible": False,
                "body_provenance": "DIRECT_MESSAGE_BODY",
                "message_kind": "TEXT",
                "privacy_status": "PASS",
                "raw_username_present": False,
                "avatar_present": False,
                "exact_timestamp_present": False,
                "evidence_class": row["evidence_class"],
                "owner_style_admissible": False,
                "peer_reception_analysis_eligible": row["evidence_class"] == "PEER_RECEPTION_EVIDENCE",
                "normative_evidence": False,
                "owner_identity_truth": False,
                "owner_review_required": True,
                "allowed_for_training": False,
            }
        )

    peer_evidence_records: list[dict[str, Any]] = []
    for row in normalized["peer_reception"] + normalized["mythology"]:
        is_mythology = row["evidence_class"] == "PEER_PLAYFUL_MYTHOLOGY"
        peer_evidence_records.append(
            {
                "evidence_id": _opaque("peer-evidence", source_id, row["evidence_id"]),
                "source_family_ref": family_ref,
                "source_message_ref": peer_source_message_ref_by_evidence_id[row["evidence_id"]],
                "anonymous_speaker_ref": row["peer_speaker_id"],
                "evidence_class": row["evidence_class"],
                "claim_code": row["claim_code"],
                "convergence_cluster_ref": _opaque("peer-cluster", source_id, row["convergence_cluster_id"]),
                "independent_speaker_count": row["independent_speaker_count"],
                "descriptive_confidence": row["descriptive_confidence"],
                "normative_confidence": 0,
                "owner_authored": False,
                "owner_identity_truth": False,
                "owner_preference_gold": False,
                "hypothesis_context_allowed": not is_mythology,
                "anti_caricature_context_allowed": is_mythology,
                "raw_excerpt_present": False,
                "owner_review_required": True,
                "allowed_for_training": False,
            }
        )

    hypothesis_rows = [
        {
            **row,
            "source_id": source_id,
            "source_family_id": family_id,
            "evidence_category": "DESCRIPTIVE_STYLE_EVIDENCE",
            "normative_preference": False,
            "runtime_mode": False,
            "final_persona_truth": False,
            "owner_review_required": True,
            "owner_review_completed": False,
            "allowed_for_training": False,
            "split": "UNASSIGNED",
        }
        for row in normalized["hypotheses"]
    ]

    split_family_ref = family_ref
    topic_slice_ref = _opaque("topic-slice", str(normalized["register_slice"]["register"]))
    hypothesis_ref_by_id = {
        row["hypothesis_id"]: _opaque("hypothesis", source_id, row["hypothesis_id"])
        for row in normalized["hypotheses"]
    }
    peer_evidence_ref_by_input_id = {
        row["evidence_id"]: _opaque("peer-evidence", source_id, row["evidence_id"])
        for row in normalized["peer_reception"] + normalized["mythology"]
    }
    evidence_ref_by_id = {
        **canonical_message_ref_by_input_id,
        **peer_evidence_ref_by_input_id,
    }
    canonical_hypothesis_rows: list[dict[str, Any]] = []
    for row in normalized["hypotheses"]:
        canonical_hypothesis_rows.append(
            {
                "hypothesis_id": hypothesis_ref_by_id[row["hypothesis_id"]],
                "source_family_ref": family_ref,
                "latent_family_ref": _opaque("latent-family", family_id),
                "behaviour_code": row["behaviour_code"],
                "claim_status": row["claim_status"],
                "evidence_basis": row["evidence_basis"],
                "evidence_refs": [evidence_ref_by_id[value] for value in row["evidence_ids"]],
                "authorship_confidence": row["authorship_confidence"],
                "descriptive_confidence": row["descriptive_confidence"],
                "normative_confidence": 0,
                "generalization_scope": row["generalization_scope"],
                "topic_slice_ref": topic_slice_ref,
                "positive_boundary": row["positive_boundary"],
                "negative_boundary": row["negative_boundary"],
                "compatible_registers": row["compatible_registers"],
                "forbidden_registers": row["forbidden_registers"],
                "epistemic_category": row.get("epistemic_category"),
                "is_runtime_mode": False,
                "is_owner_identity_truth": False,
                "contains_raw_excerpt": False,
                "profile_frozen": False,
                "owner_review_required": True,
                "allowed_for_training": False,
            }
        )
    correction_rows = []
    for row in normalized["correction_questions"]:
        correction_rows.append(
            {
                "version": "r30j1c.owner-correction-item.v1",
                "status": "OWNER_REVIEW_REQUIRED",
                "local_only": True,
                "must_remain_ignored": True,
                "correction_id": _opaque("correction", source_id, row["question_id"], prefix="local.correction"),
                "source_family_ref": family_ref,
                "split_family_ref": split_family_ref,
                "target_hypothesis_refs": [hypothesis_ref_by_id[value] for value in row["target_hypothesis_ids"]],
                "evidence_refs": [evidence_ref_by_id[value] for value in row["evidence_ids"]],
                "information_goal": row["information_goal"],
                "question_family": row["question_family"],
                "register_context": row["register_context"],
                "topic_slice_ref": topic_slice_ref,
                "question_text_local": row["question"],
                "contains_source_excerpt": False,
                "review_actions": ["ACCEPT", "REJECT", "EDIT", "DEPENDS", "UNSURE"],
                "depends_requires_condition": True,
                "owner_response_present": False,
                "owner_review_status": "UNREVIEWED",
                "owner_review_required": True,
                "gold_admission": False,
                "allowed_for_training": False,
                "heldout_eligible": False,
            }
        )

    source_record = {
        "version": "manual-owner-evidence.source.v1",
        "processed_at": processed_at,
        "source_id": source_id,
        "source_family_id": family_id,
        "source_class": "HIGH_INFORMATION_AUTHENTIC_PERSONAL_SOURCE",
        "source_scope": "EVIDENCE_BEARING_MESSAGES_ONLY",
        "owner_assertions": [
            {
                **row,
                "normative_preference": False,
                "model_feature_eligible": False,
                "owner_review_completed": False,
                "allowed_for_training": False,
            }
            for row in normalized["assertions"]
        ],
        "alias_timeline": normalized["alias_timeline"],
        "register_slice": normalized["register_slice"],
        "crocodile_hypothesis_family": normalized["crocodile"],
        "humour_mechanisms": payload.get("humour_mechanisms", []),
        "gold_admission_status": "PENDING_OWNER_CORRECTION",
        "owner_review_completed": False,
        "allowed_for_training": False,
        "training_authorized": False,
    }
    screenshot_record = {
        "version": "manual-owner-evidence.screenshots.v1",
        "source_id": source_id,
        "source_family_id": family_id,
        "raw_screenshots_local_only": True,
        "portable": False,
        "screenshots": screenshot_manifest,
    }
    hypothesis_record = {
        "version": "manual-owner-evidence.hypotheses.v1",
        "source_id": source_id,
        "source_family_id": family_id,
        "hypotheses": hypothesis_rows,
        "crocodile_hypothesis_family": normalized["crocodile"],
        "humour_mechanisms": payload.get("humour_mechanisms", []),
        "register_slice": normalized["register_slice"],
        "owner_review_completed": False,
        "allowed_for_training": False,
    }
    correction_record = {
        "version": "manual-owner-evidence.correction-seed.v1",
        "source_id": source_id,
        "source_family_id": family_id,
        "artifact_role": "DEFERRED_ERROR_DRIVEN_CORRECTION_SEED",
        "not_a_j1a_correction_pack": True,
        "questions": correction_rows,
        "owner_review_completed": False,
        "gold_admitted": False,
        "allowed_for_training": False,
    }
    source_envelope = {
        "version": "r30j1c.manual-owner-evidence-source.v1",
        "status": "OWNER_CORRECTION_PENDING",
        "artifact_class": "MANUAL_HIGH_VALUE_OWNER_EVIDENCE_SOURCE",
        "local_only": True,
        "must_remain_ignored": True,
        "portable_public_safe": False,
        "contains_owner_specific_values": True,
        "owner_review_completed": False,
        "gold_admission_status": "PENDING_OWNER_CORRECTION",
        "profile_frozen": False,
        "allowed_for_training": False,
        "training_authorized": False,
        "source_family": {
            "source_family_ref": family_ref,
            "document_group_ref": family_ref,
            "idea_group_ref": family_ref,
            "family_group_ref": family_ref,
        },
        "evidence_class_counts": {
            "current_explicit_owner_assertion": len(normalized["assertions"]),
            "owner_chat_direct": len(message_rows),
            "peer_reception": len(peer_rows),
            "peer_playful_mythology": len(mythology_rows),
        },
        "privacy_receipt": {
            "raw_assets_local_only": True,
            "raw_assets_tracked": False,
            "raw_excerpts_tracked": False,
            "private_paths_tracked": False,
            "content_hashes_tracked": False,
            "deidentification_complete": normalized["privacy_review"]["manual_review_completed"],
            "quote_blocks_separated": normalized["privacy_review"]["quote_blocks_separated"],
            "third_party_identifiers_removed": normalized["privacy_review"]["third_party_identifiers_removed"],
            "third_party_body_optimizer_eligible": False,
            "sensitive_values_persisted_in_receipt": False,
        },
        "authorship_receipt": {
            "owner_chat_authorship_class": "OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE",
            "owner_chat_attestation_kind": "OWNER_SUPPLIED_CHAT_SCREENSHOT_RECORD",
            "owner_attestation_present": True,
            "direct_body_attribution_pass": True,
            "quoted_text_owner_admissible": False,
            "peer_text_owner_admissible": False,
            "peer_reception_normative": False,
            "playful_mythology_owner_identity_truth": False,
            "raw_mixed_container_training_eligible": False,
        },
        "split_receipt": {
            "one_conversation_one_family": True,
            "owner_utterances_share_family": True,
            "derived_variants_share_family": True,
            "peer_annotations_share_family": True,
            "correction_items_share_family": True,
            "cross_split_family_leakage": False,
            "heldout_eligible": False,
        },
        "hypothesis_receipt": {
            "source_specific_hypotheses_tracked": False,
            "descriptive_promoted_to_normative": False,
            "peer_convergence_promoted_to_preference": False,
            "owner_review_required": True,
            "runtime_modes_created": False,
            "actual_profile_values_present": False,
        },
        "correction_pack_receipt": {
            "correction_item_count": len(correction_rows),
            "actual_question_text_tracked": False,
            "owner_responses_present": False,
            "same_source_family": True,
            "owner_review_required": True,
            "gold_admission": False,
            "allowed_for_training": False,
        },
        "training_state": {
            "training_started": False,
            "optimizer_tokens": 0,
            "assistant_target_tokens": 0,
            "classification_updates": 0,
            "checkpoint": None,
            "candidate": None,
        },
    }
    privacy_split_receipt = {
        "version": "manual-owner-evidence.privacy-split-receipt.v1",
        "source_id": source_id,
        "source_family_id": family_id,
        "source_family_count": 1,
        "source_split": "UNASSIGNED",
        "all_owner_messages_same_family": len({row["source_family_id"] for row in message_rows}) == 1,
        "all_peer_annotations_same_family": len({row["source_family_id"] for row in peer_rows + mythology_rows}) <= 1,
        "future_variants_must_share_family": True,
        "future_corrections_must_share_family": True,
        "raw_screenshots_local_only": True,
        "derived_peer_speakers_anonymized": all(
            ANONYMOUS_PEER_ID.fullmatch(row["peer_speaker_id"]) is not None
            for row in peer_rows + mythology_rows
        ),
        "third_party_avatars_excluded_from_derived_text": normalized["privacy_review"]["avatars_removed_from_derived"],
        "third_party_usernames_excluded_from_derived_text": normalized["privacy_review"]["third_party_identifiers_removed"],
        "exact_chat_timestamps_excluded_from_derived_text": normalized["privacy_review"]["exact_timestamps_removed"],
        "quoted_blocks_separated": normalized["privacy_review"]["quote_blocks_separated"],
        "quote_only_owner_attributions_unverified": True,
        "full_third_party_transcript_reconstructed": False,
        "manual_privacy_review_completed": normalized["privacy_review"]["manual_review_completed"],
        "direct_owner_sensitive_content_detected": normalized["privacy_review"]["direct_owner_sensitive_content_detected"],
        "sensitive_sections_excluded_count": normalized["privacy_review"]["sensitive_sections_excluded_count"],
        "sensitive_content_values_reported": False,
        "owner_review_completed": False,
        "gold_admitted": False,
        "allowed_for_training": False,
        "training_authorized": False,
    }

    aggregate = {
        "version": "manual-owner-evidence.aggregate-receipt.v1",
        "source_family_count": 1,
        "screenshot_count": len(screenshot_manifest),
        "direct_owner_message_count": len(message_rows),
        "owner_quote_block_count": quoted_block_count,
        "owner_message_without_quote_count": len(message_rows) - quoted_block_count,
        "owner_non_text_event_count": len(normalized["non_text_events"]),
        "quoted_owner_attribution_unverified_count": len(quoted_owner_rows),
        "peer_reception_evidence_count": len(peer_rows),
        "peer_playful_mythology_count": len(mythology_rows),
        "candidate_hypothesis_count": len(hypothesis_rows),
        "correction_question_count": len(correction_rows),
        "all_peer_evidence_normative_weight_zero": all(row["normative_preference"] is False for row in peer_rows + mythology_rows),
        "all_peer_evidence_training_false": all(row["allowed_for_training"] is False for row in peer_rows + mythology_rows),
        "all_outputs_single_source_family": True,
        "owner_review_completed": False,
        "gold_admitted": False,
        "allowed_for_training": False,
        "training_authorized": False,
        "training_started": False,
    }

    # Cross-contract proof runs before any final receipt is written.  This is
    # intentionally redundant with input validation: the generated artifact,
    # not merely the input, must satisfy the public generic contract.
    validate_source_envelope(source_envelope)
    for record in owner_assertion_records:
        validate_owner_assertion(record)
    validate_alias_timeline(alias_timeline_record)
    for record in canonical_message_rows:
        validate_deidentified_message(record)
    for record in peer_evidence_records:
        validate_peer_evidence(record)
    for record in canonical_hypothesis_rows:
        validate_hypothesis(record)
    for record in correction_rows:
        validate_correction_item(record)

    canonical_message_refs = {record["message_id"] for record in canonical_message_rows}
    peer_evidence_refs = {record["evidence_id"] for record in peer_evidence_records}
    hypothesis_refs = {record["hypothesis_id"] for record in canonical_hypothesis_rows}
    resolvable_evidence_refs = canonical_message_refs | peer_evidence_refs
    _require(
        all(record["source_message_ref"] in canonical_message_refs for record in peer_evidence_records),
        "peer_source_message_ref_unresolved",
    )
    _require(
        all(set(record["evidence_refs"]).issubset(resolvable_evidence_refs) for record in canonical_hypothesis_rows),
        "hypothesis_evidence_ref_unresolved",
    )
    _require(
        all(set(record["target_hypothesis_refs"]).issubset(hypothesis_refs) for record in correction_rows),
        "correction_hypothesis_ref_unresolved",
    )
    _require(
        all(set(record["evidence_refs"]).issubset(resolvable_evidence_refs) for record in correction_rows),
        "correction_evidence_ref_unresolved",
    )
    validate_single_source_family(
        family_ref,
        [
            *owner_assertion_records,
            *canonical_message_rows,
            *peer_evidence_records,
            *canonical_hypothesis_rows,
            *correction_rows,
        ],
    )
    public_safe_receipt = aggregate_public_receipt(source_envelope)

    _atomic_json(output_root / "source_record.json", source_record)
    _atomic_json(output_root / "source_envelope.json", source_envelope)
    _atomic_jsonl(output_root / "owner_assertions.jsonl", owner_assertion_records)
    _atomic_json(output_root / "alias_timeline.json", alias_timeline_record)
    _atomic_json(output_root / "screenshots_manifest.json", screenshot_record)
    _atomic_jsonl(output_root / "messages.jsonl", message_rows)
    _atomic_jsonl(output_root / "deidentified_messages.jsonl", canonical_message_rows)
    _atomic_jsonl(output_root / "owner_utterance_index.jsonl", owner_index)
    _atomic_jsonl(output_root / "non_text_owner_events.jsonl", [
        {
            **row,
            "source_id": source_id,
            "source_family_id": family_id,
            "owner_review_completed": False,
            "allowed_for_training": False,
            "split": "UNASSIGNED",
        }
        for row in normalized["non_text_events"]
    ])
    _atomic_jsonl(output_root / "quoted_owner_attributions.jsonl", quoted_owner_rows)
    _atomic_jsonl(output_root / "peer_reception_evidence.jsonl", peer_rows)
    _atomic_jsonl(output_root / "peer_playful_mythology.jsonl", mythology_rows)
    _atomic_jsonl(output_root / "peer_evidence_ledger.jsonl", peer_evidence_records)
    _atomic_json(output_root / "hypotheses.json", hypothesis_record)
    _atomic_jsonl(output_root / "hypothesis_candidates.jsonl", canonical_hypothesis_rows)
    _atomic_json(output_root / "correction_seed_pack.json", correction_record)
    _atomic_jsonl(output_root / "correction_items.jsonl", correction_rows)
    _atomic_json(output_root / "privacy_and_split_receipt.json", privacy_split_receipt)
    _atomic_json(output_root / "reports" / "intake_summary.json", aggregate)
    _atomic_json(output_root / "reports" / "public_safe_receipt.json", public_safe_receipt)
    return aggregate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--image-map", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        aggregate = ingest(args.input, args.image_map, args.output)
    except (ValueError, json.JSONDecodeError, OSError) as exc:
        # Do not echo exception text: parser and filesystem exceptions may
        # contain source excerpts or machine-local paths.
        error_code = "input_contract_failed" if isinstance(exc, ValueError) else "local_ingestion_failed"
        print(
            json.dumps(
                {
                    "status": "BLOCKED",
                    "error_code": error_code,
                    "exception_class": type(exc).__name__,
                },
                sort_keys=True,
            )
        )
        return 2
    print(json.dumps({"status": "READY", **aggregate}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
