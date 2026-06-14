#!/usr/bin/env python3
"""Validate production-candidate readiness without promoting production."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "artifacts" / "release" / "r7_production_candidate_report.json"


def run(command: list[str]) -> dict[str, Any]:
    proc = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    return {
        "command": " ".join(command),
        "ok": proc.returncode == 0,
        "returncode": proc.returncode,
        "stdout_tail": proc.stdout.strip()[-2000:],
        "stderr_tail": proc.stderr.strip()[-2000:],
    }


def git_value(command: list[str]) -> str:
    proc = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if proc.returncode:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "git command failed")
    return proc.stdout.strip()


def resolve_rollback(value: str) -> str:
    target = value or "HEAD~1"
    if target == "auto":
        target = "HEAD~1"
    return git_value(["git", "rev-parse", "--verify", target])


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate R7 production candidate readiness.")
    parser.add_argument("--rollback", default="auto")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    failures: list[str] = []
    checks: dict[str, Any] = {}
    try:
        current_commit = git_value(["git", "rev-parse", "--verify", "HEAD"])
    except RuntimeError as error:
        current_commit = ""
        failures.append(f"current_commit:{error}")
    try:
        rollback_commit = resolve_rollback(args.rollback)
    except RuntimeError as error:
        rollback_commit = ""
        failures.append(f"rollback_target:{error}")

    if current_commit and rollback_commit and current_commit == rollback_commit:
        failures.append("rollback_equals_current_commit")

    checks["release_preflight"] = run(["bash", "scripts/check_release.sh"])
    checks["knowledge_shards"] = run(["python3", "scripts/validate_knowledge_shards.py"])
    for name, check in checks.items():
        if not check["ok"]:
            failures.append(name)

    report = {
        "ok": len(failures) == 0,
        "summary": {
            "currentCommit": current_commit,
            "rollbackCommit": rollback_commit,
            "releasePreflight": checks["release_preflight"]["ok"],
            "knowledgeShards": checks["knowledge_shards"]["ok"],
            "finalReleaseAllowedChanged": False,
            "failures": len(failures),
        },
        "checks": checks,
        "failures": failures,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    sys.exit(main())
