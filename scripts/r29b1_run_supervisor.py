#!/usr/bin/env python3
"""Single foreground R29B1 supervisor.

It intentionally validates the two approved native environments before any
checkpoint path can be opened.  It writes durable evidence on every phase
transition and isolates all native imports in child processes.
"""
from __future__ import annotations

import argparse
import json
import os
import selectors
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.reference.r29b1_campaign import CAMPAIGN_ID, atomic_json, campaign_state, utc_now


def parse_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


class Supervisor:
    def __init__(self, artifact_root: Path, environment_root: Path, primary_python: str, fallback_python: str, start_at: str):
        self.artifact_root = artifact_root
        self.environment_root = environment_root
        self.primary_python = primary_python
        self.fallback_python = fallback_python
        self.start_at = start_at
        self.state_path = artifact_root / "campaign_state.json"
        self.heartbeat_path = artifact_root / "heartbeat_latest.json"
        self.log_path = artifact_root / "logs" / "foreground.log"
        self.child: subprocess.Popen[str] | None = None
        self.last_output_at = utc_now()

    def write(self, state: str, **extra: Any) -> None:
        payload = campaign_state(state=state, artifact_root=self.artifact_root, child_pid=self.child.pid if self.child else None, last_output_at_utc=self.last_output_at, **extra)
        atomic_json(self.state_path, payload)
        atomic_json(self.heartbeat_path, {"campaign_id": CAMPAIGN_ID, "phase": state, "updated_at_utc": utc_now(), "child_pid": payload["child_pid"], "last_output_at_utc": self.last_output_at})

    def write_environment_failures(self, failures: list[dict[str, Any]]) -> None:
        atomic_json(
            self.artifact_root / "reports" / "environment_failures.json",
            {
                "campaign_id": CAMPAIGN_ID,
                "created_at_utc": utc_now(),
                "failure_count": len(failures),
                "failures": failures,
                "training_started": False,
                "optimizer_tokens": 0,
                "assistant_target_tokens": 0,
            },
        )

    def run_child(self, phase: str, args: list[str], report: Path) -> tuple[int, dict[str, Any] | None]:
        command = [sys.executable, str(ROOT / "scripts/r29b1_environment_stage.py"), *args, "--output", str(report)]
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.write(phase, child_command=command, child_report=str(report), phase_started_at_utc=utc_now())
        self.child = subprocess.Popen(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1, start_new_session=True)
        selector = selectors.DefaultSelector()
        assert self.child.stdout is not None
        selector.register(self.child.stdout, selectors.EVENT_READ)
        last_heartbeat = time.monotonic()
        with self.log_path.open("a", encoding="utf-8") as log:
            while self.child.poll() is None:
                for key, _ in selector.select(timeout=1.0):
                    line = key.fileobj.readline()
                    if line:
                        self.last_output_at = utc_now()
                        print(line, end="", flush=True)
                        log.write(line)
                        log.flush()
                if time.monotonic() - last_heartbeat >= 30:
                    self.write(phase, child_command=command, child_report=str(report), phase_started_at_utc=utc_now())
                    last_heartbeat = time.monotonic()
            for line in self.child.stdout:
                self.last_output_at = utc_now()
                print(line, end="", flush=True)
                log.write(line)
        code = self.child.returncode
        self.child = None
        result = parse_json(report) if report.exists() else None
        self.write(phase, child_command=command, child_report=str(report), child_exit_code=code, child_result_present=result is not None)
        return int(code or 0), result

    def run(self) -> int:
        self.write("ORIENTATION", orientation_note="R29B0 retained as BLOCKED_WITH_EVIDENCE; tiny fixture is not real 96M evidence")
        discovery_report = self.artifact_root / "reports" / "environment_discovery.json"
        self.run_child("ENVIRONMENT_DISCOVERY", ["discover"], discovery_report)
        candidates = [
            ("primary", self.primary_python, self.environment_root / "r29b1-py312-torch213", "2.13.0"),
            ("fallback", self.fallback_python, self.environment_root / "r29b1-py311-torch212", "2.12.0"),
        ]
        failures: list[dict[str, Any]] = []
        if self.start_at == "fallback":
            primary_report = self.artifact_root / "reports" / "primary_environment_validation.json"
            if not primary_report.exists():
                self.write("ABORTED_SAFELY", reason="fallback_resume_missing_primary_evidence")
                return 3
            failures.append({"environment": "primary", "stage": "validation", "report": str(primary_report), "result": parse_json(primary_report)})
            candidates = candidates[1:]
        for label, python, venv, torch_version in candidates:
            install_report = self.artifact_root / "environment" / f"{label}_install.json"
            wheelhouse = self.artifact_root / "wheelhouse" / label
            install_code, install = self.run_child("ENVIRONMENT_INSTALL", ["install", "--python", python, "--environment", str(venv), "--wheelhouse", str(wheelhouse), "--torch-version", torch_version], install_report)
            if install_code != 0 or not install or not install.get("ok"):
                failures.append({"environment": label, "stage": "install", "report": str(install_report), "result": install})
                if label == "primary":
                    continue
                # This is distinct from a native import failure.  Preserve
                # evidence for a subsequent foreground repair/retry rather
                # than falsely claiming the approved environment matrix was
                # exhausted.
                self.write_environment_failures(failures)
                self.write("REPAIRING", reason="fallback_environment_install_requires_repair", environment_failures=failures)
                return 2
            validation_report = self.artifact_root / "reports" / f"{label}_environment_validation.json"
            validation_code, validation = self.run_child("ENVIRONMENT_VALIDATION", ["validate", "--python", str(venv / "bin/python")], validation_report)
            if validation_code == 0 and validation and validation.get("passed"):
                environment_manifest = {"campaign_id": CAMPAIGN_ID, "selected_environment": label, "install": install, "validation": validation, "created_at_utc": utc_now()}
                atomic_json(self.artifact_root / "environment" / "environment_manifest.json", environment_manifest)
                atomic_json(self.artifact_root / "environment" / "wheel_sha256.json", {"selected_environment": label, "wheels": install.get("wheel_entries", [])})
                (self.artifact_root / "environment" / "pip_freeze.txt").parent.mkdir(parents=True, exist_ok=True)
                (self.artifact_root / "environment" / "pip_freeze.txt").write_text(install.get("pip_freeze", ""), encoding="utf-8")
                self.write("CHECKPOINT_INVENTORY", selected_environment=label, selected_python=str(venv / "bin/python"), environment_validation=str(validation_report), next_phase="checkpoint_inventory")
                return 0
            failures.append({"environment": label, "stage": "validation", "report": str(validation_report), "result": validation})
            if label == "primary":
                continue
            self.write_environment_failures(failures)
            self.write("BLOCKED_WITH_EVIDENCE", reason="both_approved_environments_native_validation_failed", environment_failures=failures)
            return 2
        self.write("ABORTED_SAFELY", reason="environment_matrix_exhausted_unexpectedly", environment_failures=failures)
        return 3

    def interrupt(self, signum: int, _frame: Any) -> None:
        if self.child and self.child.poll() is None:
            os.killpg(self.child.pid, signum)
        self.write("ABORTED_SAFELY", reason=f"signal_{signum}")
        raise SystemExit(128 + signum)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--environment-root", type=Path, required=True)
    parser.add_argument("--primary-python", required=True)
    parser.add_argument("--fallback-python", required=True)
    parser.add_argument("--start-at", choices=("primary", "fallback"), default="primary")
    args = parser.parse_args()
    supervisor = Supervisor(args.artifact_root, args.environment_root, args.primary_python, args.fallback_python, args.start_at)
    signal.signal(signal.SIGINT, supervisor.interrupt)
    signal.signal(signal.SIGTERM, supervisor.interrupt)
    raise SystemExit(supervisor.run())


if __name__ == "__main__":
    main()
