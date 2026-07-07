#!/usr/bin/env python3
"""Select the safest final preview source branch for R28PR0.

This script is static/prelaunch only. It never trains, downloads weights,
changes model assets, or performs any admission step.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

R28ROUT0 = "origin/r28rout0-hard-router-answer-surface"
R28D7 = "origin/r28d7-final-preview-branch"
R28QA2 = "origin/r28qa2-product-surface-qa"
R28AD0 = "origin/r28ad0-admission-precheck"
PRIORITY = [R28ROUT0, R28D7, R28QA2, R28AD0]

ROUT0_GATE_COMMANDS = [
    ["npm", "run", "test:r28rout0"],
    ["npm", "run", "build"],
    ["npm", "run", "build:vercel"],
    ["npm", "run", "check:r27b0-static-budget"],
    ["npm", "run", "check:r27b0-static-only"],
    ["npm", "run", "check:no-training-in-routine-gates"],
    ["npm", "run", "check:training-approval-markers"],
]


def run(command: list[str], *, cwd: Path = ROOT, timeout: int = 420) -> dict[str, Any]:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True, timeout=timeout)
    return {
        "command": command,
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
    }


def git_ref_exists(ref: str, *, cwd: Path = ROOT) -> bool:
    return run(["git", "rev-parse", "--verify", ref], cwd=cwd, timeout=30)["ok"]


def package_scripts(cwd: Path = ROOT) -> dict[str, str]:
    package_path = cwd / "package.json"
    if not package_path.exists():
        return {}
    return json.loads(package_path.read_text(encoding="utf-8")).get("scripts", {})


def command_is_optional_missing(command: list[str], scripts: dict[str, str]) -> bool:
    return len(command) >= 3 and command[:2] == ["npm", "run"] and command[2] not in scripts


def run_rout0_gate(*, cwd: Path = ROOT) -> dict[str, Any]:
    scripts = package_scripts(cwd)
    results: list[dict[str, Any]] = []
    missing_optional: list[str] = []
    for command in ROUT0_GATE_COMMANDS:
        if command_is_optional_missing(command, scripts):
            missing_optional.append(command[2])
            continue
        results.append(run(command, cwd=cwd))
    failures = [item for item in results if not item["ok"]]
    return {
        "ok": not failures,
        "results": results,
        "missing_optional_script": missing_optional,
        "failures": [item["command"] for item in failures],
    }


def choose_preview_branch(refs: dict[str, bool], rout0_gate: dict[str, Any] | None = None) -> dict[str, Any]:
    rout0_exists = refs.get(R28ROUT0, False)
    d7_exists = refs.get(R28D7, False)
    if rout0_exists:
        gate = rout0_gate or {"ok": False, "failures": ["gate_not_run"]}
        if gate.get("ok") is True:
            return {
                "ok": True,
                "selected_base": R28ROUT0,
                "fallback_reason": "",
                "candidate_priority": PRIORITY,
                "rout0_gate": gate,
            }
        if d7_exists:
            return {
                "ok": True,
                "selected_base": R28D7,
                "fallback_reason": "r28rout0_gate_failed",
                "candidate_priority": PRIORITY,
                "rout0_gate": gate,
            }
        return {
            "ok": False,
            "selected_base": "",
            "blocker": "BLOCK_NO_PREVIEW_BRANCH",
            "fallback_reason": "r28rout0_gate_failed_and_r28d7_missing",
            "candidate_priority": PRIORITY,
            "rout0_gate": gate,
        }
    if d7_exists:
        return {
            "ok": True,
            "selected_base": R28D7,
            "fallback_reason": "r28rout0_missing",
            "candidate_priority": PRIORITY,
        }
    return {
        "ok": False,
        "selected_base": "",
        "blocker": "BLOCK_NO_PREVIEW_BRANCH",
        "fallback_reason": "r28rout0_and_r28d7_missing",
        "candidate_priority": PRIORITY,
    }


def select_preview_branch(*, cwd: Path = ROOT, run_gates: bool = True) -> dict[str, Any]:
    refs = {ref: git_ref_exists(ref, cwd=cwd) for ref in PRIORITY}
    rout0_gate = run_rout0_gate(cwd=cwd) if run_gates and refs.get(R28ROUT0, False) else None
    selected = choose_preview_branch(refs, rout0_gate)
    selected["refs"] = refs
    selected["run_gates"] = run_gates
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--run-gates",
        dest="run_gates",
        action="store_true",
        default=True,
        help="Run R28ROUT0 selection gates in the current checkout. This is the default.",
    )
    parser.add_argument(
        "--skip-gates",
        dest="run_gates",
        action="store_false",
        help="Only inspect refs. ROUT0 is not selected unless its gates are run and pass.",
    )
    args = parser.parse_args()
    report = select_preview_branch(run_gates=args.run_gates)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
