#!/usr/bin/env python3
"""Scan R30J1A evidence for secret leakage without reading secret or heldout."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
BASE = "05acfdcfa63e0c8fbf72930b6490161fe311fa46"
SECRET_PATH = ROOT / ".env.deepseek.local"
BINARY_SUFFIXES = {".npz", ".safetensors", ".bin", ".ckpt", ".pt", ".pth"}


def git_lines(*args: str) -> list[str]:
    return subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True, check=True,
    ).stdout.splitlines()


def candidate_files(artifact_root: Path) -> tuple[list[Path], int, int]:
    relative = set(git_lines("diff", "--name-only", BASE, "HEAD"))
    relative.update(git_lines("diff", "--name-only", "HEAD"))
    relative.update(git_lines("ls-files", "--others", "--exclude-standard"))
    files = [ROOT / path for path in sorted(relative) if path]
    if artifact_root.is_dir():
        files.extend(path for path in artifact_root.rglob("*") if path.is_file())
    unique = sorted(set(path.resolve() for path in files if path.is_file()))
    sealed_heldout = (artifact_root / "dataset" / "heldout.sealed.jsonl").resolve()
    excluded_binary = sum(path.suffix.casefold() in BINARY_SUFFIXES for path in unique)
    excluded_heldout = sum(path == sealed_heldout for path in unique)
    admitted = [
        path for path in unique
        if path != SECRET_PATH.resolve()
        and path != sealed_heldout
        and path.suffix.casefold() not in BINARY_SUFFIXES
    ]
    return admitted, excluded_binary, excluded_heldout


def atomic_json(path: Path, value: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, sort_keys=True, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "r30j1a" / "reports" / "secret_scan.json")
    args = parser.parse_args()
    artifact_root = args.artifact_root.resolve()
    files, excluded_binary, excluded_heldout = candidate_files(artifact_root)
    try:
        artifact_scope = artifact_root.relative_to(ROOT).as_posix()
    except ValueError:
        artifact_scope = "outside_repository_scope"
    scanned_head = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True, check=True,
    ).stdout.strip()
    patterns = (
        re.compile(rb"authorization[\"']?\s*:\s*[\"']?bearer\s+[a-z0-9_-]{12,}", re.IGNORECASE),
        re.compile(rb"deepseek_api_key\s*[=:]\s*[\"']?[a-z0-9_-]{12,}[\"']?", re.IGNORECASE),
    )
    violations = 0
    read_errors = 0
    for path in files:
        try:
            payload = path.read_bytes()
        except OSError:
            read_errors += 1
            continue
        if any(pattern.search(payload) for pattern in patterns):
            violations += 1
    secret_exists = SECRET_PATH.is_file()
    secret_ignored = subprocess.run(
        ["git", "check-ignore", "-q", "--", SECRET_PATH.name], cwd=ROOT,
    ).returncode == 0
    secret_tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", "--", SECRET_PATH.name], cwd=ROOT,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode == 0
    secret_permission_safe = secret_exists and stat.S_IMODE(SECRET_PATH.stat().st_mode) & 0o077 == 0
    boundary_pass = (
        violations == 0
        and read_errors == 0
        and secret_exists
        and secret_ignored
        and not secret_tracked
        and secret_permission_safe
    )
    report: dict[str, object] = {
        "schema_version": "r30j1a.secret-scan.v1",
        "scanned_head": scanned_head,
        "artifact_scope": artifact_scope,
        "files_scanned": len(files),
        "excluded_binary_file_count": excluded_binary,
        "excluded_heldout_file_count": excluded_heldout,
        "violations": violations,
        "read_errors": read_errors,
        "secret_exposure": violations > 0,
        "secret_exists": secret_exists,
        "secret_ignored": secret_ignored,
        "secret_tracked": secret_tracked,
        "secret_permission_safe": secret_permission_safe,
        "secret_file_read": False,
        "heldout_file_read": False,
        "checkpoint_binary_read": False,
        "key_value_logged": False,
        "secret_metadata_logged": False,
        "passed": boundary_pass,
    }
    atomic_json(args.output.resolve(), report)
    print(json.dumps(report, sort_keys=True))
    return 0 if boundary_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
