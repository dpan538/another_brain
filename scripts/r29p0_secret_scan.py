#!/usr/bin/env python3
"""Scan R29P0 tracked changes and ignored artifacts without emitting secret material."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
SECRET_PATH = ROOT / ".env.deepseek.local"


def load_key() -> bytes | None:
    if not SECRET_PATH.is_file():
        return None
    for line in SECRET_PATH.read_bytes().splitlines():
        if line.startswith(b"DEEPSEEK_API_KEY="):
            value = line.split(b"=", 1)[1].strip()
            if len(value) >= 2 and value[:1] == value[-1:] and value[:1] in {b'"', b"'"}:
                value = value[1:-1]
            return value or None
    return None


def candidate_files(artifact_root: Path) -> list[Path]:
    changed = subprocess.run(
        ["git", "diff", "--name-only", "HEAD"], cwd=ROOT, text=True, capture_output=True, check=True
    ).stdout.splitlines()
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT, text=True, capture_output=True, check=True
    ).stdout.splitlines()
    files = [ROOT / relative for relative in sorted(set(changed + untracked))]
    if artifact_root.is_dir():
        files.extend(path for path in artifact_root.rglob("*") if path.is_file())
    return [path for path in files if path.is_file() and path != SECRET_PATH]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", default="artifacts/r29p0_pairwise_oracle")
    parser.add_argument("--output")
    args = parser.parse_args()
    key = load_key()
    files = candidate_files((ROOT / args.artifact_root).resolve())
    forbidden_patterns = [
        re.compile(rb"authorization[\"']?\s*:\s*[\"']?bearer\s+[a-z0-9_-]{12,}", re.IGNORECASE),
        re.compile(rb"deepseek_api_key\s*[=:]\s*[\"']?[a-z0-9_-]{12,}[\"']?", re.IGNORECASE),
    ]
    violation_count = 0
    for path in files:
        try:
            payload = path.read_bytes()
        except OSError:
            violation_count += 1
            continue
        if key and key in payload:
            violation_count += 1
        if any(pattern.search(payload) for pattern in forbidden_patterns):
            violation_count += 1
    result = {
        "schema_version": "r29p0.secret_scan.v1",
        "files_scanned": len(files),
        "violations": violation_count,
        "secret_exposure": violation_count > 0,
        "key_value_logged": False,
        "secret_metadata_logged": False,
    }
    if args.output:
        output = (ROOT / args.output).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=f".{output.name}.", dir=output.parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(result, handle, sort_keys=True, indent=2)
                handle.write("\n")
            os.chmod(temporary, 0o600)
            os.replace(temporary, output)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    print(json.dumps(result, sort_keys=True))
    return 0 if violation_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
