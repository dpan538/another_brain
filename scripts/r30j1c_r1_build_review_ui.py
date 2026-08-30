#!/usr/bin/env python3
"""Build the zero-network R30J1C-R1 owner review UI from an ignored pack."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.personal_judge.r30j1c_r1_contract import (  # noqa: E402
    ContractError,
    SESSION_IDS,
    validate_pack,
)


DEFAULT_ROOT = ROOT / "artifacts" / "r30j1c" / "owner_correction_pack"
DEFAULT_INPUT = DEFAULT_ROOT / "correction_pack_v1.json"
DEFAULT_OUTPUT = DEFAULT_ROOT
CONFIG_PATH = ROOT / "config" / "r30j1c_r1_owner_correction_pack_v1.json"
TEMPLATE_ROOT = ROOT / "data" / "personal_judge" / "templates" / "r30j1c_r1_review_ui"
STATIC_FILES = ("index.html", "review.css", "review.js")
GENERATED_FILES = (*STATIC_FILES, "review_seed.js", "initial_review_state.json", "ui_build_receipt.json")
BROWSER_SCHEMA_VERSION = "r30j1c-r1.browser-review-pack.v1"
# This blocked revision deliberately ships the offline UI method without a
# READY admission path.  A later tracked change must implement and test
# manifest-bound privacy/heldout/question/source-balance receipts before this
# can be enabled; changing provenance strings in config is insufficient.
READY_UI_BUILD_AUTHORIZED = False
FORBIDDEN_NETWORK_MARKERS = (
    "fetch(",
    "xmlhttprequest",
    "websocket",
    "eventsource",
    "sendbeacon",
    "http://",
    "https://",
    "@import",
    "url(http",
)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args(argv)


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def atomic_write(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(value)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.chmod(0o600)
    temporary.replace(path)
    path.chmod(0o600)


def copy_static_file(source: Path, destination: Path) -> None:
    atomic_write(destination, source.read_bytes())


def verify_zero_network_templates() -> None:
    index = (TEMPLATE_ROOT / "index.html").read_text(encoding="utf-8")
    script = (TEMPLATE_ROOT / "review.js").read_text(encoding="utf-8")
    style = (TEMPLATE_ROOT / "review.css").read_text(encoding="utf-8")
    if "connect-src 'none'" not in index:
        raise ContractError("csp_connect_src")
    executable = f"{index}\n{script}\n{style}".lower()
    for marker in FORBIDDEN_NETWORK_MARKERS:
        if marker in executable:
            raise ContractError("network_primitive")


def verify_local_private_boundary(path: Path) -> None:
    """Require every populated private input/output below the ignored root."""

    resolved = path.resolve()
    try:
        resolved.relative_to(DEFAULT_ROOT)
    except ValueError as exc:
        raise ContractError("local_private_boundary") from exc


def verify_provenance_anchors() -> None:
    """A structurally valid private pack is insufficient for a READY UI."""

    try:
        config = read_json(CONFIG_PATH)
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError("provenance_config_unavailable") from exc
    source_pool = config.get("source_pool")
    if not isinstance(source_pool, dict):
        raise ContractError("provenance_config_invalid")
    anchors = (
        ("r30j1a_diagnostic_provenance", "independent_terminal_receipt_sha256"),
        ("r30j0_p2_provenance", "independent_terminal_receipt_sha256"),
        ("manual_owner_evidence_provenance", "independent_intake_receipt_sha256"),
    )
    for key, independent_receipt_key in anchors:
        anchor = source_pool.get(key)
        if not isinstance(anchor, dict):
            raise ContractError("provenance_anchor_unavailable")
        trusted_manifest = anchor.get("trusted_manifest_sha256")
        independent_receipt = anchor.get(independent_receipt_key)
        if not (
            anchor.get("anchor_status") == "VERIFIED_IMMUTABLE_SOURCE"
            and anchor.get("self_signed_manifest_is_sufficient") is False
            and isinstance(trusted_manifest, str)
            and len(trusted_manifest) == 64
            and all(character in "0123456789abcdef" for character in trusted_manifest)
            and isinstance(independent_receipt, str)
            and len(independent_receipt) == 64
            and all(character in "0123456789abcdef" for character in independent_receipt)
        ):
            raise ContractError("provenance_anchor_unavailable")


def remove_stale_ready_outputs(output_dir: Path) -> None:
    """Remove only known generated UI files after a failed READY precondition."""

    verify_local_private_boundary(output_dir)
    for filename in GENERATED_FILES:
        candidate = output_dir / filename
        try:
            info = candidate.lstat()
        except FileNotFoundError:
            continue
        if not (stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode)):
            raise ContractError("stale_ui_path_not_file")
        candidate.unlink()


def initial_state(pack: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": "r30j1c-r1.review-state.v1",
        "pack_id": pack["pack_id"],
        "manifest_sha": pack["manifest_sha"],
        "sessions": {
            session_id: {"responses": {}, "validated": False}
            for session_id in SESSION_IDS
        },
        "owner_review_completed": False,
        "profile_inference_allowed": False,
        "profile_frozen": False,
        "gold_admission": False,
        "allowed_for_training": False,
        "training_started": False,
    }


def browser_projection(pack: dict[str, Any]) -> dict[str, Any]:
    """Return only fields needed for blinded review and staged export.

    The complete private pack remains the trusted reconciliation source.  In
    particular this projection deliberately omits provenance, model scores,
    repeat linkage, canonical-decision linkage and all selection metadata.
    CorrectionRecordV1 exports leave reconciliation-only metadata null; a
    later campaign may join it from the trusted pack by item_id.
    """

    sessions = [{
        "session_id": session["session_id"],
        "title": session["title"],
        "purpose": session["purpose"],
        "decision_item_ids": list(session["decision_item_ids"]),
        "owner_write_prompt_ids": list(session["owner_write_prompt_ids"]),
        "estimated_minutes_min": session["estimated_minutes_min"],
        "estimated_minutes_max": session["estimated_minutes_max"],
        "partial_export_filename": session["partial_export_filename"],
    } for session in pack["sessions"]]

    decision_items = []
    for item in pack["decision_items"]:
        decision_items.append({
            "item_id": item["item_id"],
            "session_id": item["session_id"],
            "context_text": item["context_text"],
            "question_text": item["question_text"],
            "candidates": [{
                "option_id": candidate["option_id"],
                "response_text": candidate["response_text"],
            } for candidate in item["candidates"]],
            "decision_options": [{
                "value": option["value"],
                "label": option["label"],
            } for option in item["decision_options"]],
            "acceptable_alternatives_allowed": item["acceptable_alternatives_allowed"],
            "fatigue_question": item["fatigue_question"],
            "reason_options": [{
                "value": option["value"],
                "label": option["label"],
            } for option in item["reason_options"]],
            "reason_required_for": list(item["reason_required_for"]),
            "boundary_question": item["boundary_question"],
        })

    owner_write_prompts = [{
        "prompt_id": prompt["prompt_id"],
        "session_id": prompt["session_id"],
        "prompt_text": prompt["prompt_text"],
        "instruction": prompt["instruction"],
    } for prompt in pack["owner_write_prompts"]]

    return {
        "schema_version": BROWSER_SCHEMA_VERSION,
        "pack_id": pack["pack_id"],
        "manifest_sha": pack["manifest_sha"],
        "sessions": sessions,
        "decision_items": decision_items,
        "owner_write_prompts": owner_write_prompts,
    }


def build(pack: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    verify_local_private_boundary(output_dir)
    remove_stale_ready_outputs(output_dir)
    verify_provenance_anchors()
    if not READY_UI_BUILD_AUTHORIZED:
        raise ContractError("ready_ui_requires_independent_manifest_bound_audits")
    validate_pack(pack)
    if pack["status"] != "OWNER_CORRECTION_IN_PROGRESS":
        raise ContractError("populated_pack_required")
    verify_zero_network_templates()
    output_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    output_dir.chmod(0o700)

    for filename in STATIC_FILES:
        copy_static_file(TEMPLATE_ROOT / filename, output_dir / filename)

    serialized_pack = json.dumps(browser_projection(pack), ensure_ascii=True, separators=(",", ":"))
    seed = f"window.R30J1C_R1_CORRECTION_PACK = Object.freeze({serialized_pack});\n"
    atomic_write(output_dir / "review_seed.js", seed.encode("utf-8"))

    initial = initial_state(pack)
    atomic_write(
        output_dir / "initial_review_state.json",
        (json.dumps(initial, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8"),
    )

    generated_names = (*STATIC_FILES, "review_seed.js", "initial_review_state.json")
    file_receipts = []
    for filename in generated_names:
        payload = (output_dir / filename).read_bytes()
        file_receipts.append({
            "file": filename,
            "bytes": len(payload),
            "sha256": sha256_bytes(payload),
        })
    receipt = {
        "schema_version": "r30j1c-r1.review-ui-build-receipt.v1",
        "status": "READY",
        "session_count": 5,
        "decision_item_count": len(pack["decision_items"]),
        "owner_write_prompt_count": len(pack["owner_write_prompts"]),
        "blind_repeat_count": pack["coverage"]["blind_repeat_count"],
        "browser_projection_sanitized": True,
        "blind_repeat_identity_exposed": False,
        "source_provenance_exposed": False,
        "model_selection_metadata_exposed": False,
        "separate_partial_exports": True,
        "local_storage_autosave": True,
        "csp_connect_src_none": True,
        "network_required": False,
        "heldout_used": False,
        "api_requests": 0,
        "owner_review_completed": False,
        "profile_inference_allowed": False,
        "profile_frozen": False,
        "gold_admission": False,
        "allowed_for_training": False,
        "training_started": False,
        "files": file_receipts,
    }
    atomic_write(
        output_dir / "ui_build_receipt.json",
        (json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8"),
    )
    return receipt


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        input_path = args.input.resolve()
        output_path = args.output_dir.resolve()
        verify_local_private_boundary(input_path)
        pack = read_json(input_path)
        receipt = build(pack, output_path)
    except ContractError as exc:
        print(f"status=BLOCKED contract_error={exc}", file=sys.stderr)
        return 2
    except (OSError, json.JSONDecodeError) as exc:
        print(f"status=BLOCKED io_error={type(exc).__name__}", file=sys.stderr)
        return 2
    print(
        "status=READY "
        f"sessions={receipt['session_count']} "
        f"decisions={receipt['decision_item_count']} "
        f"owner_write_prompts={receipt['owner_write_prompt_count']} "
        "network_required=false training_started=false"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
