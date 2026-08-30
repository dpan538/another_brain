#!/usr/bin/env python3
"""Audit only fixed R30J1C-R1 source locations without opening source content.

This audit deliberately uses ``lstat`` on an allow-list.  It does not list a
directory, resolve a source symlink, hash a source, or construct a heldout
filename.  Its ignored receipts can prove that the current checkout lacks the
minimum safe inputs; they cannot turn newly found files into trusted evidence.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import stat
import tempfile
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "artifacts" / "r30j1c" / "owner_correction_pack" / "source_pool"

J1A_ROOT = Path("artifacts/r30j1a/dataset")
P2_ROOT = Path("artifacts/r30j0/persona_excavation")
MANUAL_ROOT = Path("artifacts/r30j1c/manual_owner_evidence/current")

J1A_FIXED_FILES = (
    "dataset_manifest.json",
    "dev.jsonl",
    "dev_shortcut_pairs.jsonl",
)
J1A_PREDICTION_ALTERNATIVES = (
    "dev_predictions.jsonl",
    "dev_predictions_a.jsonl",
    "dev_predictions_b.jsonl",
    "dev_predictions_c.jsonl",
    "dev_predictions_d.jsonl",
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

AUDIT_METHOD = "FIXED_LOGICAL_PATH_LSTAT_ONLY"
BLOCKED = "BLOCKED_SOURCE_INTEGRITY"
PRESENT = "SOURCE_EVIDENCE_PRESENT_ANCHOR_REVALIDATION_REQUIRED"
PROVENANCE_BLOCK = "PROVENANCE_ANCHOR_UNAVAILABLE"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _lstat(path: Path) -> os.stat_result | None:
    try:
        return path.lstat()
    except FileNotFoundError:
        return None


def _inspect_root(repo_root: Path, logical_root: Path) -> dict[str, Any]:
    """Inspect a fixed root component-by-component without following links."""

    current = repo_root
    root_info = _lstat(current)
    if root_info is None or not stat.S_ISDIR(root_info.st_mode) or stat.S_ISLNK(root_info.st_mode):
        raise ValueError("repository_root_must_be_real_directory")
    for component in logical_root.parts:
        current /= component
        info = _lstat(current)
        if info is None:
            return {"state": "MISSING", "exists": False, "safe": True}
        if stat.S_ISLNK(info.st_mode):
            return {"state": "UNSAFE_SYMLINK", "exists": True, "safe": False}
        if not stat.S_ISDIR(info.st_mode):
            return {"state": "UNSAFE_NON_DIRECTORY", "exists": True, "safe": False}
    return {"state": "SAFE_DIRECTORY", "exists": True, "safe": True}


def _inspect_file(repo_root: Path, logical_root: Path, relative: str) -> dict[str, Any]:
    root_status = _inspect_root(repo_root, logical_root)
    logical_path = (logical_root / relative).as_posix()
    if root_status["state"] == "MISSING":
        return {"logical_path": logical_path, "state": "MISSING", "bytes": None}
    if not root_status["safe"]:
        return {"logical_path": logical_path, "state": "UNSAFE_ROOT", "bytes": None}

    current = repo_root / logical_root
    components = Path(relative).parts
    for index, component in enumerate(components):
        current /= component
        info = _lstat(current)
        if info is None:
            return {"logical_path": logical_path, "state": "MISSING", "bytes": None}
        if stat.S_ISLNK(info.st_mode):
            return {"logical_path": logical_path, "state": "UNSAFE_SYMLINK", "bytes": None}
        final = index == len(components) - 1
        if not final and not stat.S_ISDIR(info.st_mode):
            return {"logical_path": logical_path, "state": "UNSAFE_PARENT", "bytes": None}
        if final:
            if not stat.S_ISREG(info.st_mode):
                return {"logical_path": logical_path, "state": "UNSAFE_NON_REGULAR", "bytes": None}
            return {
                "logical_path": logical_path,
                "state": "SAFE_REGULAR" if info.st_size > 0 else "EMPTY_REGULAR",
                "bytes": info.st_size,
            }
    raise AssertionError("empty_relative_path_forbidden")


def _inspect_files(repo_root: Path, logical_root: Path, names: Iterable[str]) -> list[dict[str, Any]]:
    # This iteration is over the code-owned allow-list, never over a directory.
    return [_inspect_file(repo_root, logical_root, name) for name in names]


def _safe_count(rows: list[dict[str, Any]]) -> int:
    return sum(row["state"] == "SAFE_REGULAR" for row in rows)


def _unsafe_count(rows: list[dict[str, Any]]) -> int:
    return sum(str(row["state"]).startswith("UNSAFE") for row in rows)


def audit_source_availability(repo_root: Path) -> dict[str, Any]:
    """Return a content-free availability audit for the three canonical roots."""

    repo_root = Path(os.path.abspath(os.fspath(repo_root)))
    j1a_root = _inspect_root(repo_root, J1A_ROOT)
    p2_root = _inspect_root(repo_root, P2_ROOT)
    manual_root = _inspect_root(repo_root, MANUAL_ROOT)

    j1a_fixed = _inspect_files(repo_root, J1A_ROOT, J1A_FIXED_FILES)
    j1a_predictions = _inspect_files(repo_root, J1A_ROOT, J1A_PREDICTION_ALTERNATIVES)
    p2_files = _inspect_files(repo_root, P2_ROOT, P2_REQUIRED_FILES)
    manual_files = _inspect_files(repo_root, MANUAL_ROOT, MANUAL_REQUIRED_FILES)

    j1a_unsafe = _unsafe_count(j1a_fixed + j1a_predictions)
    j1a_fixed_complete = _safe_count(j1a_fixed) == len(J1A_FIXED_FILES)
    j1a_prediction_present = _safe_count(j1a_predictions) >= 1
    j1a_complete = j1a_root["safe"] and j1a_fixed_complete and j1a_prediction_present and j1a_unsafe == 0
    p2_unsafe = _unsafe_count(p2_files)
    manual_unsafe = _unsafe_count(manual_files)
    p2_complete = p2_root["safe"] and _safe_count(p2_files) == len(P2_REQUIRED_FILES) and p2_unsafe == 0
    manual_complete = (
        manual_root["safe"]
        and _safe_count(manual_files) == len(MANUAL_REQUIRED_FILES)
        and manual_unsafe == 0
    )

    return {
        "schema_version": "r30j1c-r1.source-availability-audit.v1",
        "audit_method": AUDIT_METHOD,
        "source_directory_enumerated": False,
        "source_content_read": False,
        "source_hash_computed": False,
        "heldout_path_opened": False,
        "heldout_content_read": False,
        "j1a": {
            "logical_root": J1A_ROOT.as_posix(),
            "root": j1a_root,
            "fixed_files": j1a_fixed,
            "prediction_alternatives": j1a_predictions,
            "safe_regular_file_count": _safe_count(j1a_fixed + j1a_predictions),
            "unsafe_path_count": j1a_unsafe,
            "required_input_group_count": 4,
            "satisfied_input_group_count": _safe_count(j1a_fixed) + int(j1a_prediction_present),
            "required_inputs_present": j1a_complete,
        },
        "p2": {
            "logical_root": P2_ROOT.as_posix(),
            "root": p2_root,
            "files": p2_files,
            "safe_regular_file_count": _safe_count(p2_files),
            "unsafe_path_count": p2_unsafe,
            "required_file_count": len(P2_REQUIRED_FILES),
            "required_inputs_present": p2_complete,
        },
        "manual": {
            "logical_root": MANUAL_ROOT.as_posix(),
            "root": manual_root,
            "files": manual_files,
            "safe_regular_file_count": _safe_count(manual_files),
            "unsafe_path_count": manual_unsafe,
            "required_file_count": len(MANUAL_REQUIRED_FILES),
            "required_inputs_present": manual_complete,
        },
        "trusted_provenance_anchors_available": False,
        "ready_path_authorized": False,
        "availability_state": PRESENT if j1a_complete and p2_complete and manual_complete else "INPUT_GAP",
        # Availability alone is never a READY decision.  This campaign has no
        # independently anchored producer manifests, so even an all-present
        # filesystem layout remains a legal source-integrity block.
        "status": BLOCKED,
    }


def _j1a_receipt(audit: dict[str, Any]) -> dict[str, Any]:
    source = audit["j1a"]
    failure_codes: list[str] = []
    root_state = source["root"]["state"]
    if root_state == "MISSING":
        failure_codes.append("J1A_DEV_SOURCE_VAULT_MISSING")
    elif not source["root"]["safe"] or source["unsafe_path_count"]:
        failure_codes.append("J1A_DEV_SOURCE_PATH_UNSAFE")
    if source["safe_regular_file_count"] == 0 and root_state == "SAFE_DIRECTORY":
        failure_codes.append("J1A_DEV_SOURCE_VAULT_EMPTY")
    elif 0 < source["satisfied_input_group_count"] < source["required_input_group_count"]:
        failure_codes.append("J1A_DEV_REQUIRED_INPUT_PARTIAL")
    if source["satisfied_input_group_count"] < source["required_input_group_count"]:
        failure_codes.append("J1A_DEV_REQUIRED_INPUT_GAP")
    failure_codes.append("J1A_DEV_PROVENANCE_ANCHOR_UNAVAILABLE")
    return {
        "schema_version": "r30j1c-r1.j1a-source-pool-blocked-receipt.v1",
        "status": BLOCKED,
        "failure_codes": failure_codes,
        "source_scope": "J1A_TRAIN_DEV_DIAGNOSTIC_ONLY",
        "logical_source_root": source["logical_root"],
        "audit_method": AUDIT_METHOD,
        "source_vault_exists": source["root"]["exists"],
        "source_root_state": root_state,
        "source_directory_enumerated": False,
        "safe_regular_file_count_observed": source["safe_regular_file_count"],
        "unsafe_path_count_observed": source["unsafe_path_count"],
        "required_input_group_count": source["required_input_group_count"],
        "satisfied_input_group_count": source["satisfied_input_group_count"],
        "required_inputs_present": source["required_inputs_present"],
        "provenance_anchor_available": False,
        "ready_path_authorized": False,
        "available_counts": None,
        "selected_counts": {
            "AUTHENTIC_OWNER_FALSE_NEGATIVE": 0,
            "CONTROLLED_GENERIC_FALSE_POSITIVE": 0,
            "REGISTER_CONFUSION": 0,
            "SHORTCUT_PAIR": 0,
        },
        "selected_total": 0,
        "source_rows_written": False,
        "source_content_read": False,
        "heldout_path_opened": False,
        "heldout_content_read": False,
        "heldout_content_read_claim": "NO_HELDOUT_PATH_OR_CONTENT_OPENED",
        "heldout_derived_content_used": False,
        "sealed_evaluation_used": False,
        "private_owner_text_reported": False,
        "model_rerun_performed": False,
        "allowed_for_training": False,
        "heldout_used": False,
        "training_started": False,
        "api_requests": 0,
        "optimizer_tokens": 0,
        "classification_updates": 0,
        "assistant_target_tokens": 0,
        "gold_admission": False,
    }


def _persona_receipt(audit: dict[str, Any]) -> dict[str, Any]:
    p2 = audit["p2"]
    manual = audit["manual"]
    gap = not (p2["required_inputs_present"] and manual["required_inputs_present"])
    return {
        "version": "r30j1c-r1.persona-source-integrity-block.v1",
        "status": BLOCKED,
        "error_code": (
            "required_populated_source_unavailable"
            if gap else "trusted_provenance_anchor_unavailable"
        ),
        "audit_method": AUDIT_METHOD,
        "p2_logical_source_root": p2["logical_root"],
        "p2_source_root_state": p2["root"]["state"],
        "p2_source_vault_exists": p2["root"]["exists"],
        "p2_required_file_count": p2["required_file_count"],
        "p2_populated_file_count": p2["safe_regular_file_count"],
        "p2_unsafe_path_count": p2["unsafe_path_count"],
        "manual_logical_source_root": manual["logical_root"],
        "manual_source_root_state": manual["root"]["state"],
        "manual_source_vault_exists": manual["root"]["exists"],
        "manual_required_file_count": manual["required_file_count"],
        "manual_populated_file_count": manual["safe_regular_file_count"],
        "manual_unsafe_path_count": manual["unsafe_path_count"],
        "source_directory_enumerated": False,
        "p2_required_inputs_present": p2["required_inputs_present"],
        "manual_required_inputs_present": manual["required_inputs_present"],
        "required_input_gap": gap,
        "provenance_anchors_available": False,
        "ready_path_authorized": False,
        "validation_failed": bool(p2["unsafe_path_count"] or manual["unsafe_path_count"]),
        "source_rows_written": 0,
        "source_content_read": False,
        "heldout_content_read": False,
        "heldout_content_read_claim": (
            "NO_SOURCE_CONTENT_OPENED_BEFORE_INPUT_GAP"
            if gap else "NO_SOURCE_CONTENT_OPENED_DURING_PROVENANCE_BLOCK"
        ),
        "heldout_used": False,
        "training_started": False,
        "api_requests": 0,
        "optimizer_tokens": 0,
        "classification_updates": 0,
        "assistant_target_tokens": 0,
        "gold_admission": False,
    }


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _ensure_fixed_output_root(repo_root: Path, output_root: Path) -> None:
    """Create only the fixed ignored output chain, never through a symlink."""

    current = repo_root
    for component in output_root.relative_to(repo_root).parts:
        current /= component
        info = _lstat(current)
        if info is None:
            current.mkdir(mode=0o700)
            info = _lstat(current)
        if info is None or stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise ValueError("output_path_component_must_be_real_directory")
    os.chmod(output_root, 0o700)


def write_fixed_audit(repo_root: Path = ROOT, output_root: Path = OUTPUT_ROOT) -> dict[str, Any]:
    repo_root = Path(os.path.abspath(os.fspath(repo_root)))
    expected_output = repo_root / "artifacts" / "r30j1c" / "owner_correction_pack" / "source_pool"
    if Path(os.path.abspath(os.fspath(output_root))) != expected_output:
        raise ValueError("output_root_must_be_fixed_ignored_source_pool")
    _ensure_fixed_output_root(repo_root, expected_output)
    audit = audit_source_availability(repo_root)
    audit["created_at"] = _utc_now()
    j1a = _j1a_receipt(audit)
    persona = _persona_receipt(audit)
    _atomic_json(expected_output / "source_availability_audit.json", audit)
    _atomic_json(expected_output / "j1a_source_pool_blocked_receipt.json", j1a)
    _atomic_json(expected_output / "source_integrity_blocked.json", persona)
    return {
        "status": audit["status"],
        "j1a_required_inputs_present": audit["j1a"]["required_inputs_present"],
        "p2_required_inputs_present": audit["p2"]["required_inputs_present"],
        "manual_required_inputs_present": audit["manual"]["required_inputs_present"],
        "heldout_content_read": False,
        "source_content_read": False,
        "ready_path_authorized": False,
    }


def main() -> int:
    summary = write_fixed_audit()
    print(json.dumps(summary, sort_keys=True))
    return 0 if summary["status"] == BLOCKED else 2


if __name__ == "__main__":
    raise SystemExit(main())
