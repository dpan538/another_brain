#!/usr/bin/env python3
"""Prepare a bounded P2/manual evidence pool for R30J1C-R1.

Only exact allow-listed files are read.  In particular, this program never
discovers, opens, samples, or hashes an R30J1A heldout file.  Source text and
owner values remain in ignored, mode-0600 artifacts; stdout is aggregate only.
"""

from __future__ import annotations

import argparse
from collections.abc import Iterable, Mapping, Sequence
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from typing import Any

import sys


ROOT = Path(__file__).resolve().parents[1]
LOCAL_OUTPUT_PARENT = (ROOT / "artifacts" / "r30j1c" / "owner_correction_pack").resolve()
CONFIG_PATH = ROOT / "config" / "r30j1c_r1_owner_correction_pack_v1.json"
DEFAULT_P2_ROOT = ROOT / "artifacts" / "r30j0" / "persona_excavation"
DEFAULT_MANUAL_ROOT = ROOT / "artifacts" / "r30j1c" / "manual_owner_evidence" / "current"

sys.path.insert(0, str(ROOT))
from src.personal_judge.r30j1c_manual_evidence_contract import (  # noqa: E402
    validate_correction_item,
    validate_deidentified_message,
    validate_hypothesis,
    validate_peer_evidence,
    validate_single_source_family,
    validate_source_envelope,
)
from src.personal_judge.r30j1c_r1_persona_sources import (  # noqa: E402
    POOL_VERSION,
    REGISTER_CODES,
    ROW_VERSION,
    PersonaSourceIntegrityError,
    aggregate_counts,
    information_signals,
    opaque_ref,
    priority_from_signals,
    reject_heldout_reference,
    validate_pool_document,
    validate_source_row,
)


P2_REQUIRED_FILES = (
    "reports/final_terminal.json",
    "reports/persona_excavation_summary.json",
    "persona_microtraits.json",
    "persona_mode_hypotheses.json",
    "persona_antipatterns.json",
    "persona_contradiction_ledger.json",
    "persona_elicitation_linkage.json",
    "elicitation_pack_v2.json",
)

MANUAL_REQUIRED_FILES = (
    "source_envelope.json",
    "deidentified_messages.jsonl",
    "peer_evidence_ledger.jsonl",
    "hypothesis_candidates.jsonl",
    "correction_items.jsonl",
    "privacy_and_split_receipt.json",
    "reports/intake_summary.json",
)

P2_TERMINAL = "R30J0_P2_PERSONA_EXCAVATION_READY"
# The manual intake preserves the owner-supplied nine-theme order.  Adjacent
# pairs are bundled only as review targets; their local questions remain
# separate and no shared normative answer is inferred.
MANUAL_CLUSTER_GROUPS = ((0, 1), (2, 3), (4,), (5, 6), (7, 8))
MAX_P2_UNRESOLVED = 6
MAX_P2_MICROTRAITS = 10
MAX_P2_MODES = 4
MAX_P2_ANTIPATTERNS = 8
MAX_P2_CONTRADICTIONS = 7
READY_PERSONA_SOURCE_ADAPTER_AUTHORIZED = False

_SAFE_CODE_PART = re.compile(r"[^A-Za-z0-9._:-]+")


def _require(condition: bool, code: str) -> None:
    if not condition:
        raise PersonaSourceIntegrityError(code)


def _safe_code(value: Any, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback
    normalized = _SAFE_CODE_PART.sub("_", value.strip()).strip("_.:-")
    if len(normalized) < 3:
        return fallback
    return normalized[:159]


def _absolute_without_resolving(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def _preflight_source_tree(
    root: Path,
    relative_paths: Sequence[str],
    *,
    require_all: bool,
) -> Path:
    """Validate the exact source tree before opening any source content."""

    lexical = _absolute_without_resolving(root)
    reject_heldout_reference(str(lexical))
    current = Path(lexical.anchor)
    system_aliases = {Path(lexical.anchor, "var"), Path(lexical.anchor, "tmp")}
    for part in lexical.parts[1:]:
        current /= part
        if current.exists() or current.is_symlink():
            _require(
                not current.is_symlink() or current in system_aliases,
                "source_root_parent_symlink_forbidden",
            )
    _require(lexical.is_dir() and not lexical.is_symlink(), "source_root_missing_or_symlinked")
    resolved = lexical.resolve(strict=True)
    reject_heldout_reference(str(resolved))
    for relative in relative_paths:
        candidate = lexical / relative
        current = lexical
        for part in Path(relative).parts:
            current /= part
            if current.exists() or current.is_symlink():
                _require(not current.is_symlink(), "source_path_symlink_forbidden")
        if not candidate.exists():
            _require(not require_all, "required_source_missing")
            continue
        _require(candidate.is_file() and not candidate.is_symlink(), "required_source_missing")
        target = candidate.resolve(strict=True)
        reject_heldout_reference(str(target))
        try:
            target.relative_to(resolved)
        except ValueError as exc:
            raise PersonaSourceIntegrityError("source_path_outside_exact_root") from exc
    return resolved


def _read_json(path: Path) -> dict[str, Any]:
    _require(path.is_file() and not path.is_symlink(), "required_source_missing")
    value = json.loads(path.read_text(encoding="utf-8"))
    _require(isinstance(value, dict), "source_json_object_required")
    reject_heldout_reference(value)
    return value


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    _require(path.is_file() and not path.is_symlink(), "required_source_missing")
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        value = json.loads(line)
        _require(isinstance(value, dict), "source_jsonl_object_required")
        reject_heldout_reference(value)
        rows.append(value)
    return rows


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _source_snapshot(root: Path, relative_paths: Sequence[str]) -> dict[str, str]:
    return {relative: _sha256(root / relative) for relative in relative_paths}


def source_manifest_sha(root: Path, relative_paths: Sequence[str]) -> str:
    """Hash exact allow-listed source files as one immutable logical manifest."""

    root = _preflight_source_tree(root, relative_paths, require_all=True)
    rows = [
        {
            "logical_path": relative,
            "bytes": (root / relative).stat().st_size,
            "sha256": _sha256(root / relative),
        }
        for relative in relative_paths
    ]
    encoded = json.dumps(rows, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _assert_source_roots(p2_root: Path, manual_root: Path) -> None:
    _preflight_source_tree(p2_root, P2_REQUIRED_FILES, require_all=False)
    _preflight_source_tree(manual_root, MANUAL_REQUIRED_FILES, require_all=False)


def _required_presence(root: Path, relative_paths: Sequence[str]) -> tuple[int, int]:
    present = sum((root / relative).is_file() and not (root / relative).is_symlink() for relative in relative_paths)
    return present, len(relative_paths)


def _atomic_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(text)
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
    material = "".join(
        json.dumps(dict(row), ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
        for row in rows
    )
    _atomic_text(path, material)


def remove_stale_ready_outputs(output_root: Path) -> None:
    """Remove only adapter-owned READY artifacts, preserving fixed blockers."""

    resolved = output_root.resolve()
    try:
        resolved.relative_to(LOCAL_OUTPUT_PARENT)
    except ValueError as exc:
        raise PersonaSourceIntegrityError("output_outside_local_private_root") from exc
    ready_files = (
        "persona_source_pool.json",
        "source_rows.jsonl",
        "source_locator_map.jsonl",
        "source_audit.json",
        "source_pool_receipt.json",
    )
    for filename in ready_files:
        candidate = resolved / filename
        try:
            info = candidate.lstat()
        except FileNotFoundError:
            continue
        _require(
            stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode),
            "stale_ready_artifact_not_file",
        )
        candidate.unlink()


def _review_ref(value: str, source: str) -> str:
    return opaque_ref("review", source, value)


def _family_refs(evidence_refs: Any, bundle_ref: str, source: str) -> list[str]:
    values = evidence_refs if isinstance(evidence_refs, list) else []
    result = [opaque_ref("family", source, str(value)) for value in values if isinstance(value, str)]
    return list(dict.fromkeys(result)) or [bundle_ref]


def _base_row(
    *,
    source_kind: str,
    source_bundle_ref: str,
    source_identifier: str,
    source_family_refs: Sequence[str],
    eligible_sessions: Sequence[str],
    register_codes: Sequence[str],
    dimension_codes: Sequence[str],
    review_refs: Sequence[str],
    signals: Mapping[str, float],
    local_review_payload: Mapping[str, Any],
    contains_private_text: bool,
) -> dict[str, Any]:
    sessions = list(dict.fromkeys(eligible_sessions))
    registers = [value for value in dict.fromkeys(register_codes) if value in REGISTER_CODES]
    dimensions = [_safe_code(value, "unresolved_dimension") for value in dict.fromkeys(dimension_codes)]
    refs = list(dict.fromkeys(review_refs))
    _require(sessions, "source_row_sessions_required")
    _require(registers, "source_row_registers_required")
    _require(dimensions, "source_row_dimensions_required")
    _require(refs, "source_row_review_refs_required")
    row = {
        "version": ROW_VERSION,
        "pool_ref": opaque_ref("pool", source_kind, source_identifier),
        "source_kind": source_kind,
        "source_bundle_ref": source_bundle_ref,
        "source_target_ref": opaque_ref("target", source_kind, source_identifier),
        "source_family_refs": list(dict.fromkeys(source_family_refs)),
        "eligible_sessions": sessions,
        "register_codes": registers,
        "dimension_codes": dimensions,
        "review_refs": refs,
        "information_signals": dict(signals),
        "priority_score": priority_from_signals(signals),
        "local_review_payload": copy.deepcopy(dict(local_review_payload)),
        "contains_private_text": contains_private_text,
        "owner_review_required": True,
        "normative_status": "UNRESOLVED",
        "gold_admission": False,
        "allowed_for_training": False,
        "heldout_eligible": False,
    }
    validate_source_row(row)
    return row


def _p2_linkage_index(linkage: Mapping[str, Any]) -> dict[tuple[str, str], list[str]]:
    _require(linkage.get("status") == "OWNER_REVIEW_LINKAGE_READY", "p2_linkage_status_invalid")
    _require(linkage.get("unresolved_target_refs") == [], "p2_linkage_has_unresolved_target")
    uncovered = linkage.get("uncovered_high_value_target_counts")
    _require(
        isinstance(uncovered, Mapping)
        and all(isinstance(value, int) and not isinstance(value, bool) and value == 0 for value in uncovered.values()),
        "p2_high_value_linkage_incomplete",
    )
    index: dict[tuple[str, str], list[str]] = {}
    entries = linkage.get("entries")
    _require(isinstance(entries, list) and entries, "p2_linkage_entries_required")
    for entry in entries:
        _require(isinstance(entry, Mapping), "p2_linkage_entry_invalid")
        target_type = entry.get("target_type")
        target_id = entry.get("target_id")
        refs = entry.get("review_item_refs")
        _require(isinstance(target_type, str) and isinstance(target_id, str), "p2_linkage_target_invalid")
        _require(isinstance(refs, list) and refs, "p2_linkage_review_refs_required")
        _require(entry.get("owner_review_required") is True, "p2_linkage_owner_review_required")
        _require(entry.get("allowed_for_training") is False, "p2_linkage_training_forbidden")
        key = (target_type, target_id)
        _require(key not in index, "p2_linkage_target_duplicate")
        index[key] = [str(value) for value in refs]
    return index


def _p2_row_guard(row: Mapping[str, Any], *, raw_excerpt_key: str | None = None) -> None:
    _require(row.get("owner_review_required") is True, "p2_owner_review_required")
    _require(row.get("allowed_for_training") is False, "p2_training_must_be_false")
    if raw_excerpt_key:
        _require(row.get(raw_excerpt_key) is False, "p2_raw_excerpt_forbidden")
    reject_heldout_reference(row)


def _select_diverse(rows: Sequence[dict[str, Any]], family_key: str, limit: int) -> list[dict[str, Any]]:
    ordered = sorted(
        rows,
        key=lambda row: (
            row.get("owner_review_status") != "UNREVIEWED",
            -(float(row.get("confidence", 0.0)) if isinstance(row.get("confidence"), (int, float)) else 0.0),
            str(row.get(family_key, "")),
            str(row),
        ),
    )
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in ordered:
        family = str(row.get(family_key, "unknown"))
        if family not in seen:
            selected.append(row)
            seen.add(family)
        if len(selected) == limit:
            return selected
    for row in ordered:
        if row not in selected:
            selected.append(row)
        if len(selected) == limit:
            break
    return selected


def load_p2_source_pool(p2_root: Path) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    """Audit and select a bounded P2 source pool."""

    p2_root = _preflight_source_tree(p2_root, P2_REQUIRED_FILES, require_all=True)
    terminal = _read_json(p2_root / "reports/final_terminal.json")
    summary = _read_json(p2_root / "reports/persona_excavation_summary.json")
    micro_doc = _read_json(p2_root / "persona_microtraits.json")
    mode_doc = _read_json(p2_root / "persona_mode_hypotheses.json")
    anti_doc = _read_json(p2_root / "persona_antipatterns.json")
    contradiction_doc = _read_json(p2_root / "persona_contradiction_ledger.json")
    linkage = _read_json(p2_root / "persona_elicitation_linkage.json")
    elicitation = _read_json(p2_root / "elicitation_pack_v2.json")

    terminal_state = terminal.get("phase_terminal_state", terminal.get("terminal_state"))
    _require(terminal_state == P2_TERMINAL, "p2_terminal_state_invalid")
    for key in ("training_started", "owner_review_completed", "profile_frozen"):
        _require(summary.get(key) is False, f"p2_summary_{key}_must_be_false")
    promoted = summary.get("descriptive_promoted_to_normative_count")
    _require(
        isinstance(promoted, int) and not isinstance(promoted, bool) and promoted == 0,
        "p2_descriptive_normative_promotion",
    )

    microtraits = micro_doc.get("entries")
    modes = mode_doc.get("modes")
    antipatterns = anti_doc.get("entries")
    contradictions = contradiction_doc.get("entries")
    for rows, code in (
        (microtraits, "p2_microtraits_invalid"),
        (modes, "p2_modes_invalid"),
        (antipatterns, "p2_antipatterns_invalid"),
        (contradictions, "p2_contradictions_invalid"),
    ):
        _require(isinstance(rows, list) and rows, code)
    _require(len(microtraits) == summary.get("microtrait_hypothesis_count"), "p2_microtrait_count_mismatch")
    _require(len(modes) == summary.get("persona_mode_hypothesis_count"), "p2_mode_count_mismatch")
    _require(len(antipatterns) == summary.get("antipattern_count"), "p2_antipattern_count_mismatch")
    _require(len(contradictions) == summary.get("contradiction_count"), "p2_contradiction_count_mismatch")
    _require(len(microtraits) >= 40, "p2_microtrait_floor_not_met")

    link_index = _p2_linkage_index(linkage)
    bundle_ref = opaque_ref("bundle", "p2")
    rows: list[dict[str, Any]] = []
    locators: list[dict[str, Any]] = []

    decision_items = elicitation.get("decision_items")
    _require(isinstance(decision_items, list) and decision_items, "p2_elicitation_items_required")
    unresolved_candidates = [
        item for item in decision_items
        if isinstance(item, Mapping)
        and item.get("blind_repeat") is False
        and item.get("owner_review_required") is True
        and item.get("allowed_for_training") is False
        and (
            item.get("task_type") in {"open_ended", "open_ended_question", "scenario_pair"}
            or item.get("section") in {"open_ended_answers", "contradictions", "final_grammar_review", "high_information"}
        )
    ]
    unresolved_candidates.sort(key=lambda item: (int(item.get("information_gain_rank", 10_000)), str(item.get("item_id", ""))))
    for item in unresolved_candidates[:MAX_P2_UNRESOLVED]:
        item_id = str(item["item_id"])
        register = item.get("register") if item.get("register") in REGISTER_CODES else "ordinary_chat"
        signals = information_signals(
            persona_uncertainty=0.95,
            register_boundary=0.85,
            historical_evidence_conflict=0.65 if item.get("section") == "contradictions" else 0.35,
            potential_training_value=0.9,
        )
        target_refs = item.get("target_refs") if isinstance(item.get("target_refs"), list) else []
        family_refs = [
            opaque_ref("family", "p2-target", str(ref.get("target_type")), str(ref.get("target_id")))
            for ref in target_refs if isinstance(ref, Mapping)
        ] or [bundle_ref]
        dimensions = [
            _safe_code(item.get("underlying_decision_family"), "unresolved_decision"),
            *[_safe_code(value, "unresolved_dimension") for value in item.get("discriminates", []) if isinstance(value, str)],
        ]
        source_row = _base_row(
            source_kind="P2_UNRESOLVED_REVIEW_ITEM",
            source_bundle_ref=bundle_ref,
            source_identifier=item_id,
            source_family_refs=family_refs,
            eligible_sessions=["SESSION_2", "SESSION_4", "SESSION_5"],
            register_codes=[register],
            dimension_codes=dimensions,
            review_refs=[_review_ref(item_id, "p2")],
            signals=signals,
            local_review_payload={
                "task_type": item.get("task_type"),
                "section": item.get("section"),
                "prompt_local": item.get("prompt"),
                "candidate_count": len(item.get("candidates", [])) if isinstance(item.get("candidates"), list) else 0,
            },
            contains_private_text=True,
        )
        rows.append(source_row)
        locators.append({"pool_ref": source_row["pool_ref"], "source_role": "elicitation_decision_item", "source_record_key_local": item_id})

    selected_microtraits = _select_diverse(microtraits, "dimension_family", MAX_P2_MICROTRAITS)
    for item in selected_microtraits:
        _p2_row_guard(item, raw_excerpt_key="contains_raw_excerpt")
        item_id = str(item["microtrait_id"])
        refs = link_index.get(("microtrait", item_id))
        _require(refs is not None, "p2_microtrait_review_linkage_missing")
        registers = item.get("compatible_registers") or ["ordinary_chat"]
        signals = information_signals(
            persona_uncertainty=0.85,
            register_boundary=0.9 if item.get("forbidden_registers") else 0.65,
            historical_evidence_conflict=0.2,
            potential_training_value=0.85,
        )
        source_row = _base_row(
            source_kind="P2_MICROTRAIT",
            source_bundle_ref=bundle_ref,
            source_identifier=item_id,
            source_family_refs=_family_refs(item.get("evidence_refs"), bundle_ref, "p2"),
            eligible_sessions=["SESSION_2", "SESSION_4", "SESSION_5"],
            register_codes=registers,
            dimension_codes=[str(item.get("dimension_family", "unresolved_dimension")), str(item.get("behaviour_code", "unresolved_behaviour"))],
            review_refs=[_review_ref(value, "p2") for value in refs],
            signals=signals,
            local_review_payload={
                "observable_behaviour": item.get("observable_behaviour"),
                "trigger_positive": item.get("trigger_positive"),
                "trigger_negative": item.get("trigger_negative"),
                "forbidden_registers": item.get("forbidden_registers"),
                "epistemic_category": item.get("epistemic_category"),
            },
            contains_private_text=True,
        )
        rows.append(source_row)
        locators.append({"pool_ref": source_row["pool_ref"], "source_role": "persona_microtrait", "source_record_key_local": item_id})

    selected_modes = sorted(
        modes,
        key=lambda item: (
            item.get("seed_status") != "OWNER_ASSERTED_SEED",
            item.get("boundary_status") != "BOUNDARY_NOT_YET_KNOWN",
            -int(item.get("contradiction_count", 0)),
            str(item.get("mode_id", "")),
        ),
    )[:MAX_P2_MODES]
    for item in selected_modes:
        _p2_row_guard(item)
        item_id = str(item["mode_id"])
        refs = link_index.get(("mode", item_id))
        _require(refs is not None, "p2_mode_review_linkage_missing")
        is_owner_seed = item.get("seed_status") == "OWNER_ASSERTED_SEED"
        sessions = ["SESSION_3", "SESSION_4", "SESSION_5"] if is_owner_seed else ["SESSION_2", "SESSION_4"]
        signals = information_signals(
            persona_uncertainty=1.0 if item.get("boundary_status") == "BOUNDARY_NOT_YET_KNOWN" else 0.75,
            register_boundary=0.95,
            historical_evidence_conflict=min(1.0, float(item.get("contradiction_count", 0)) / 3),
            potential_training_value=0.9,
        )
        source_row = _base_row(
            source_kind="P2_MODE",
            source_bundle_ref=bundle_ref,
            source_identifier=item_id,
            source_family_refs=_family_refs(item.get("evidence_refs"), bundle_ref, "p2"),
            eligible_sessions=sessions,
            register_codes=item.get("compatible_registers") or ["ordinary_chat"],
            dimension_codes=[str(item.get("mode_code", "unresolved_mode")), str(item.get("epistemic_category") or "non_epistemic_mode")],
            review_refs=[_review_ref(value, "p2") for value in refs],
            signals=signals,
            local_review_payload={
                "mode_description": item.get("mode_description"),
                "boundary_status": item.get("boundary_status"),
                "trigger_positive": item.get("trigger_positive"),
                "trigger_negative": item.get("trigger_negative"),
                "forbidden_registers": item.get("forbidden_registers"),
                "fallback_mode": item.get("fallback_mode"),
            },
            contains_private_text=True,
        )
        rows.append(source_row)
        locators.append({"pool_ref": source_row["pool_ref"], "source_role": "persona_mode", "source_record_key_local": item_id})

    for item in contradictions[:MAX_P2_CONTRADICTIONS]:
        _p2_row_guard(item)
        item_id = str(item["contradiction_id"])
        refs = link_index.get(("contradiction", item_id))
        _require(refs is not None, "p2_contradiction_review_linkage_missing")
        signals = information_signals(
            persona_uncertainty=0.95,
            register_boundary=0.9,
            historical_evidence_conflict=1.0,
            potential_training_value=0.95,
        )
        source_row = _base_row(
            source_kind="P2_CONTRADICTION",
            source_bundle_ref=bundle_ref,
            source_identifier=item_id,
            source_family_refs=_family_refs(
                [*item.get("evidence_A", {}).get("evidence_refs", []), *item.get("evidence_B", {}).get("evidence_refs", [])],
                bundle_ref,
                "p2",
            ),
            eligible_sessions=["SESSION_2", "SESSION_4", "SESSION_5"],
            register_codes=["ordinary_chat", "personal_reflection"],
            dimension_codes=[str(item.get("trait", "unresolved_contradiction")), "historical_conflict"],
            review_refs=[_review_ref(value, "p2") for value in refs],
            signals=signals,
            local_review_payload={
                "trait": item.get("trait"),
                "possible_register_explanation": item.get("possible_register_explanation"),
                "possible_context_explanation": item.get("possible_context_explanation"),
                "time_drift_possible": item.get("time_drift_possible"),
                "owner_question_local": item.get("owner_question"),
            },
            contains_private_text=True,
        )
        rows.append(source_row)
        locators.append({"pool_ref": source_row["pool_ref"], "source_role": "persona_contradiction", "source_record_key_local": item_id})

    selected_antipatterns = _select_diverse(antipatterns, "behaviour_class", MAX_P2_ANTIPATTERNS)
    for item in selected_antipatterns:
        _p2_row_guard(item, raw_excerpt_key="contains_raw_excerpt")
        item_id = str(item["anti_pattern_id"])
        refs = link_index.get(("antipattern", item_id))
        _require(refs is not None, "p2_antipattern_review_linkage_missing")
        signals = information_signals(
            persona_uncertainty=0.75,
            register_boundary=0.95,
            historical_evidence_conflict=min(1.0, float(item.get("contradiction_count", 0)) / 3),
            potential_training_value=0.9,
        )
        source_row = _base_row(
            source_kind="P2_ANTIPATTERN",
            source_bundle_ref=bundle_ref,
            source_identifier=item_id,
            source_family_refs=_family_refs(item.get("evidence_refs"), bundle_ref, "p2"),
            eligible_sessions=["SESSION_4"],
            register_codes=item.get("compatible_registers") or ["ordinary_chat"],
            dimension_codes=[str(item.get("behaviour_class", "unresolved_antipattern")), str(item.get("anti_pattern_id", "unresolved_antipattern"))],
            review_refs=[_review_ref(value, "p2") for value in refs],
            signals=signals,
            local_review_payload={
                "candidate_anti_behaviour": item.get("candidate_anti_behaviour"),
                "trigger_contexts": item.get("trigger_contexts"),
                "failure_transition": item.get("failure_transition"),
                "forbidden_registers": item.get("forbidden_registers"),
            },
            contains_private_text=True,
        )
        rows.append(source_row)
        locators.append({"pool_ref": source_row["pool_ref"], "source_role": "persona_antipattern", "source_record_key_local": item_id})

    p2_audit = {
        "terminal_state_preserved": True,
        "microtrait_count": len(microtraits),
        "mode_count": len(modes),
        "antipattern_count": len(antipatterns),
        "contradiction_count": len(contradictions),
        "unresolved_question_count": int(summary.get("unresolved_question_count", 0)),
        "review_linkage_resolved": True,
        "selected_row_count": len(rows),
        "descriptive_promoted_to_normative_count": 0,
    }
    return rows, p2_audit, locators


def load_manual_source_pool(manual_root: Path) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    """Audit the manual source and compress its nine themes into five targets."""

    manual_root = _preflight_source_tree(manual_root, MANUAL_REQUIRED_FILES, require_all=True)
    envelope = _read_json(manual_root / "source_envelope.json")
    messages = _read_jsonl(manual_root / "deidentified_messages.jsonl")
    peer_evidence = _read_jsonl(manual_root / "peer_evidence_ledger.jsonl")
    hypotheses = _read_jsonl(manual_root / "hypothesis_candidates.jsonl")
    corrections = _read_jsonl(manual_root / "correction_items.jsonl")
    privacy_split = _read_json(manual_root / "privacy_and_split_receipt.json")
    summary = _read_json(manual_root / "reports/intake_summary.json")

    validate_source_envelope(envelope)
    for row in messages:
        validate_deidentified_message(row)
    for row in peer_evidence:
        validate_peer_evidence(row)
    for row in hypotheses:
        validate_hypothesis(row)
    for row in corrections:
        validate_correction_item(row)

    _require(len(hypotheses) == 9, "manual_hypothesis_count_must_equal_nine")
    _require(len(corrections) == 9, "manual_correction_theme_count_must_equal_nine")
    _require(summary.get("candidate_hypothesis_count") == 9, "manual_summary_hypothesis_count_mismatch")
    _require(summary.get("correction_question_count") == 9, "manual_summary_correction_count_mismatch")
    _require(summary.get("source_family_count") == 1, "manual_summary_family_count_invalid")
    _require(summary.get("owner_review_completed") is False, "manual_owner_review_must_be_false")
    _require(summary.get("gold_admitted") is False, "manual_gold_must_be_false")
    _require(summary.get("allowed_for_training") is False, "manual_training_must_be_false")
    _require(summary.get("all_peer_evidence_normative_weight_zero") is True, "manual_peer_normative_weight_nonzero")

    family = envelope.get("source_family", {}).get("source_family_ref")
    _require(isinstance(family, str), "manual_source_family_ref_missing")
    validate_single_source_family(family, [*messages, *peer_evidence, *hypotheses, *corrections])
    _require(privacy_split.get("source_family_count") == 1, "manual_privacy_family_count_invalid")
    _require(privacy_split.get("quoted_blocks_separated") is True, "manual_quote_separation_invalid")
    _require(privacy_split.get("third_party_usernames_excluded_from_derived_text") is True, "manual_deidentification_invalid")
    _require(privacy_split.get("all_owner_messages_same_family") is True, "manual_owner_family_split")
    _require(privacy_split.get("all_peer_annotations_same_family") is True, "manual_peer_family_split")
    _require(privacy_split.get("future_corrections_must_share_family") is True, "manual_future_correction_family_invalid")
    _require(privacy_split.get("allowed_for_training") is False, "manual_privacy_training_must_be_false")

    bundle_ref = opaque_ref("bundle", "manual")
    family_ref = opaque_ref("family", "manual", family)
    rows: list[dict[str, Any]] = []
    locators: list[dict[str, Any]] = []

    for item in hypotheses:
        item_id = str(item["hypothesis_id"])
        registers = item.get("compatible_registers") or ["ordinary_chat"]
        signals = information_signals(
            persona_uncertainty=0.95,
            register_boundary=0.9,
            historical_evidence_conflict=0.45,
            potential_training_value=0.9,
        )
        source_row = _base_row(
            source_kind="MANUAL_HYPOTHESIS",
            source_bundle_ref=bundle_ref,
            source_identifier=item_id,
            source_family_refs=[family_ref],
            eligible_sessions=["SESSION_3", "SESSION_4"],
            register_codes=registers,
            dimension_codes=[str(item.get("behaviour_code", "manual_hypothesis")), str(item.get("claim_status", "descriptive_hypothesis"))],
            review_refs=[opaque_ref("manual-hypothesis-review", item_id)],
            signals=signals,
            local_review_payload={
                "positive_boundary": item.get("positive_boundary"),
                "negative_boundary": item.get("negative_boundary"),
                "forbidden_registers": item.get("forbidden_registers"),
                "epistemic_category": item.get("epistemic_category"),
                "generalization_scope": item.get("generalization_scope"),
            },
            contains_private_text=True,
        )
        rows.append(source_row)
        locators.append({"pool_ref": source_row["pool_ref"], "source_role": "manual_hypothesis", "source_record_key_local": item_id})

    covered: list[int] = []
    for cluster_index, indexes in enumerate(MANUAL_CLUSTER_GROUPS, start=1):
        items = [corrections[index] for index in indexes]
        covered.extend(indexes)
        source_identifier = "\x1f".join(str(item["correction_id"]) for item in items)
        registers = [
            item["register_context"] for item in items
            if item.get("register_context") in REGISTER_CODES
        ] or ["ordinary_chat"]
        signals = information_signals(
            persona_uncertainty=1.0,
            register_boundary=0.95,
            historical_evidence_conflict=0.55,
            potential_training_value=0.95,
        )
        source_row = _base_row(
            source_kind="MANUAL_CORRECTION_CLUSTER",
            source_bundle_ref=bundle_ref,
            source_identifier=source_identifier,
            source_family_refs=[family_ref],
            eligible_sessions=["SESSION_3"],
            register_codes=registers,
            dimension_codes=[str(item.get("information_goal", "manual_boundary")) for item in items],
            review_refs=[opaque_ref("manual-correction-review", str(item["correction_id"])) for item in items],
            signals=signals,
            local_review_payload={
                "cluster_ordinal": cluster_index,
                "source_theme_count": len(items),
                "information_goals": [item.get("information_goal") for item in items],
                "question_families": [item.get("question_family") for item in items],
                "questions_local": [item.get("question_text_local") for item in items],
                "target_hypothesis_refs": [
                    opaque_ref("manual-target", value)
                    for item in items for value in item.get("target_hypothesis_refs", [])
                ],
            },
            contains_private_text=True,
        )
        rows.append(source_row)
        locators.append({
            "pool_ref": source_row["pool_ref"],
            "source_role": "manual_correction_cluster",
            "source_record_keys_local": [str(item["correction_id"]) for item in items],
        })

    all_covered_once = sorted(covered) == list(range(9)) and len(covered) == len(set(covered))
    manual_audit = {
        "source_family_count": 1,
        "hypothesis_count": len(hypotheses),
        "correction_theme_count": len(corrections),
        "quote_blocks_separated": True,
        "third_party_identifiers_removed": True,
        "peer_normative_weight_zero": True,
        "single_family_preserved": True,
        "owner_review_completed": False,
        "gold_admitted": False,
        "allowed_for_training": False,
    }
    compression = {
        "input_theme_count": len(corrections),
        "contextual_target_count": len(MANUAL_CLUSTER_GROUPS),
        "all_input_themes_covered_once": all_covered_once,
        "maximum_contextual_targets": 6,
    }
    return rows, manual_audit, compression, locators


def build_pool_document(
    p2_rows: Sequence[dict[str, Any]],
    p2_audit: Mapping[str, Any],
    manual_rows: Sequence[dict[str, Any]],
    manual_audit: Mapping[str, Any],
    manual_compression: Mapping[str, Any],
) -> dict[str, Any]:
    rows = [*p2_rows, *manual_rows]
    kind_counts, session_counts = aggregate_counts(rows)
    document = {
        "version": POOL_VERSION,
        "status": "SOURCE_POOL_READY",
        "source_rows": rows,
        "source_kind_counts": kind_counts,
        "eligible_session_counts": session_counts,
        "p2_audit": dict(p2_audit),
        "manual_audit": dict(manual_audit),
        "manual_compression": dict(manual_compression),
        "pack_constraints": {
            "crocodile_decision_fraction_minimum": 0.15,
            "crocodile_decision_fraction_maximum": 0.20,
            "manual_source_family_must_remain_one": True,
            "manual_contextual_target_maximum": 6,
        },
        "heldout_used": False,
        "api_requests": 0,
        "training_started": False,
        "optimizer_tokens": 0,
        "classification_updates": 0,
        "assistant_target_tokens": 0,
        "gold_admission": False,
        "owner_review_completed": False,
    }
    validate_pool_document(document)
    return document


def prepare_persona_sources(
    p2_root: Path,
    manual_root: Path,
    output_root: Path,
    *,
    trusted_p2_manifest_sha256: str,
    trusted_manual_manifest_sha256: str,
) -> dict[str, Any]:
    """Audit both source vaults and atomically write a ready ignored pool."""

    p2_root = _absolute_without_resolving(p2_root)
    manual_root = _absolute_without_resolving(manual_root)
    output_root = output_root.resolve()
    _assert_source_roots(p2_root, manual_root)

    p2_present, p2_required = _required_presence(p2_root, P2_REQUIRED_FILES)
    manual_present, manual_required = _required_presence(manual_root, MANUAL_REQUIRED_FILES)
    _require(p2_present == p2_required, "required_p2_source_missing")
    _require(manual_present == manual_required, "required_manual_source_missing")
    p2_root = _preflight_source_tree(p2_root, P2_REQUIRED_FILES, require_all=True)
    manual_root = _preflight_source_tree(manual_root, MANUAL_REQUIRED_FILES, require_all=True)

    _require(
        isinstance(trusted_p2_manifest_sha256, str)
        and re.fullmatch(r"[a-f0-9]{64}", trusted_p2_manifest_sha256) is not None,
        "trusted_p2_manifest_anchor_missing",
    )
    _require(
        isinstance(trusted_manual_manifest_sha256, str)
        and re.fullmatch(r"[a-f0-9]{64}", trusted_manual_manifest_sha256) is not None,
        "trusted_manual_manifest_anchor_missing",
    )
    actual_p2_manifest_sha = source_manifest_sha(p2_root, P2_REQUIRED_FILES)
    actual_manual_manifest_sha = source_manifest_sha(manual_root, MANUAL_REQUIRED_FILES)
    _require(actual_p2_manifest_sha == trusted_p2_manifest_sha256, "p2_manifest_anchor_mismatch")
    _require(actual_manual_manifest_sha == trusted_manual_manifest_sha256, "manual_manifest_anchor_mismatch")

    before_p2 = _source_snapshot(p2_root, P2_REQUIRED_FILES)
    before_manual = _source_snapshot(manual_root, MANUAL_REQUIRED_FILES)
    p2_rows, p2_audit, p2_locators = load_p2_source_pool(p2_root)
    manual_rows, manual_audit, compression, manual_locators = load_manual_source_pool(manual_root)
    _require(before_p2 == _source_snapshot(p2_root, P2_REQUIRED_FILES), "p2_source_modified_during_audit")
    _require(before_manual == _source_snapshot(manual_root, MANUAL_REQUIRED_FILES), "manual_source_modified_during_audit")

    document = build_pool_document(p2_rows, p2_audit, manual_rows, manual_audit, compression)
    rows = document["source_rows"]
    locators = [*p2_locators, *manual_locators]
    _require({row["pool_ref"] for row in rows} == {row["pool_ref"] for row in locators}, "source_locator_coverage_invalid")

    receipt = {
        "version": "r30j1c-r1.persona-source-pool-receipt.v1",
        "status": "SOURCE_POOL_READY",
        "p2_required_file_count": p2_required,
        "p2_populated_file_count": p2_present,
        "manual_required_file_count": manual_required,
        "manual_populated_file_count": manual_present,
        "p2_selected_row_count": len(p2_rows),
        "manual_hypothesis_row_count": sum(row["source_kind"] == "MANUAL_HYPOTHESIS" for row in manual_rows),
        "manual_correction_theme_count": manual_audit["correction_theme_count"],
        "manual_contextual_target_count": compression["contextual_target_count"],
        "total_source_row_count": len(rows),
        "p2_source_hashes_unchanged": True,
        "manual_source_hashes_unchanged": True,
        "p2_manifest_sha256": actual_p2_manifest_sha,
        "manual_manifest_sha256": actual_manual_manifest_sha,
        "provenance_anchor_status": "VERIFIED_IMMUTABLE_SOURCE",
        "heldout_used": False,
        "api_requests": 0,
        "training_started": False,
        "gold_admission": False,
    }
    audit = {
        "version": "r30j1c-r1.persona-source-audit.v1",
        "status": "PASS",
        "p2": p2_audit,
        "manual": manual_audit,
        "manual_compression": compression,
        "pack_constraints": document["pack_constraints"],
        "source_locator_coverage": True,
        "heldout_used": False,
        "owner_review_completed": False,
        "training_started": False,
    }

    _atomic_json(output_root / "persona_source_pool.json", document)
    _atomic_jsonl(output_root / "source_rows.jsonl", rows)
    _atomic_jsonl(output_root / "source_locator_map.jsonl", locators)
    _atomic_json(output_root / "source_audit.json", audit)
    _atomic_json(output_root / "source_pool_receipt.json", receipt)
    blocked = output_root / "source_integrity_blocked.json"
    if blocked.exists() and blocked.is_file() and not blocked.is_symlink():
        blocked.unlink()
    return receipt


def blocked_receipt(
    p2_root: Path,
    manual_root: Path,
    *,
    validation_failed: bool = False,
    source_content_read: bool | None = None,
) -> dict[str, Any]:
    # This legacy helper is retained for synthetic unit fixtures only.  It
    # rejects heldout tokens and symlinked trees before any filesystem probe;
    # the production CLI never writes this receipt.  Fixed aggregate blocker
    # evidence is owned by r30j1c_r1_audit_source_availability.py.
    p2_root = _preflight_source_tree(p2_root, P2_REQUIRED_FILES, require_all=False)
    manual_root = _preflight_source_tree(manual_root, MANUAL_REQUIRED_FILES, require_all=False)
    p2_present, p2_required = _required_presence(p2_root, P2_REQUIRED_FILES)
    manual_present, manual_required = _required_presence(manual_root, MANUAL_REQUIRED_FILES)
    required_input_gap = p2_present < p2_required or manual_present < manual_required
    _require(required_input_gap, "blocked_receipt_requires_input_gap")
    return {
        "version": "r30j1c-r1.persona-source-integrity-block.v1",
        "status": "BLOCKED_SOURCE_INTEGRITY",
        "error_code": "required_populated_source_unavailable",
        "p2_required_file_count": p2_required,
        "p2_populated_file_count": p2_present,
        "manual_required_file_count": manual_required,
        "manual_populated_file_count": manual_present,
        "required_input_gap": required_input_gap,
        "validation_failed": validation_failed,
        "source_content_read": source_content_read,
        "heldout_content_read": False if source_content_read is False else None,
        "heldout_content_read_claim": (
            "NO_SOURCE_CONTENT_OPENED_BEFORE_INPUT_GAP"
            if source_content_read is False
            else "NOT_ASSERTED_AFTER_SOURCE_READ"
        ),
        "source_rows_written": 0,
        "heldout_used": False,
        "api_requests": 0,
        "training_started": False,
        "optimizer_tokens": 0,
        "classification_updates": 0,
        "assistant_target_tokens": 0,
        "gold_admission": False,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--p2-root", type=Path, default=DEFAULT_P2_ROOT)
    parser.add_argument("--manual-root", type=Path, default=DEFAULT_MANUAL_ROOT)
    parser.add_argument("--output-root", type=Path, default=LOCAL_OUTPUT_PARENT / "source_pool")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = args.output_root.resolve()
    source_content_read: bool | None = False
    output_boundary_safe = False
    try:
        _require(
            _absolute_without_resolving(args.p2_root) == _absolute_without_resolving(DEFAULT_P2_ROOT)
            and _absolute_without_resolving(args.manual_root) == _absolute_without_resolving(DEFAULT_MANUAL_ROOT),
            "persona_source_roots_must_be_fixed_project_local_roots",
        )
        _preflight_source_tree(args.p2_root, P2_REQUIRED_FILES, require_all=False)
        _preflight_source_tree(args.manual_root, MANUAL_REQUIRED_FILES, require_all=False)
        output.relative_to(LOCAL_OUTPUT_PARENT)
        output_boundary_safe = True
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        source_config = config.get("source_pool", {})
        p2_provenance = source_config.get("r30j0_p2_provenance", {})
        manual_provenance = source_config.get("manual_owner_evidence_provenance", {})
        _require(
            p2_provenance.get("anchor_status") == "VERIFIED_IMMUTABLE_SOURCE"
            and p2_provenance.get("self_signed_manifest_is_sufficient") is False,
            "trusted_p2_producer_manifest_anchor_unavailable",
        )
        _require(
            manual_provenance.get("anchor_status") == "VERIFIED_IMMUTABLE_SOURCE"
            and manual_provenance.get("self_signed_manifest_is_sufficient") is False,
            "trusted_manual_producer_manifest_anchor_unavailable",
        )
        # R30J1C-R1 is source-integrity blocked.  Even if someone edits only
        # the tracked hash strings above, this revision cannot activate the
        # dormant READY adapter.  A later reviewed implementation must bind
        # immutable independent receipts and close the remaining atomic-read
        # contract before changing this constant.
        _require(
            READY_PERSONA_SOURCE_ADAPTER_AUTHORIZED,
            "ready_persona_source_adapter_not_authorized_this_revision",
        )
        p2_present, p2_required = _required_presence(args.p2_root, P2_REQUIRED_FILES)
        manual_present, manual_required = _required_presence(args.manual_root, MANUAL_REQUIRED_FILES)
        _require(p2_present == p2_required, "required_p2_source_missing")
        _require(manual_present == manual_required, "required_manual_source_missing")
        source_content_read = True
        receipt = prepare_persona_sources(
            args.p2_root,
            args.manual_root,
            output,
            trusted_p2_manifest_sha256=p2_provenance.get("trusted_manifest_sha256"),
            trusted_manual_manifest_sha256=manual_provenance.get("trusted_manifest_sha256"),
        )
    except (PersonaSourceIntegrityError, ValueError, json.JSONDecodeError, OSError):
        if output_boundary_safe:
            remove_stale_ready_outputs(output)
        receipt = {
            "version": "r30j1c-r1.persona-source-adapter-failure.v1",
            "status": "BLOCKED_SOURCE_INTEGRITY",
            "error_code": "run_fixed_source_availability_audit",
            "source_content_read": source_content_read,
            "heldout_used": False,
            "api_requests": 0,
            "training_started": False,
            "gold_admission": False,
        }
        print(json.dumps(receipt, sort_keys=True))
        return 2
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
