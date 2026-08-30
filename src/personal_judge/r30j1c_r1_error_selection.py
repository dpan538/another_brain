"""Fail-closed R30J1C-R1 selection of J1A DEV correction evidence.

The module is intentionally generic.  It contains no owner text, source ID,
private path, model output, or historical campaign artifact.  Populated inputs
and outputs belong below the ignored ``artifacts/r30j1c`` tree.

Only frozen J1A DEV rows, explicit per-example DEV predictions, and validated
DEV shortcut pairs are accepted.  A path or record that could be heldout,
sealed, blind, or final-evaluation material is rejected before content is used.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from typing import Any


DOMAIN_LABELS = (
    "AUTHENTIC_OWNER",
    "CONTROLLED_OWNER_STYLE_VARIANT",
    "GENERIC_ASSISTANT",
    "OTHER_PUBLIC_SAFE",
)

REGISTER_LABELS = (
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

COARSE_REGISTER = {
    "ordinary_chat": "CASUAL",
    "casual_banter": "CASUAL",
    "weird_question": "PLAYFUL",
    "absurd_meta_ai": "PLAYFUL",
    "creative_play": "PLAYFUL",
    "roleplay": "PLAYFUL",
    "practical_advice": "TECHNICAL",
    "technical_explanation": "TECHNICAL",
    "debugging": "TECHNICAL",
    "project_discussion": "TECHNICAL",
    "academic_discussion": "TECHNICAL",
    "philosophy": "REFLECTIVE",
    "personal_reflection": "REFLECTIVE",
    "light_emotional": "MIXED",
    "formal_message": "FORMAL",
}

ITEM_KINDS = (
    "AUTHENTIC_OWNER_FALSE_NEGATIVE",
    "CONTROLLED_GENERIC_FALSE_POSITIVE",
    "REGISTER_CONFUSION",
    "SHORTCUT_PAIR",
)

SHORTCUT_FAMILIES = (
    "LENGTH",
    "PUNCTUATION",
    "BULLET_USE",
    "GENERIC_ASSISTANT_PHRASING",
)

SOURCE_ARMS = ("A", "B", "C", "D")

INFORMATION_GAIN_COMPONENTS = {
    "model_confidence",
    "model_error_severity",
    "shortcut_suspicion",
    "persona_uncertainty",
    "register_boundary",
    "historical_evidence_conflict",
    "potential_training_value",
}

SELECTED_FIELDS = {
    "schema_version",
    "selection_id",
    "session_id",
    "item_kind",
    "source_role",
    "source_arm",
    "supporting_source_arms",
    "source_record_ref",
    "source_family",
    "semantic_family",
    "mutation_family",
    "source_kind",
    "domain_true",
    "domain_predicted",
    "register_true",
    "register_predicted",
    "coarse_register_true",
    "coarse_register_predicted",
    "model_confidence",
    "error_severity",
    "shortcut_family",
    "pair_member_refs",
    "display_payload_ref",
    "display_payload",
    "information_gain_components",
    "priority_score",
    "heldout_used",
    "privacy_review",
    "selection_reason",
    "review_may_disclose_authenticity",
    "provenance_hidden_in_review",
    "gold_admission",
    "allowed_for_training",
}

DEFAULT_TARGET_COUNTS = {
    "AUTHENTIC_OWNER_FALSE_NEGATIVE": 6,
    "CONTROLLED_GENERIC_FALSE_POSITIVE": 6,
    "REGISTER_CONFUSION": 4,
    "SHORTCUT_PAIR": 3,
}

MINIMUM_COUNTS = {
    "AUTHENTIC_OWNER_FALSE_NEGATIVE": 5,
    "CONTROLLED_GENERIC_FALSE_POSITIVE": 5,
    "REGISTER_CONFUSION": 4,
    "SHORTCUT_PAIR": 2,
}

MAXIMUM_COUNTS = {
    "AUTHENTIC_OWNER_FALSE_NEGATIVE": 6,
    "CONTROLLED_GENERIC_FALSE_POSITIVE": 6,
    "REGISTER_CONFUSION": 4,
    "SHORTCUT_PAIR": 4,
}

_FORBIDDEN_PATH_TOKEN = re.compile(
    r"(?:^|[._-])(heldout|sealed|blind|final[._-]?(?:eval|evaluation))(?:$|[._-])",
    re.IGNORECASE,
)
_OPAQUE_REF = re.compile(r"^local\.[a-z0-9_.-]+\.[a-f0-9]{32,64}$")
_PREDICTION_FILENAME = re.compile(r"^dev_predictions(?:_[a-d])?\.jsonl$")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_DIAGNOSTIC_RECEIPT_FIELDS = {
    "bytes",
    "sha256",
    "source_role",
    "split",
    "heldout_opened",
    "heldout_used",
    "derived_from_heldout",
    "producer_campaign",
    "producer_checkpoint_refs",
    "architecture_id",
}


class SelectionError(ValueError):
    """A bounded source-integrity or selection-contract failure."""


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise SelectionError(code)


def _probability(value: Any, code: str) -> float:
    _require(
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
        and 0.0 <= float(value) <= 1.0,
        code,
    )
    return float(value)


def _nonempty(value: Any, code: str) -> str:
    _require(isinstance(value, str) and bool(value.strip()), code)
    return str(value)


def _opaque(namespace: str, *parts: str) -> str:
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()
    return f"local.{namespace}.{digest}"


@dataclass(frozen=True)
class _SourceSnapshot:
    """One immutable read used for parsing and every integrity comparison."""

    path: Path
    content: bytes
    size: int
    sha256: str


def _absolute_without_resolving(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def _allowed_macos_system_alias(path: Path) -> bool:
    """Allow only Apple's fixed root aliases, never a project-owned symlink."""

    if sys.platform != "darwin" or not path.is_symlink():
        return False
    expected = {
        Path("/etc"): Path("/private/etc"),
        Path("/tmp"): Path("/private/tmp"),
        Path("/var"): Path("/private/var"),
    }.get(path)
    if expected is None:
        return False
    try:
        return path.resolve(strict=True) == expected
    except OSError:
        return False


def _absolute_components(path: Path) -> Iterable[Path]:
    current = Path(path.anchor)
    yield current
    for part in path.parts[1:]:
        current /= part
        yield current


def _reject_symlink_chain(path: Path, *, source_root: Path | None = None) -> None:
    """Reject symlinks inside the caller-selected source boundary.

    macOS system aliases such as /var -> /private/var are outside that
    boundary and are not treated as source-controlled path components.
    """

    if source_root is None:
        for current in _absolute_components(path):
            if current.exists() or current.is_symlink():
                _require(
                    not current.is_symlink() or _allowed_macos_system_alias(current),
                    "source_symlink_forbidden",
                )
        return
    root = _absolute_without_resolving(source_root)
    _require(not root.is_symlink(), "source_symlink_forbidden")
    try:
        relative = path.relative_to(root)
    except ValueError as exc:
        raise SelectionError("source_outside_exact_root") from exc
    current = root
    for part in relative.parts:
        current /= part
        if current.exists() or current.is_symlink():
            _require(not current.is_symlink(), "source_symlink_forbidden")


def _reject_forbidden_parts(path: Path) -> None:
    parts = tuple(part.casefold() for part in path.parts)
    _require(not any(_FORBIDDEN_PATH_TOKEN.search(part) for part in parts), "forbidden_source_path")


def reject_forbidden_source_path(
    path: Path,
    *,
    source_root: Path | None = None,
    expected_name: str | None = None,
) -> Path:
    """Preflight a source without following a symlink or leaving its root."""

    lexical = _absolute_without_resolving(path)
    _reject_forbidden_parts(lexical)
    _reject_symlink_chain(lexical, source_root=source_root)
    _require(lexical.exists(), "source_file_missing")
    _require(lexical.is_file(), "source_must_be_regular_file")
    _require(not lexical.is_symlink(), "source_symlink_forbidden")
    if expected_name is not None:
        _require(lexical.name == expected_name, "source_filename_not_allowlisted")
    resolved = lexical.resolve(strict=True)
    _reject_forbidden_parts(resolved)
    if source_root is not None:
        trusted_root = _absolute_without_resolving(source_root)
        _reject_forbidden_parts(trusted_root)
        _reject_symlink_chain(trusted_root)
        _require(trusted_root.is_dir() and not trusted_root.is_symlink(), "source_root_invalid")
        trusted_resolved = trusted_root.resolve(strict=True)
        _reject_forbidden_parts(trusted_resolved)
        _require(resolved.parent == trusted_resolved, "source_outside_exact_root")
    return resolved


def _preflight_source_root(root: Path) -> Path:
    lexical = _absolute_without_resolving(root)
    _reject_forbidden_parts(lexical)
    _reject_symlink_chain(lexical)
    _require(lexical.is_dir() and not lexical.is_symlink(), "source_root_invalid")
    resolved = lexical.resolve(strict=True)
    _reject_forbidden_parts(resolved)
    return resolved


def _read_source_snapshot(path: Path) -> _SourceSnapshot:
    """Read once, then bind the bytes to the preflighted regular file."""

    safe = reject_forbidden_source_path(path)
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(safe, flags)
    try:
        before = os.fstat(descriptor)
        _require(stat.S_ISREG(before.st_mode), "source_must_be_regular_file")
        chunks: list[bytes] = []
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    _require(
        (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
        == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
        "source_changed_during_read",
    )
    content = b"".join(chunks)
    _require(len(content) == after.st_size, "source_changed_during_read")

    # Recheck the complete lexical chain and verify that the path still names
    # the descriptor we read.  This is metadata-only; content is not reopened.
    post_safe = reject_forbidden_source_path(safe)
    post = os.stat(post_safe, follow_symlinks=False)
    _require(
        post_safe == safe
        and stat.S_ISREG(post.st_mode)
        and (post.st_dev, post.st_ino, post.st_size, post.st_mtime_ns, post.st_ctime_ns)
        == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
        "source_changed_after_read",
    )
    return _SourceSnapshot(
        path=safe,
        content=content,
        size=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )


def _read_json(snapshot: _SourceSnapshot) -> dict[str, Any]:
    payload = json.loads(snapshot.content.decode("utf-8"))
    _require(isinstance(payload, dict), "json_input_must_be_object")
    return payload


def _read_jsonl(snapshot: _SourceSnapshot) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(snapshot.content.decode("utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        value = json.loads(line)
        _require(isinstance(value, dict), f"jsonl_row_must_be_object:{line_number}")
        rows.append(value)
    _require(bool(rows), "jsonl_input_empty")
    return rows


def _require_dev_boundary(record: Mapping[str, Any], label: str) -> None:
    _require(record.get("split") == "dev", f"{label}_split_must_be_dev")
    _require(record.get("heldout_opened") is False, f"{label}_heldout_opened_must_be_false")
    _require(record.get("heldout_used") is False, f"{label}_heldout_used_must_be_false")
    _require(record.get("derived_from_heldout") is False, f"{label}_derived_from_heldout_must_be_false")


def _validate_diagnostic_receipt(
    receipt: Any,
    *,
    snapshot: _SourceSnapshot,
    source_role: str,
) -> None:
    _require(isinstance(receipt, Mapping), "diagnostic_receipt_missing")
    _require(set(receipt) == _DIAGNOSTIC_RECEIPT_FIELDS, "diagnostic_receipt_fields_invalid")
    _require(receipt.get("source_role") == source_role, "diagnostic_receipt_role_invalid")
    _require(receipt.get("split") == "dev", "diagnostic_receipt_split_invalid")
    for key in ("heldout_opened", "heldout_used", "derived_from_heldout"):
        _require(receipt.get(key) is False, f"diagnostic_receipt_{key}_invalid")
    _require(receipt.get("producer_campaign") == "R30J1A", "diagnostic_producer_campaign_invalid")
    checkpoint_refs = receipt.get("producer_checkpoint_refs")
    _require(
        isinstance(checkpoint_refs, list)
        and bool(checkpoint_refs)
        and len(checkpoint_refs) == len(set(checkpoint_refs))
        and all(isinstance(value, str) and value.startswith("local.") for value in checkpoint_refs),
        "diagnostic_checkpoint_binding_invalid",
    )
    _nonempty(receipt.get("architecture_id"), "diagnostic_architecture_binding_invalid")
    _require(int(receipt.get("bytes", -1)) == snapshot.size, "diagnostic_bytes_mismatch")
    _require(
        isinstance(receipt.get("sha256"), str)
        and _SHA256.fullmatch(str(receipt["sha256"])) is not None
        and receipt.get("sha256") == snapshot.sha256,
        "diagnostic_sha256_mismatch",
    )


def validate_dataset_manifest(
    manifest: Mapping[str, Any],
    dev_snapshot: _SourceSnapshot,
    *,
    prediction_snapshots: Sequence[_SourceSnapshot],
    shortcut_pair_snapshot: _SourceSnapshot,
) -> None:
    _require(manifest.get("schema_version") == "r30j1a.dataset-manifest.v1", "dataset_manifest_version_invalid")
    _require(manifest.get("permanent_heldout_opened") is False, "dataset_manifest_heldout_opened")
    _require(manifest.get("heldout_used_for_architecture_selection") is False, "dataset_manifest_heldout_selection")
    _require(manifest.get("heldout_used_for_early_stopping") is False, "dataset_manifest_heldout_early_stop")
    files = manifest.get("files")
    _require(isinstance(files, Mapping), "dataset_manifest_files_invalid")
    dev_receipt = files.get("dev.jsonl")
    _require(isinstance(dev_receipt, Mapping), "dataset_manifest_dev_receipt_missing")
    _require(dev_snapshot.path.name == "dev.jsonl", "dataset_input_must_be_named_dev_jsonl")
    _require(int(dev_receipt.get("bytes", -1)) == dev_snapshot.size, "dataset_dev_bytes_mismatch")
    _require(dev_receipt.get("sha256") == dev_snapshot.sha256, "dataset_dev_sha256_mismatch")
    diagnostics = manifest.get("diagnostic_files")
    _require(isinstance(diagnostics, Mapping), "diagnostic_manifest_missing")
    expected_names = {snapshot.path.name for snapshot in prediction_snapshots} | {
        shortcut_pair_snapshot.path.name
    }
    _require(set(diagnostics) == expected_names, "diagnostic_manifest_file_set_mismatch")
    for snapshot in prediction_snapshots:
        _validate_diagnostic_receipt(
            diagnostics.get(snapshot.path.name),
            snapshot=snapshot,
            source_role="J1A_DEV_DIAGNOSTIC",
        )
    _validate_diagnostic_receipt(
        diagnostics.get(shortcut_pair_snapshot.path.name),
        snapshot=shortcut_pair_snapshot,
        source_role="J1A_SHORTCUT_AUDIT",
    )


def validate_dev_row(record: Mapping[str, Any]) -> None:
    required = {
        "example_id",
        "source_kind",
        "source_ref",
        "source_group_id",
        "semantic_family_id",
        "mutation_family_id",
        "domain_label",
        "register_label",
        "context",
        "response",
        "public_safe",
        "normative_label",
        "personal_fit_label",
        "persona_mode_label",
        "allowed_for_training",
    }
    _require(required <= set(record), "dev_row_missing_required_fields")
    for key in ("example_id", "source_ref", "source_group_id", "semantic_family_id", "mutation_family_id"):
        _nonempty(record.get(key), f"dev_row_{key}_invalid")
    _require(record.get("source_kind") in {
        "owner_transcript", "owner_controlled_variant", "public_safe_dialogue", "public_controlled_generic"
    }, "dev_row_source_kind_invalid")
    _require(record.get("domain_label") in DOMAIN_LABELS, "dev_row_domain_invalid")
    expected_source_kind = {
        "AUTHENTIC_OWNER": "owner_transcript",
        "CONTROLLED_OWNER_STYLE_VARIANT": "owner_controlled_variant",
        "GENERIC_ASSISTANT": "public_controlled_generic",
        "OTHER_PUBLIC_SAFE": "public_safe_dialogue",
    }[str(record["domain_label"])]
    _require(record.get("source_kind") == expected_source_kind, "dev_row_domain_source_kind_mismatch")
    _require(record.get("register_label") in REGISTER_LABELS, "dev_row_register_invalid")
    _nonempty(record.get("context"), "dev_row_context_invalid")
    _nonempty(record.get("response"), "dev_row_response_invalid")
    _require(record.get("public_safe") is True, "dev_row_not_public_safe")
    _require(record.get("normative_label") is False, "dev_row_normative_forbidden")
    _require(record.get("personal_fit_label") is False, "dev_row_personal_fit_forbidden")
    _require(record.get("persona_mode_label") is False, "dev_row_persona_mode_forbidden")
    _require(record.get("allowed_for_training") is True, "dev_row_training_admission_invalid")


PREDICTION_FIELDS = {
    "schema_version",
    "split",
    "heldout_opened",
    "heldout_used",
    "derived_from_heldout",
    "source_role",
    "source_arm",
    "example_id",
    "domain_truth",
    "domain_predicted",
    "domain_confidence",
    "register_truth",
    "register_predicted",
    "register_confidence",
    "shortcut_suspicion",
    "historical_evidence_conflict",
}


def validate_prediction(record: Mapping[str, Any], dev_row: Mapping[str, Any]) -> None:
    _require(set(record) == PREDICTION_FIELDS, "prediction_fields_invalid")
    _require(record.get("schema_version") == "r30j1a.dev-prediction.v1", "prediction_version_invalid")
    _require_dev_boundary(record, "prediction")
    _require(record.get("source_role") == "J1A_DEV_DIAGNOSTIC", "prediction_source_role_invalid")
    _require(record.get("source_arm") in SOURCE_ARMS, "prediction_source_arm_invalid")
    _require(record.get("example_id") == dev_row.get("example_id"), "prediction_example_mismatch")
    _require(record.get("domain_truth") == dev_row.get("domain_label"), "prediction_domain_truth_mismatch")
    _require(record.get("register_truth") == dev_row.get("register_label"), "prediction_register_truth_mismatch")
    _require(record.get("domain_predicted") in DOMAIN_LABELS, "prediction_domain_invalid")
    _require(record.get("register_predicted") in REGISTER_LABELS, "prediction_register_invalid")
    for key in ("domain_confidence", "register_confidence", "shortcut_suspicion", "historical_evidence_conflict"):
        _probability(record.get(key), f"prediction_{key}_invalid")


SHORTCUT_PAIR_FIELDS = {
    "schema_version",
    "split",
    "heldout_opened",
    "heldout_used",
    "derived_from_heldout",
    "source_role",
    "source_arm",
    "pair_id",
    "example_id",
    "source_group_id",
    "semantic_family_id",
    "mutation_family_id",
    "register_label",
    "shortcut_family",
    "context",
    "response_a",
    "response_b",
    "model_prediction_changed",
    "confidence_delta",
    "shortcut_audit_supported",
    "semantic_preservation_validated",
    "factual_compatibility_validated",
    "protected_values_preserved",
    "only_shortcut_dimension_differs",
    "public_safe",
    "contains_third_party_identity",
    "third_party_text_used_as_owner_prose",
}


def validate_shortcut_pair(record: Mapping[str, Any], dev_row: Mapping[str, Any] | None = None) -> None:
    _require(set(record) == SHORTCUT_PAIR_FIELDS, "shortcut_pair_fields_invalid")
    _require(record.get("schema_version") == "r30j1a.dev-shortcut-pair.v1", "shortcut_pair_version_invalid")
    _require_dev_boundary(record, "shortcut_pair")
    _require(record.get("source_role") == "J1A_SHORTCUT_AUDIT", "shortcut_pair_source_role_invalid")
    _require(record.get("source_arm") in SOURCE_ARMS, "shortcut_pair_source_arm_invalid")
    for key in ("pair_id", "example_id", "source_group_id", "semantic_family_id", "mutation_family_id"):
        _nonempty(record.get(key), f"shortcut_pair_{key}_invalid")
    _require(record.get("register_label") in REGISTER_LABELS, "shortcut_pair_register_invalid")
    _require(record.get("shortcut_family") in SHORTCUT_FAMILIES, "shortcut_pair_family_invalid")
    for key in ("context", "response_a", "response_b"):
        _nonempty(record.get(key), f"shortcut_pair_{key}_invalid")
    _require(record.get("response_a") != record.get("response_b"), "shortcut_pair_responses_must_differ")
    for key in (
        "shortcut_audit_supported",
        "semantic_preservation_validated",
        "factual_compatibility_validated",
        "protected_values_preserved",
        "only_shortcut_dimension_differs",
        "public_safe",
    ):
        _require(record.get(key) is True, f"shortcut_pair_{key}_must_be_true")
    _require(record.get("contains_third_party_identity") is False, "shortcut_pair_third_party_identity_forbidden")
    _require(
        record.get("third_party_text_used_as_owner_prose") is False,
        "shortcut_pair_third_party_owner_prose_forbidden",
    )
    _require(isinstance(record.get("model_prediction_changed"), bool), "shortcut_pair_model_change_invalid")
    _probability(record.get("confidence_delta"), "shortcut_pair_confidence_delta_invalid")
    if dev_row is not None:
        for pair_key, dev_key in (
            ("example_id", "example_id"),
            ("source_group_id", "source_group_id"),
            ("semantic_family_id", "semantic_family_id"),
            ("mutation_family_id", "mutation_family_id"),
            ("register_label", "register_label"),
            ("context", "context"),
        ):
            _require(record.get(pair_key) == dev_row.get(dev_key), f"shortcut_pair_{pair_key}_dev_mismatch")
        _require(
            dev_row.get("response") in {record.get("response_a"), record.get("response_b")},
            "shortcut_pair_missing_manifest_bound_response",
        )


def load_source_inputs(
    *,
    manifest_path: Path,
    dev_path: Path,
    prediction_paths: Sequence[Path],
    shortcut_pair_path: Path,
    trusted_manifest_sha256: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, str]]:
    """Load only manifest-bound DEV evidence and return its local hashes."""

    source_root = _absolute_without_resolving(manifest_path).parent
    _preflight_source_root(source_root)
    manifest_safe = reject_forbidden_source_path(
        manifest_path, source_root=source_root, expected_name="dataset_manifest.json"
    )
    _require(
        isinstance(trusted_manifest_sha256, str)
        and _SHA256.fullmatch(trusted_manifest_sha256) is not None,
        "trusted_producer_manifest_anchor_missing",
    )
    dev_safe = reject_forbidden_source_path(dev_path, source_root=source_root, expected_name="dev.jsonl")
    shortcut_safe = reject_forbidden_source_path(
        shortcut_pair_path, source_root=source_root, expected_name="dev_shortcut_pairs.jsonl"
    )
    prediction_safe = []
    for path in prediction_paths:
        lexical_name = _absolute_without_resolving(path).name
        _require(_PREDICTION_FILENAME.fullmatch(lexical_name) is not None, "prediction_filename_not_allowlisted")
        prediction_safe.append(
            reject_forbidden_source_path(path, source_root=source_root, expected_name=lexical_name)
        )
    _require(bool(prediction_safe), "prediction_inputs_required")
    _require(len({path.name for path in prediction_safe}) == len(prediction_safe), "duplicate_prediction_filename")

    # Each source is opened exactly once.  Hash checks and parsers consume the
    # same immutable snapshots, so a file cannot be validated and then swapped
    # before parsing.
    manifest_snapshot = _read_source_snapshot(manifest_safe)
    _require(
        manifest_snapshot.sha256 == trusted_manifest_sha256,
        "trusted_producer_manifest_anchor_mismatch",
    )
    dev_snapshot = _read_source_snapshot(dev_safe)
    prediction_snapshots = [_read_source_snapshot(path) for path in prediction_safe]
    shortcut_snapshot = _read_source_snapshot(shortcut_safe)

    manifest = _read_json(manifest_snapshot)
    validate_dataset_manifest(
        manifest,
        dev_snapshot,
        prediction_snapshots=prediction_snapshots,
        shortcut_pair_snapshot=shortcut_snapshot,
    )
    dev_rows = _read_jsonl(dev_snapshot)
    dev_by_id: dict[str, dict[str, Any]] = {}
    for row in dev_rows:
        validate_dev_row(row)
        example_id = str(row["example_id"])
        _require(example_id not in dev_by_id, "duplicate_dev_example_id")
        dev_by_id[example_id] = row

    predictions: list[dict[str, Any]] = []
    seen_prediction: set[tuple[str, str]] = set()
    for snapshot in prediction_snapshots:
        for row in _read_jsonl(snapshot):
            example_id = str(row.get("example_id", ""))
            _require(example_id in dev_by_id, "prediction_unknown_dev_example")
            validate_prediction(row, dev_by_id[example_id])
            key = (str(row["source_arm"]), example_id)
            _require(key not in seen_prediction, "duplicate_arm_example_prediction")
            seen_prediction.add(key)
            predictions.append(row)

    shortcut_pairs = _read_jsonl(shortcut_snapshot)
    pair_ids: set[str] = set()
    for pair in shortcut_pairs:
        example_id = str(pair.get("example_id", ""))
        _require(example_id in dev_by_id, "shortcut_pair_unknown_dev_example")
        validate_shortcut_pair(pair, dev_by_id[example_id])
        pair_id = str(pair["pair_id"])
        _require(pair_id not in pair_ids, "duplicate_shortcut_pair_id")
        pair_ids.add(pair_id)

    hashes = {
        "dataset_manifest_sha256": manifest_snapshot.sha256,
        "dev_sha256": dev_snapshot.sha256,
        "prediction_set_sha256": hashlib.sha256(
            "\n".join(sorted(snapshot.sha256 for snapshot in prediction_snapshots)).encode("ascii")
        ).hexdigest(),
        "shortcut_pairs_sha256": shortcut_snapshot.sha256,
    }
    return dev_rows, predictions, shortcut_pairs, hashes


def _score_components(
    *,
    model_confidence: float,
    error_severity: float,
    shortcut_suspicion: float,
    register_boundary: float,
    historical_evidence_conflict: float,
    potential_training_value: float = 1.0,
) -> dict[str, float]:
    components = {
        "model_confidence": model_confidence,
        "model_error_severity": error_severity,
        "shortcut_suspicion": shortcut_suspicion,
        "persona_uncertainty": 0.0,
        "register_boundary": register_boundary,
        "historical_evidence_conflict": historical_evidence_conflict,
        "potential_training_value": potential_training_value,
    }
    return {key: round(value, 8) for key, value in components.items()}


def _priority_score(components: Mapping[str, float]) -> float:
    weights = {
        "model_confidence": 0.25,
        "model_error_severity": 0.20,
        "shortcut_suspicion": 0.15,
        "persona_uncertainty": 0.05,
        "register_boundary": 0.15,
        "historical_evidence_conflict": 0.10,
        "potential_training_value": 0.10,
    }
    return round(sum(float(components[key]) * weights[key] for key in weights), 8)


def _prediction_groups(predictions: Sequence[Mapping[str, Any]]) -> dict[str, list[Mapping[str, Any]]]:
    grouped: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in predictions:
        grouped[str(row["example_id"])].append(row)
    return grouped


def _single_candidate(
    *,
    item_kind: str,
    dev_row: Mapping[str, Any],
    evidence: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    if item_kind == "AUTHENTIC_OWNER_FALSE_NEGATIVE":
        wrong = [row for row in evidence if row["domain_truth"] == "AUTHENTIC_OWNER" and row["domain_predicted"] != "AUTHENTIC_OWNER"]
        severity = 1.0
    elif item_kind == "CONTROLLED_GENERIC_FALSE_POSITIVE":
        wrong = [row for row in evidence if row["domain_truth"] != "AUTHENTIC_OWNER" and row["domain_predicted"] == "AUTHENTIC_OWNER"]
        severity = 1.0
    elif item_kind == "REGISTER_CONFUSION":
        wrong = [
            row for row in evidence
            if row["register_truth"] != row["register_predicted"]
            and COARSE_REGISTER[str(row["register_truth"])] != COARSE_REGISTER[str(row["register_predicted"])]
        ]
        severity = 0.85
    else:
        raise SelectionError("single_candidate_kind_invalid")
    _require(bool(wrong), "single_candidate_without_supporting_error")
    primary = max(
        wrong,
        key=lambda row: (
            float(row["domain_confidence"] if item_kind != "REGISTER_CONFUSION" else row["register_confidence"]),
            str(row["source_arm"]),
        ),
    )
    confidence_key = "register_confidence" if item_kind == "REGISTER_CONFUSION" else "domain_confidence"
    confidence = float(primary[confidence_key])
    register_boundary = float(
        COARSE_REGISTER[str(primary["register_truth"])] != COARSE_REGISTER[str(primary["register_predicted"])]
    )
    shortcut_suspicion = max(float(row["shortcut_suspicion"]) for row in wrong)
    conflict = max(float(row["historical_evidence_conflict"]) for row in wrong)
    components = _score_components(
        model_confidence=confidence,
        error_severity=severity,
        shortcut_suspicion=shortcut_suspicion,
        register_boundary=register_boundary,
        historical_evidence_conflict=conflict,
    )
    example_id = str(dev_row["example_id"])
    source_group = str(dev_row["source_group_id"])
    semantic_family = str(dev_row["semantic_family_id"])
    mutation_family = str(dev_row["mutation_family_id"])
    return {
        "schema_version": "r30j1c-r1.j1a-source-selection.v1",
        "selection_id": _opaque("j1a.selection", item_kind, example_id),
        "session_id": "session1_model_errors",
        "item_kind": item_kind,
        "source_role": "J1A_DEV_DIAGNOSTIC",
        "source_arm": str(primary["source_arm"]),
        "supporting_source_arms": sorted({str(row["source_arm"]) for row in wrong}),
        "source_record_ref": _opaque("j1a.record", str(dev_row["source_ref"]), example_id),
        "source_family": _opaque("j1a.source-family", source_group),
        "semantic_family": _opaque("j1a.semantic-family", semantic_family),
        "mutation_family": _opaque("j1a.mutation-family", mutation_family),
        "source_kind": str(dev_row["source_kind"]),
        "domain_true": str(primary["domain_truth"]),
        "domain_predicted": str(primary["domain_predicted"]),
        "register_true": str(primary["register_truth"]),
        "register_predicted": str(primary["register_predicted"]),
        "coarse_register_true": COARSE_REGISTER[str(primary["register_truth"])],
        "coarse_register_predicted": COARSE_REGISTER[str(primary["register_predicted"])],
        "model_confidence": round(confidence, 8),
        "error_severity": severity,
        "shortcut_family": None,
        "pair_member_refs": [],
        "display_payload_ref": _opaque("j1a.payload", item_kind, example_id),
        "display_payload": {
            "context": str(dev_row["context"]),
            "response": str(dev_row["response"]),
        },
        "information_gain_components": components,
        "priority_score": _priority_score(components),
        "heldout_used": False,
        "privacy_review": "PASS",
        "selection_reason": {
            "AUTHENTIC_OWNER_FALSE_NEGATIVE": "high_information_authentic_owner_domain_error",
            "CONTROLLED_GENERIC_FALSE_POSITIVE": "high_information_owner_like_false_positive",
            "REGISTER_CONFUSION": "major_coarse_register_confusion",
        }[item_kind],
        "review_may_disclose_authenticity": item_kind == "AUTHENTIC_OWNER_FALSE_NEGATIVE",
        "provenance_hidden_in_review": True,
        "gold_admission": False,
        "allowed_for_training": False,
    }


def _shortcut_candidate(record: Mapping[str, Any]) -> dict[str, Any]:
    validate_shortcut_pair(record)
    confidence = float(record["confidence_delta"])
    components = _score_components(
        model_confidence=confidence,
        error_severity=0.75 if record["model_prediction_changed"] else 0.55,
        shortcut_suspicion=1.0,
        register_boundary=0.0,
        historical_evidence_conflict=0.5,
    )
    pair_id = str(record["pair_id"])
    source_group = str(record["source_group_id"])
    semantic_family = str(record["semantic_family_id"])
    mutation_family = str(record["mutation_family_id"])
    return {
        "schema_version": "r30j1c-r1.j1a-source-selection.v1",
        "selection_id": _opaque("j1a.selection", "SHORTCUT_PAIR", pair_id),
        "session_id": "session1_model_errors",
        "item_kind": "SHORTCUT_PAIR",
        "source_role": "J1A_SHORTCUT_AUDIT",
        "source_arm": str(record["source_arm"]),
        "supporting_source_arms": [str(record["source_arm"])],
        "source_record_ref": _opaque("j1a.record", str(record["example_id"]), pair_id),
        "source_family": _opaque("j1a.source-family", source_group),
        "semantic_family": _opaque("j1a.semantic-family", semantic_family),
        "mutation_family": _opaque("j1a.mutation-family", mutation_family),
        "source_kind": "shortcut_audit_pair",
        "domain_true": None,
        "domain_predicted": None,
        "register_true": str(record["register_label"]),
        "register_predicted": None,
        "coarse_register_true": COARSE_REGISTER[str(record["register_label"])],
        "coarse_register_predicted": None,
        "model_confidence": round(confidence, 8),
        "error_severity": 0.75 if record["model_prediction_changed"] else 0.55,
        "shortcut_family": str(record["shortcut_family"]),
        "pair_member_refs": [
            _opaque("j1a.pair-member", pair_id, "A"),
            _opaque("j1a.pair-member", pair_id, "B"),
        ],
        "display_payload_ref": _opaque("j1a.payload", "SHORTCUT_PAIR", pair_id),
        "display_payload": {
            "context": str(record["context"]),
            "response_a": str(record["response_a"]),
            "response_b": str(record["response_b"]),
        },
        "information_gain_components": components,
        "priority_score": _priority_score(components),
        "heldout_used": False,
        "privacy_review": "PASS",
        "selection_reason": "validated_shortcut_audit_pair",
        "review_may_disclose_authenticity": False,
        "provenance_hidden_in_review": True,
        "gold_admission": False,
        "allowed_for_training": False,
    }


def build_candidates(
    dev_rows: Sequence[Mapping[str, Any]],
    predictions: Sequence[Mapping[str, Any]],
    shortcut_pairs: Sequence[Mapping[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    dev_by_id: dict[str, Mapping[str, Any]] = {}
    for row in dev_rows:
        validate_dev_row(row)
        example_id = str(row["example_id"])
        _require(example_id not in dev_by_id, "duplicate_dev_example_id")
        dev_by_id[example_id] = row
    for prediction in predictions:
        example_id = str(prediction.get("example_id", ""))
        _require(example_id in dev_by_id, "prediction_unknown_dev_example")
        validate_prediction(prediction, dev_by_id[example_id])
    for pair in shortcut_pairs:
        example_id = str(pair.get("example_id", ""))
        _require(example_id in dev_by_id, "shortcut_pair_unknown_dev_example")
        validate_shortcut_pair(pair, dev_by_id[example_id])
    grouped = _prediction_groups(predictions)
    result: dict[str, list[dict[str, Any]]] = {kind: [] for kind in ITEM_KINDS}
    for example_id, evidence in grouped.items():
        row = dev_by_id[example_id]
        for item_kind in ITEM_KINDS[:3]:
            try:
                candidate = _single_candidate(item_kind=item_kind, dev_row=row, evidence=evidence)
            except SelectionError as exc:
                if str(exc) != "single_candidate_without_supporting_error":
                    raise
            else:
                result[item_kind].append(candidate)
    result["SHORTCUT_PAIR"] = [_shortcut_candidate(row) for row in shortcut_pairs]
    for kind in ITEM_KINDS:
        result[kind].sort(key=lambda row: (-float(row["priority_score"]), str(row["selection_id"])))
    return result


def _greedy_select(
    candidates: Sequence[Mapping[str, Any]],
    *,
    count: int,
    used_records: set[str],
    used_semantics: set[str],
    source_family_counts: Counter[str],
    maximum_per_source_family: int,
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for candidate in candidates:
        record_ref = str(candidate["source_record_ref"])
        semantic = str(candidate["semantic_family"])
        source_family = str(candidate["source_family"])
        if record_ref in used_records or semantic in used_semantics:
            continue
        if source_family_counts[source_family] >= maximum_per_source_family:
            continue
        selected.append(dict(candidate))
        used_records.add(record_ref)
        used_semantics.add(semantic)
        source_family_counts[source_family] += 1
        if len(selected) == count:
            break
    return selected


def select_session1_source_pool(
    candidates: Mapping[str, Sequence[Mapping[str, Any]]],
    *,
    target_counts: Mapping[str, int] = DEFAULT_TARGET_COUNTS,
    maximum_per_source_family: int = 2,
) -> list[dict[str, Any]]:
    _require(set(target_counts) == set(ITEM_KINDS), "target_count_kinds_invalid")
    for kind in ITEM_KINDS:
        count = int(target_counts[kind])
        _require(MINIMUM_COUNTS[kind] <= count <= MAXIMUM_COUNTS[kind], f"target_count_out_of_range:{kind}")
    _require(18 <= sum(int(value) for value in target_counts.values()) <= 20, "session1_target_total_out_of_range")
    _require(maximum_per_source_family >= 1, "source_family_cap_invalid")

    selected: list[dict[str, Any]] = []
    used_records: set[str] = set()
    used_semantics: set[str] = set()
    family_counts: Counter[str] = Counter()
    for kind in ITEM_KINDS:
        chosen = _greedy_select(
            candidates.get(kind, ()),
            count=int(target_counts[kind]),
            used_records=used_records,
            used_semantics=used_semantics,
            source_family_counts=family_counts,
            maximum_per_source_family=maximum_per_source_family,
        )
        _require(len(chosen) == int(target_counts[kind]), f"insufficient_diverse_candidates:{kind}")
        selected.extend(chosen)
    _require(18 <= len(selected) <= 20, "selected_session1_total_out_of_range")
    validate_selected_pool(selected, target_counts=target_counts, maximum_per_source_family=maximum_per_source_family)
    return selected


def validate_selected_pool(
    rows: Sequence[Mapping[str, Any]],
    *,
    target_counts: Mapping[str, int] | None = None,
    maximum_per_source_family: int = 2,
) -> None:
    _require(18 <= len(rows) <= 20, "selected_pool_size_invalid")
    ids: set[str] = set()
    record_refs: set[str] = set()
    semantic_refs: set[str] = set()
    family_counts: Counter[str] = Counter()
    kind_counts: Counter[str] = Counter()
    for row in rows:
        _require(set(row) == SELECTED_FIELDS, "selected_fields_invalid")
        _require(row.get("schema_version") == "r30j1c-r1.j1a-source-selection.v1", "selected_version_invalid")
        _require(row.get("session_id") == "session1_model_errors", "selected_session_invalid")
        _require(row.get("item_kind") in ITEM_KINDS, "selected_kind_invalid")
        _require(row.get("source_role") in {"J1A_DEV_DIAGNOSTIC", "J1A_SHORTCUT_AUDIT"}, "selected_source_role_invalid")
        _require(row.get("source_arm") in SOURCE_ARMS, "selected_source_arm_invalid")
        _require(row.get("heldout_used") is False, "selected_heldout_used")
        _require(row.get("privacy_review") == "PASS", "selected_privacy_review_invalid")
        _require(row.get("provenance_hidden_in_review") is True, "selected_provenance_must_be_hidden")
        _require(row.get("gold_admission") is False, "selected_gold_admission_forbidden")
        _require(row.get("allowed_for_training") is False, "selected_training_forbidden")
        _probability(row.get("model_confidence"), "selected_model_confidence_invalid")
        _probability(row.get("error_severity"), "selected_error_severity_invalid")
        _probability(row.get("priority_score"), "selected_priority_score_invalid")
        information_gain = row.get("information_gain_components")
        _require(isinstance(information_gain, Mapping), "selected_information_gain_invalid")
        _require(set(information_gain) == INFORMATION_GAIN_COMPONENTS, "selected_information_gain_fields_invalid")
        for key in INFORMATION_GAIN_COMPONENTS:
            _probability(information_gain.get(key), f"selected_information_gain_invalid:{key}")
        supporting_arms = row.get("supporting_source_arms")
        _require(
            isinstance(supporting_arms, list)
            and bool(supporting_arms)
            and len(supporting_arms) == len(set(supporting_arms))
            and all(arm in SOURCE_ARMS for arm in supporting_arms),
            "selected_supporting_arms_invalid",
        )
        _require(row.get("source_arm") in supporting_arms, "selected_primary_arm_not_supported")
        display_payload = row.get("display_payload")
        _require(isinstance(display_payload, Mapping), "selected_display_payload_invalid")
        _require(all(isinstance(value, str) and bool(value.strip()) for value in display_payload.values()), "selected_display_text_invalid")
        selection_id = str(row.get("selection_id", ""))
        record_ref = str(row.get("source_record_ref", ""))
        semantic_ref = str(row.get("semantic_family", ""))
        source_family = str(row.get("source_family", ""))
        for value in (selection_id, record_ref, semantic_ref, source_family, str(row.get("display_payload_ref", ""))):
            _require(_OPAQUE_REF.fullmatch(value) is not None, "selected_reference_not_opaque")
        _require(selection_id not in ids, "duplicate_selection_id")
        _require(record_ref not in record_refs, "duplicate_source_record_selection")
        _require(semantic_ref not in semantic_refs, "duplicate_semantic_family_selection")
        ids.add(selection_id)
        record_refs.add(record_ref)
        semantic_refs.add(semantic_ref)
        family_counts[source_family] += 1
        kind = str(row["item_kind"])
        kind_counts[kind] += 1
        if kind == "AUTHENTIC_OWNER_FALSE_NEGATIVE":
            _require(row.get("domain_true") == "AUTHENTIC_OWNER", "selected_false_negative_truth_invalid")
            _require(row.get("domain_predicted") != "AUTHENTIC_OWNER", "selected_false_negative_prediction_invalid")
            _require(row.get("review_may_disclose_authenticity") is True, "selected_false_negative_disclosure_invalid")
        elif kind == "CONTROLLED_GENERIC_FALSE_POSITIVE":
            _require(row.get("domain_true") != "AUTHENTIC_OWNER", "selected_false_positive_truth_invalid")
            _require(row.get("domain_predicted") == "AUTHENTIC_OWNER", "selected_false_positive_prediction_invalid")
            _require(row.get("review_may_disclose_authenticity") is False, "selected_false_positive_disclosure_invalid")
        elif kind == "REGISTER_CONFUSION":
            _require(row.get("coarse_register_true") != row.get("coarse_register_predicted"), "selected_register_confusion_not_major")
        else:
            _require(row.get("shortcut_family") in SHORTCUT_FAMILIES, "selected_shortcut_family_invalid")
            _require(len(row.get("pair_member_refs", ())) == 2, "selected_shortcut_pair_members_invalid")
            _require(
                all(_OPAQUE_REF.fullmatch(str(value)) is not None for value in row["pair_member_refs"]),
                "selected_shortcut_pair_reference_invalid",
            )
    _require(max(family_counts.values(), default=0) <= maximum_per_source_family, "selected_source_family_cap_exceeded")
    if target_counts is not None:
        _require(dict(kind_counts) == dict(target_counts), "selected_kind_counts_mismatch")


def build_receipt(
    *,
    candidates: Mapping[str, Sequence[Mapping[str, Any]]],
    selected: Sequence[Mapping[str, Any]],
    source_hashes: Mapping[str, str],
    maximum_per_source_family: int,
) -> dict[str, Any]:
    selected_counts = Counter(str(row["item_kind"]) for row in selected)
    arm_counts = Counter(str(row["source_arm"]) for row in selected)
    source_counts = Counter(str(row["source_family"]) for row in selected)
    register_counts = Counter(str(row["coarse_register_true"]) for row in selected)
    return {
        "schema_version": "r30j1c-r1.j1a-source-pool-receipt.v1",
        "status": "READY",
        "source_scope": "J1A_TRAIN_DEV_DIAGNOSTIC_ONLY",
        "session_id": "session1_model_errors",
        "available_counts": {kind: len(candidates.get(kind, ())) for kind in ITEM_KINDS},
        "selected_counts": {kind: selected_counts[kind] for kind in ITEM_KINDS},
        "selected_total": len(selected),
        "source_arm_counts": dict(sorted(arm_counts.items())),
        "distinct_source_family_count": len(source_counts),
        "maximum_selected_from_one_source_family": max(source_counts.values(), default=0),
        "maximum_per_source_family_contract": maximum_per_source_family,
        "coarse_register_counts": dict(sorted(register_counts.items())),
        "source_hashes": dict(source_hashes),
        "owner_text_in_receipt": False,
        "source_identity_visible_in_review": False,
        "model_probability_visible_in_review": False,
        "heldout_path_opened": False,
        "heldout_used": False,
        "heldout_derived_content_used": False,
        "sealed_evaluation_used": False,
        "privacy_review": "PASS",
        "gold_admission": False,
        "allowed_for_training": False,
        "training_started": False,
        "optimizer_tokens": 0,
        "classification_updates": 0,
        "assistant_target_tokens": 0,
        "api_requests": 0,
    }


def _atomic_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_source_pool(output_root: Path, rows: Sequence[Mapping[str, Any]], receipt: Mapping[str, Any]) -> None:
    validate_selected_pool(rows, maximum_per_source_family=int(receipt["maximum_per_source_family_contract"]))
    _atomic_text(
        output_root / "j1a_selected_source_rows.jsonl",
        "".join(json.dumps(dict(row), ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in rows),
    )
    _atomic_text(
        output_root / "j1a_source_pool_receipt.json",
        json.dumps(dict(receipt), ensure_ascii=False, sort_keys=True, indent=2) + "\n",
    )
