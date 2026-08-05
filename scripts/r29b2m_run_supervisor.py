#!/usr/bin/env python3
"""Single foreground R29B2M supervisor with durable atomic state.

It never detaches work.  ``--adopt-existing-evidence`` is limited to evidence
already produced before this controller existed; normal operation launches one
phase subprocess at a time in its own process group and streams both outputs.
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.training.mlx.r29b2m_campaign import CAMPAIGN_ID, CampaignPaths, STATES, atomic_json, initial_state, read_state, utc_now, write_heartbeat, write_state  # noqa: E402


EVIDENCE_NEXT_STATE = (
    ("reports/orientation.json", "valid", "MLX_ENVIRONMENT"),
    ("reports/mlx_environment.json", "valid", "Q4_SOURCE_AUDIT"),
    ("reports/q4_source_audit.json", "valid", "MLX_ARCHITECTURE"),
    ("reports/mlx_architecture_audit.json", "valid", "MLX_FULL_CONTEXT"),
    ("reports/mlx_full_context.json", "all_layers_executed", "MLX_KV_CACHE"),
    ("reports/mlx_kv_parity.json", "valid", "SEED_BASELINE"),
)


class ForegroundSupervisor:
    def __init__(self, paths: CampaignPaths, source_revision: str) -> None:
        self.paths = paths
        self.state = read_state(paths, source_revision=source_revision)
        self.stop_requested = False
        self._heartbeat_thread: threading.Thread | None = None
        self._log_path = paths.logs / "foreground.log"
        self._child: subprocess.Popen[str] | None = None

    def _log(self, message: str) -> None:
        self.paths.logs.mkdir(parents=True, exist_ok=True)
        line = f"{utc_now()} {message}\n"
        with self._log_path.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.flush()
        print(message, flush=True)

    def _write(self) -> None:
        write_state(self.paths, self.state)
        write_heartbeat(self.paths, self.state)

    def _heartbeat_loop(self) -> None:
        while not self.stop_requested:
            self._write()
            time.sleep(30)

    def start_heartbeat(self) -> None:
        self._write()
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, name="r29b2m-heartbeat", daemon=True)
        self._heartbeat_thread.start()

    def set_phase(self, phase: str) -> None:
        if phase not in STATES:
            raise ValueError(f"unknown_r29b2m_phase:{phase}")
        self.state["state"] = phase
        self.state["phase_started_at"] = utc_now()
        self.state["child_pid"] = None
        self.state["child_command"] = None
        self.state["last_output"] = None
        self.state["last_output_at"] = None
        self._write()
        self._log(f"phase={phase}")

    def adopt_existing_evidence(self) -> str:
        next_state = "ORIENTATION"
        for relative, field, candidate in EVIDENCE_NEXT_STATE:
            report = self.paths.root / relative
            try:
                value = json.loads(report.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                break
            if value.get(field) is not True:
                break
            next_state = candidate
        self.set_phase(next_state)
        self.state["adopted_evidence_at"] = utc_now()
        self.state["adopted_evidence_only"] = True
        self._write()
        return next_state

    def run_child(self, command: list[str]) -> int:
        if self.state["state"] not in STATES[:15]:
            raise ValueError("cannot_run_child_in_terminal_state")
        process = subprocess.Popen(command, cwd=REPO_ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, start_new_session=True)
        self._child = process
        self.state["child_pid"] = process.pid
        self.state["child_command"] = command
        self._write()
        assert process.stdout is not None
        for line in process.stdout:
            self.state["last_output"] = line.rstrip()
            self.state["last_output_at"] = utc_now()
            self._write()
            print(line, end="", flush=True)
        result = process.wait()
        self.state["child_exit_code"] = result
        self.state["child_pid"] = None
        self.state["child_command"] = None
        self._write()
        self._child = None
        return result

    def interrupt(self, signum: int) -> None:
        self.stop_requested = True
        if self._child is not None and self._child.poll() is None:
            try:
                os.killpg(self._child.pid, signal.SIGTERM)
                self._child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(self._child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        self.state["interruption"] = {"status": "PAUSED_RECOVERABLE", "signal": signum, "at": utc_now()}
        self._write()
        self._log(f"paused_recoverable signal={signum}")


def git_head() -> str:
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, check=True)
    return result.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--adopt-existing-evidence", action="store_true")
    parser.add_argument("--run-command", nargs=argparse.REMAINDER)
    parser.add_argument("--next-phase", choices=STATES)
    parser.add_argument("--terminal-reason")
    args = parser.parse_args()
    paths = CampaignPaths(args.artifact_root)
    paths.root.mkdir(parents=True, exist_ok=True)
    if not paths.state.exists():
        write_state(paths, initial_state(artifact_root=paths.root, source_revision=git_head()))
    supervisor = ForegroundSupervisor(paths, git_head())
    signal.signal(signal.SIGINT, lambda signum, _frame: supervisor.interrupt(signum))
    signal.signal(signal.SIGTERM, lambda signum, _frame: supervisor.interrupt(signum))
    supervisor.start_heartbeat()
    try:
        if args.adopt_existing_evidence:
            state = supervisor.adopt_existing_evidence()
            supervisor._log(f"adopted_existing_evidence next_state={state}")
            return 0
        if args.run_command:
            if args.run_command[0] == "--":
                args.run_command = args.run_command[1:]
            exit_code = supervisor.run_child(args.run_command)
            if exit_code == 0 and args.next_phase:
                supervisor.set_phase(args.next_phase)
                if args.next_phase in {"PASSED_MLX_DIALOGUE_Q4_GATE", "BLOCKED_MLX_RUNTIME_WITH_EVIDENCE", "BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE", "ABORTED_SAFELY"}:
                    supervisor.state["terminal_reason"] = args.terminal_reason
                    supervisor.state["terminal_at"] = utc_now()
                    supervisor._write()
            return exit_code
        supervisor._log("no child command supplied; durable state initialized")
        return 0
    finally:
        supervisor.stop_requested = True
        supervisor._write()


if __name__ == "__main__":
    raise SystemExit(main())
