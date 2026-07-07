#!/usr/bin/env python3
"""R27B4 end-to-end static delivery integration audit."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27b1c_vercel_rehearsal import route_smoke
from scripts.r27b4_bundle_report import make_bundle_report

CANDIDATE_MANIFEST = ROOT / "artifacts/r27b2/manifests/candidate_static_manifest.json"


COMPONENT_PATHS = {
    "b0_shell": [
        "web/another_brain_chat/index.html",
        "web/another_brain_chat/runtime_interfaces.js",
        "web/another_brain/asset_manifest.json",
    ],
    "b1a_export_interfaces": [
        "src/browser_export/export_manifest.py",
        "src/browser_export/quantize.py",
        "src/browser_export/shard_writer.py",
        "scripts/r27b1a_static_model_budget.py",
    ],
    "b1b_runtime": [
        "src/browser_runtime/model_loader.ts",
        "src/browser_runtime/generation_loop.ts",
        "web/another_brain_chat/browser_runtime.js",
        "web/another_brain_chat/runtime_worker.js",
    ],
    "b1c_deployment_rehearsal": [
        "scripts/r27b1c_vercel_rehearsal.py",
        "scripts/r27b1c_verify_deploy_bundle.py",
        "docs/r27/R27B1C_VERCEL_REHEARSAL.md",
    ],
    "b2_candidate_injection": [
        "scripts/r27b2_browser_loader_smoke.py",
        "src/browser_export/model_reconstruct.py",
        "src/browser_export/candidate_asset_writer.py",
    ],
    "b3_static_rag": [
        "src/browser_runtime/rag/static_retriever.ts",
        "src/browser_runtime/rag/evidence_packet.ts",
        "web/another_brain/static_rag/demo_memory.json",
    ],
}


def run_command(args: list[str]) -> dict:
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
    return {
        "command": " ".join(args),
        "returncode": result.returncode,
        "stdout_tail": result.stdout[-2000:],
        "stderr_tail": result.stderr[-2000:],
        "ok": result.returncode == 0,
    }


def component_status() -> dict:
    out = {}
    for name, paths in COMPONENT_PATHS.items():
        missing = [path for path in paths if not (ROOT / path).exists()]
        out[name] = {"present": not missing, "missing": missing, "paths": paths}
    return out


def package_scripts_not_recursive() -> dict:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    failures = []
    for name, command in package.get("scripts", {}).items():
        recursive = re.search(
            rf"(^|[;&|])\s*npm\s+(run|run-script)\s+{re.escape(name)}(\s|$|[;&|])",
            command,
        )
        if recursive:
            failures.append(f"recursive_package_script:{name}")
    return {"ok": not failures, "failures": failures}


def candidate_smoke(run_smoke: bool = True) -> dict:
    if not CANDIDATE_MANIFEST.exists():
        return {
            "available": False,
            "ok": True,
            "status": "mock_synthetic_fallback",
            "blocker": "no admitted candidate asset yet",
            "manifest_path": str(CANDIDATE_MANIFEST.relative_to(ROOT)),
        }
    if not run_smoke:
        return {
            "available": True,
            "ok": True,
            "status": "candidate_manifest_present_smoke_skipped",
            "manifest_path": str(CANDIDATE_MANIFEST.relative_to(ROOT)),
        }
    result = run_command(["python3", "scripts/r27b2_browser_loader_smoke.py"])
    return {
        "available": True,
        "ok": result["ok"],
        "status": "candidate_manifest_smoke_passed" if result["ok"] else "candidate_manifest_smoke_failed",
        "manifest_path": str(CANDIDATE_MANIFEST.relative_to(ROOT)),
        "smoke": result,
    }


def audit(run_build: bool = True, run_routine_gates: bool = True, run_candidate_smoke: bool = True) -> dict:
    failures: list[str] = []
    components = component_status()
    for name, status in components.items():
        if not status["present"]:
            failures.append(f"component_missing:{name}:{','.join(status['missing'])}")

    scripts_status = package_scripts_not_recursive()
    failures.extend(scripts_status["failures"])

    route = route_smoke()
    failures.extend(f"route:{failure}" for failure in route["failures"])

    bundle = make_bundle_report()
    failures.extend(f"bundle:{failure}" for failure in bundle["failures"])

    build = {"skipped": not run_build, "ok": True}
    if run_build:
        build = run_command(["npm", "run", "build:vercel"])
        if not build["ok"]:
            failures.append("build_vercel_failed")

    routine_gates = {"skipped": not run_routine_gates, "ok": True}
    if run_routine_gates:
        routine_gates = run_command(["npm", "run", "check:no-training-in-routine-gates"])
        if not routine_gates["ok"]:
            failures.append("no_training_in_routine_gates_failed")

    candidate = candidate_smoke(run_candidate_smoke)
    if not candidate["ok"]:
        failures.append("candidate_loader_smoke_failed")

    return {
        "ok": not failures,
        "failures": failures,
        "base_branch": "origin/r27b3-static-rag-memory-assets",
        "branch": "r27b4-end-to-end-static-delivery-gate",
        "components": components,
        "package_scripts_not_recursive": scripts_status,
        "build_vercel": build,
        "no_training_in_routine_gates": routine_gates,
        "candidate_model": candidate,
        "route_smoke": route,
        "bundle": bundle,
        "no_backend_inference": True,
        "external_llm_api": False,
        "hosted_vector_store": False,
        "product_model": False,
        "product_model_admission": False,
        "release_checkpoint": False,
        "phase_4_approved": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--skip-routine-gates", action="store_true")
    parser.add_argument("--skip-candidate-smoke", action="store_true")
    args = parser.parse_args()
    report = audit(
        run_build=not args.skip_build,
        run_routine_gates=not args.skip_routine_gates,
        run_candidate_smoke=not args.skip_candidate_smoke,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
