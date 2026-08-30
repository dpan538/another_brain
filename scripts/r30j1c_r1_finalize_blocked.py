#!/usr/bin/env python3
"""Write the R30J1C-R1 source-integrity terminal without reading sources."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "artifacts" / "r30j1c" / "owner_correction_pack"
sys.path.insert(0, str(ROOT))

from src.personal_judge.r30j1c_r1_source_integrity import (  # noqa: E402
    SourceIntegrityError,
    build_blocked_reports,
)
from scripts.r30j1c_r1_audit_source_availability import (  # noqa: E402
    _j1a_receipt,
    _persona_receipt,
    audit_source_availability,
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SourceIntegrityError("blocker_receipt_must_be_object")
    return value


def _absolute_without_resolving(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def _preflight_receipt(path: Path, expected_name: str) -> Path:
    """Allow only an exact file in the fixed ignored source pool."""

    source_pool = _absolute_without_resolving(DEFAULT_OUTPUT / "source_pool")
    candidate = _absolute_without_resolving(path)
    expected = source_pool / expected_name
    if candidate != expected:
        raise SourceIntegrityError("blocker_receipt_path_not_allowlisted")
    try:
        relative_source_pool = source_pool.relative_to(ROOT)
    except ValueError as exc:
        raise SourceIntegrityError("blocker_receipt_root_outside_repository") from exc
    current = ROOT
    for component in relative_source_pool.parts:
        current /= component
        if current.is_symlink() or not current.is_dir():
            raise SourceIntegrityError("blocker_receipt_parent_chain_unsafe")
    for current in (candidate,):
        if current.is_symlink():
            raise SourceIntegrityError("blocker_receipt_symlink_forbidden")
    if not source_pool.is_dir():
        raise SourceIntegrityError("blocker_receipt_root_missing")
    if not candidate.is_file() or candidate.is_symlink():
        raise SourceIntegrityError("blocker_receipt_missing")
    resolved_pool = source_pool.resolve(strict=True)
    resolved_candidate = candidate.resolve(strict=True)
    if resolved_candidate.parent != resolved_pool or resolved_candidate.name != expected_name:
        raise SourceIntegrityError("blocker_receipt_outside_exact_root")
    return resolved_candidate


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.strip()


def _git_state() -> dict[str, Any]:
    head = _git("rev-parse", "HEAD")
    origin = _git("rev-parse", "origin/main")
    return {
        "head": head,
        "origin_main": origin,
        "head_equals_origin_main": head == origin,
        "worktree_clean": _git("status", "--porcelain") == "",
    }


def _run_governance_gate() -> dict[str, Any]:
    """Execute and capture the independent tracked-diff governance gate."""

    gate = ROOT / "scripts" / "r30j1c_r1_no_production_change_gate.mjs"
    try:
        result = subprocess.run(
            ["node", os.fspath(gate)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as exc:
        raise SourceIntegrityError("governance_gate_runtime_unavailable") from exc
    if result.returncode != 0:
        raise SourceIntegrityError("governance_gate_failed")
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise SourceIntegrityError("governance_gate_output_invalid") from exc
    if not isinstance(report, dict):
        raise SourceIntegrityError("governance_gate_output_must_be_object")
    return report


def _assert_local_output(path: Path) -> Path:
    lexical = _absolute_without_resolving(path)
    expected = _absolute_without_resolving(DEFAULT_OUTPUT)
    if lexical != expected:
        raise SourceIntegrityError("output_must_be_exact_ignored_owner_correction_pack")
    try:
        relative_output = expected.relative_to(ROOT)
    except ValueError as exc:
        raise SourceIntegrityError("output_root_outside_repository") from exc
    current = ROOT
    for component in relative_output.parts:
        current /= component
        if current.is_symlink() or not current.is_dir():
            raise SourceIntegrityError("output_parent_chain_unsafe")
    return lexical


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
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


def _load_live_bound_receipts(source_pool: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """Reject hand-authored or stale receipts by repeating the fixed lstat audit."""

    stored_audit = _load(
        _preflight_receipt(source_pool / "source_availability_audit.json", "source_availability_audit.json")
    )
    created_at = stored_audit.pop("created_at", None)
    if not isinstance(created_at, str) or not created_at.endswith("Z"):
        raise SourceIntegrityError("source_availability_audit_timestamp_invalid")
    live_audit = audit_source_availability(ROOT)
    if stored_audit != live_audit:
        raise SourceIntegrityError("source_availability_audit_stale_or_mutated")
    j1a_receipt = _load(
        _preflight_receipt(source_pool / "j1a_source_pool_blocked_receipt.json", "j1a_source_pool_blocked_receipt.json")
    )
    persona_receipt = _load(
        _preflight_receipt(source_pool / "source_integrity_blocked.json", "source_integrity_blocked.json")
    )
    if j1a_receipt != _j1a_receipt(live_audit):
        raise SourceIntegrityError("j1a_blocker_not_bound_to_live_fixed_audit")
    if persona_receipt != _persona_receipt(live_audit):
        raise SourceIntegrityError("persona_blocker_not_bound_to_live_fixed_audit")
    return j1a_receipt, persona_receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source_pool = DEFAULT_OUTPUT / "source_pool"
    parser.add_argument(
        "--j1a-receipt", type=Path,
        default=source_pool / "j1a_source_pool_blocked_receipt.json",
    )
    parser.add_argument(
        "--persona-receipt", type=Path,
        default=source_pool / "source_integrity_blocked.json",
    )
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--require-pushed-clean", action="store_true")
    args = parser.parse_args()
    output = _assert_local_output(args.output_root)
    git_state = _git_state()
    if args.require_pushed_clean and not (
        git_state["head_equals_origin_main"] and git_state["worktree_clean"]
    ):
        raise SystemExit("finalize_requires_pushed_clean_main")
    # The CLI still exposes receipt arguments for compatibility, but preflight
    # below proves they are exactly the fixed filenames before the shared
    # live-bound loader is used.
    _preflight_receipt(args.j1a_receipt, "j1a_source_pool_blocked_receipt.json")
    _preflight_receipt(args.persona_receipt, "source_integrity_blocked.json")
    j1a_receipt, persona_receipt = _load_live_bound_receipts(source_pool)
    governance_gate = _run_governance_gate()
    reports = build_blocked_reports(
        j1a_receipt,
        persona_receipt,
        git_state=git_state,
        governance_gate=governance_gate,
        created_at=_utc_now(),
    )
    for relative, value in reports.items():
        _atomic_json(output / relative, value)
    print(json.dumps({
        "terminal_state": "BLOCKED_SOURCE_INTEGRITY",
        "pack_created": False,
        "report_count": len(reports),
        "heldout_content_read": reports["source_integrity_report.json"]["heldout_content_read"],
        "training_started": False,
        "api_requests": 0,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
