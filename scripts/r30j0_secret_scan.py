#!/usr/bin/env python3
"""Scan R30J0 source and ignored evidence without exposing secret material."""

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
BASE = "592bed6a660218d2bce709e193a198dd5b0fa9f5"
SECRET_PATH = ROOT / ".env.deepseek.local"


def git_lines(*args: str) -> list[str]:
    return subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True, check=True,
    ).stdout.splitlines()


def candidate_files(artifact_root: Path) -> list[Path]:
    relative = set(git_lines("diff", "--name-only", BASE, "HEAD"))
    relative.update(git_lines("diff", "--name-only", "HEAD"))
    relative.update(git_lines("ls-files", "--others", "--exclude-standard"))
    files = [ROOT / path for path in sorted(relative) if path]
    if artifact_root.is_dir():
        files.extend(path for path in artifact_root.rglob("*") if path.is_file())
    return [path for path in files if path.is_file() and path != SECRET_PATH]


def atomic_json(path: Path, value: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, sort_keys=True, indent=2)
            handle.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", default="artifacts/r30j0")
    parser.add_argument("--output")
    args = parser.parse_args()
    files = candidate_files((ROOT / args.artifact_root).resolve())
    patterns = [
        re.compile(rb"authorization[\"']?\s*:\s*[\"']?bearer\s+[a-z0-9_-]{12,}", re.IGNORECASE),
        re.compile(rb"deepseek_api_key\s*[=:]\s*[\"']?[a-z0-9_-]{12,}[\"']?", re.IGNORECASE),
    ]
    violations = 0
    for path in files:
        try:
            payload = path.read_bytes()
        except OSError:
            violations += 1
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
    boundary_pass = secret_exists and secret_ignored and not secret_tracked and secret_permission_safe
    report: dict[str, object] = {
        "schema_version": "r30j0.secret_scan.v1",
        "files_scanned": len(files),
        "violations": violations,
        "secret_exposure": violations > 0,
        "secret_exists": secret_exists,
        "secret_ignored": secret_ignored,
        "secret_tracked": secret_tracked,
        "secret_permission_safe": secret_permission_safe,
        "secret_file_read": False,
        "key_value_logged": False,
        "secret_metadata_logged": False,
    }
    if args.output:
        atomic_json((ROOT / args.output).resolve(), report)
    print(json.dumps(report, sort_keys=True))
    return 0 if violations == 0 and boundary_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
