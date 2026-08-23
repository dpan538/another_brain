#!/usr/bin/env python3
"""Foreground-only R29P0 live phase supervisor with a non-reporting secret loader."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SECRET_PATH = ROOT / ".env.deepseek.local"
ALLOWED_PHASES = {"smoke", "batch1", "batch2", "batch3"}


def git_boolean(*args: str) -> bool:
    completed = subprocess.run(
        ["git", *args], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False
    )
    return completed.returncode == 0


def secret_preflight() -> tuple[dict[str, bool], str | None]:
    exists = SECRET_PATH.is_file()
    ignored = git_boolean("check-ignore", "-q", str(SECRET_PATH)) if exists else False
    tracked = git_boolean("ls-files", "--error-unmatch", str(SECRET_PATH)) if exists else False
    permissions_safe = exists and stat.S_IMODE(SECRET_PATH.stat().st_mode) == 0o600
    key: str | None = None
    if exists:
        # The file is never sourced and no content or metadata about the key is emitted.
        for line in SECRET_PATH.read_text(encoding="utf-8").splitlines():
            if line.startswith("DEEPSEEK_API_KEY="):
                candidate = line.split("=", 1)[1].strip()
                if len(candidate) >= 2 and candidate[0] == candidate[-1] and candidate[0] in {'"', "'"}:
                    candidate = candidate[1:-1]
                if candidate:
                    key = candidate
                break
    booleans = {
        "secret_exists": exists,
        "secret_ignored": ignored,
        "secret_tracked": tracked,
        "permissions_safe": permissions_safe,
        "key_present": key is not None,
        "key_value_logged": False,
    }
    return booleans, key


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=sorted(ALLOWED_PHASES))
    parser.add_argument("--artifact-root", default="artifacts/r29p0_pairwise_oracle")
    parser.add_argument("--preflight", action="store_true")
    args = parser.parse_args()
    booleans, key = secret_preflight()
    if args.preflight:
        print(json.dumps(booleans, sort_keys=True))
        return 0 if all((
            booleans["secret_exists"],
            booleans["secret_ignored"],
            not booleans["secret_tracked"],
            booleans["permissions_safe"],
            booleans["key_present"],
        )) else 2
    if not args.phase:
        raise SystemExit("phase_required")
    if not all((
        booleans["secret_exists"],
        booleans["secret_ignored"],
        not booleans["secret_tracked"],
        booleans["permissions_safe"],
        booleans["key_present"],
    )):
        print(json.dumps({**booleans, "state": "BLOCKED_CONFIGURATION"}, sort_keys=True))
        return 2
    child_environment = os.environ.copy()
    child_environment["DEEPSEEK_API_KEY"] = key or ""
    key = None
    command = [
        "node",
        "--experimental-strip-types",
        "scripts/r29p0_live_experiment.mjs",
        "--phase",
        args.phase,
        "--artifact-root",
        args.artifact_root,
    ]
    completed = subprocess.run(command, cwd=ROOT, env=child_environment, check=False)
    child_environment.pop("DEEPSEEK_API_KEY", None)
    return completed.returncode


if __name__ == "__main__":
    sys.exit(main())
