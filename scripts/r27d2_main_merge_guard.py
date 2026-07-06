#!/usr/bin/env python3
"""R27D2 main merge guard for the static deployment path."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27d0_vercel_config_audit import command_invokes_training
from scripts.r27d1_preview_readiness import audit as audit_r27d1

REQUIRED_COMMANDS = [
    "npm run build",
    "npm run build:vercel",
    "npm run check:r27b0-static-budget",
    "npm run check:r27b0-static-only",
]


def run_shell(command: str) -> dict[str, Any]:
    result = subprocess.run(["/bin/zsh", "-lc", command], cwd=ROOT, text=True, capture_output=True)
    return {
        "command": command,
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdoutTail": "\n".join(result.stdout.splitlines()[-20:]),
        "stderrTail": "\n".join(result.stderr.splitlines()[-20:]),
    }


def command_plan_status() -> dict[str, Any]:
    training_commands = [command for command in REQUIRED_COMMANDS if command_invokes_training(command)]
    return {
        "requiredCommands": REQUIRED_COMMANDS,
        "trainingCommands": training_commands,
        "buildCommandsRequired": ["npm run build", "npm run build:vercel"],
    }


def audit(*, run_commands: bool = True) -> dict[str, Any]:
    failures: list[str] = []
    readiness = audit_r27d1()
    plan = command_plan_status()

    if readiness["failures"]:
        failures.extend(f"r27d1:{failure}" for failure in readiness["failures"])
    if plan["trainingCommands"]:
        failures.extend(f"required_command_invokes_training:{command}" for command in plan["trainingCommands"])

    bundle = readiness["bundle"]
    if not bundle.get("ok"):
        failures.append("bundle_report_not_ok")
    if int(bundle.get("build_output_bytes", 0)) >= int(bundle.get("max_total_static_bytes", 100000000)):
        failures.append("bundle_exceeds_100mb")
    if bundle.get("backend_inference") is not False:
        failures.append("backend_inference_not_false")
    if bundle.get("external_llm_api") is not False:
        failures.append("external_llm_api_not_false")
    if bundle.get("model_declared_bytes") != 0:
        failures.append("model_declared_bytes_nonzero")
    if readiness["assetManifest"].get("tokenizerDeclaredBytes") != 0:
        failures.append("tokenizer_declared_bytes_nonzero")
    if readiness["artifacts"].get("badTrackedFiles"):
        failures.append("bad_tracked_artifacts_present")
    if not readiness["routes"].get("ok"):
        failures.append("route_smoke_not_ok")

    command_results: list[dict[str, Any]] = []
    if run_commands:
        for command in REQUIRED_COMMANDS:
            result = run_shell(command)
            command_results.append(result)
            if not result["ok"]:
                failures.append(f"required_command_failed:{command}:{result['returncode']}")

    return {
        "ok": not failures,
        "failures": failures,
        "runCommands": run_commands,
        "commandPlan": plan,
        "commandResults": command_results,
        "bundleBytes": bundle.get("build_output_bytes"),
        "bundleBudgetBytes": bundle.get("max_total_static_bytes"),
        "staticOnly": not readiness["claims"]["backendInference"],
        "routeStatus": readiness["routes"],
        "repoBuildConfigCauseStillLikely": readiness["repoBuildConfigCauseStillLikely"],
        "nonClaims": readiness["claims"],
    }


def main() -> int:
    report = audit(run_commands=True)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
