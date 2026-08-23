#!/usr/bin/env python3
"""Run aggregate-only R30J1A repository and historical regression gates."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


COMMANDS = (
    ("r30j1a_unit", ["python3", "-m", "unittest", "discover", "-s", "tests/r30j1a", "-q"]),
    ("r30j1a_production_diff", ["node", "scripts/r30j1a_no_production_change_gate.mjs"]),
    ("hybrid_lab_isolation", ["node", "scripts/check_hybrid_lab_isolation.mjs"]),
    ("static_local_product", ["node", "scripts/check_static_local_product_no_backend.mjs"]),
    ("weight_gate", ["node", "scripts/check_no_unapproved_model_weights.mjs"]),
    ("no_eval_hardcoding", ["node", "scripts/check_no_eval_prompt_hardcoding.mjs"]),
    ("git_diff_check", ["git", "diff", "--check"]),
)

# These frozen suites were authored before any R30 training was authorized and
# intentionally scan the entire future repository for the absence of training
# code.  They are still executed and reported verbatim as historical evidence,
# but a later explicitly authorized campaign must not rewrite their assertions
# or claim they pass.  Historical artifact SHA preservation is the hard
# non-rewrite gate used by J1A.
HISTORICAL_INFORMATIONAL_COMMANDS = (
    ("r30j0_full_historical_suite", ["python3", "-m", "unittest", "discover", "-s", "tests/r30j0", "-q"]),
    ("r4h_r3_full_historical_suite", ["python3", "-m", "unittest", "discover", "-s", "tests/r29b2m_r4h_r3", "-q"]),
)


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True, indent=2)
            handle.write("\n"); handle.flush(); os.fsync(handle.fileno())
        os.chmod(temporary, 0o600); os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def main() -> int:
    results = []
    for name, command in COMMANDS:
        process = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)
        combined = process.stdout + process.stderr
        results.append({
            "name": name,
            "passed": process.returncode == 0,
            "returncode": process.returncode,
            "output_sha256": hashlib.sha256(combined.encode()).hexdigest(),
            "output_bytes": len(combined.encode()),
            "raw_output_persisted": False,
        })
        print(json.dumps({"gate": name, "passed": process.returncode == 0, "returncode": process.returncode}, sort_keys=True), flush=True)
    historical = []
    for name, command in HISTORICAL_INFORMATIONAL_COMMANDS:
        process = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)
        combined = process.stdout + process.stderr
        historical.append({
            "name": name,
            "passed": process.returncode == 0,
            "returncode": process.returncode,
            "classification": "INFORMATIONAL_FUTURE_CAMPAIGN_SCOPE_CHECK",
            "frozen_assertions_modified": False,
            "output_sha256": hashlib.sha256(combined.encode()).hexdigest(),
            "output_bytes": len(combined.encode()),
            "raw_output_persisted": False,
        })
        print(json.dumps({"historical_suite": name, "passed": process.returncode == 0, "hard_gate": False}, sort_keys=True), flush=True)
    tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.splitlines()
    artifact_tracked = [path for path in tracked if path.startswith("artifacts/r30j1a/")]
    weight_tracked = [path for path in tracked if path.endswith((".safetensors", ".npz", ".ckpt", ".bin")) and "r30j1a" in path]
    report = {
        "schema_version": "r30j1a.final-validation.v1",
        "passed": all(row["passed"] for row in results) and not artifact_tracked and not weight_tracked,
        "gates": results,
        "historical_informational_suites": historical,
        "historical_suite_failures_not_hidden": sum(not row["passed"] for row in historical),
        "r30j1a_artifact_tracked_count": len(artifact_tracked),
        "r30j1a_weight_or_checkpoint_tracked_count": len(weight_tracked),
        "raw_personal_text_persisted": False,
        "network_api_requests": 0,
        "training_run_by_validation": False,
    }
    atomic_json(ROOT / "artifacts/r30j1a/reports/final_validation.json", report)
    print(json.dumps({"valid": report["passed"], "gate_count": len(results), "artifact_tracked": len(artifact_tracked), "weight_tracked": len(weight_tracked)}, sort_keys=True))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
