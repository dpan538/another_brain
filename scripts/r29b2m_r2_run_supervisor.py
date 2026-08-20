#!/usr/bin/env python3
"""Single blocking foreground supervisor for the R29B2M-R2 data campaign."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_r2_campaign import (  # noqa: E402
    ACTIVE_STATES,
    STATES,
    TERMINAL_STATES,
    CampaignPaths,
    assert_no_training,
    atomic_json,
    initial_state,
    utc_now,
)


class Supervisor:
    def __init__(self, paths: CampaignPaths, source_revision: str) -> None:
        self.paths = paths
        if paths.state.exists():
            self.state = json.loads(paths.state.read_text(encoding="utf-8"))
        else:
            self.state = initial_state(artifact_root=paths.root, source_revision=source_revision)
        if self.state.get("campaign_id") != "r29b2m_r2_scenario_grounded_dataset_v1":
            raise ValueError("r29b2m_r2_campaign_state_mismatch")
        assert_no_training(self.state)
        self.child: subprocess.Popen[str] | None = None
        self.stop_requested = False
        self.interrupted = False
        self.heartbeat_thread: threading.Thread | None = None
        self.log_path = paths.logs / "foreground.log"

    def write(self) -> None:
        assert_no_training(self.state)
        self.state["updated_at"] = utc_now()
        atomic_json(self.paths.state, self.state)
        atomic_json(self.paths.heartbeat, {
            "campaign_id": self.state["campaign_id"], "created_at": utc_now(),
            "state": self.state["state"], "phase_started_at": self.state["phase_started_at"],
            "process_active": self.child is not None and self.child.poll() is None,
            "child_pid": self.state.get("child_pid"), "child_command": self.state.get("child_command"),
            "last_output": self.state.get("last_output"), "last_output_at": self.state.get("last_output_at"),
            "resume_status": self.state.get("resume_status"),
            "training_started": False, "optimizer_tokens": 0, "assistant_target_tokens": 0,
        })

    def log(self, message: str) -> None:
        self.paths.logs.mkdir(parents=True, exist_ok=True)
        line = f"{utc_now()} {message}\n"
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.flush()
        print(message, flush=True)

    def heartbeat_loop(self) -> None:
        while not self.stop_requested:
            self.write()
            for _ in range(30):
                if self.stop_requested:
                    return
                time.sleep(1)

    def start(self) -> None:
        self.write()
        self.heartbeat_thread = threading.Thread(target=self.heartbeat_loop, name="r29b2m-r2-heartbeat", daemon=True)
        self.heartbeat_thread.start()

    def transition(self, phase: str) -> None:
        if phase not in STATES:
            raise ValueError(f"unknown_r29b2m_r2_phase:{phase}")
        if phase == self.state["state"]:
            self.write()
            return
        self.state.update({
            "state": phase, "phase_started_at": utc_now(), "child_pid": None,
            "child_command": None, "last_output": None, "last_output_at": None,
            "resume_status": None, "interruption": None,
        })
        self.write()
        self.log(f"phase={phase}")

    def run_child(self, command: list[str]) -> int:
        if self.state["state"] not in ACTIVE_STATES:
            raise ValueError("cannot_run_child_outside_active_dataset_phase")
        if self.child is not None:
            raise ValueError("only_one_child_is_permitted")
        process = subprocess.Popen(
            command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, start_new_session=True,
        )
        self.child = process
        self.state.update({"child_pid": process.pid, "child_command": command, "resume_status": None})
        self.write()
        assert process.stdout is not None
        for line in process.stdout:
            self.state["last_output"] = line.rstrip()
            self.state["last_output_at"] = utc_now()
            self.write()
            print(line, end="", flush=True)
        exit_code = process.wait()
        self.state.update({"child_exit_code": exit_code, "child_pid": None, "child_command": None})
        self.child = None
        self.write()
        return exit_code

    def interrupt(self, signum: int) -> None:
        if self.interrupted:
            return
        self.interrupted = True
        self.stop_requested = True
        if self.child is not None and self.child.poll() is None:
            try:
                os.killpg(self.child.pid, signal.SIGTERM)
                self.child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(self.child.pid, signal.SIGKILL)
                self.child.wait(timeout=5)
            except ProcessLookupError:
                pass
        self.child = None
        self.state.update({
            "child_pid": None, "child_command": None, "resume_status": "PAUSED_RECOVERABLE",
            "interruption": {"status": "PAUSED_RECOVERABLE", "signal": signum, "at": utc_now()},
        })
        self.write()
        self.log(f"paused_recoverable signal={signum}")


def git_head() -> str:
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--phase", choices=STATES)
    parser.add_argument("--run-command", nargs=argparse.REMAINDER)
    parser.add_argument("--next-phase", choices=STATES)
    args = parser.parse_args()
    paths = CampaignPaths(args.artifact_root.resolve())
    paths.root.mkdir(parents=True, exist_ok=True)
    supervisor = Supervisor(paths, git_head())
    signal.signal(signal.SIGINT, lambda signum, _frame: supervisor.interrupt(signum))
    signal.signal(signal.SIGTERM, lambda signum, _frame: supervisor.interrupt(signum))
    supervisor.start()
    try:
        if args.phase:
            supervisor.transition(args.phase)
        if args.run_command:
            command = args.run_command[1:] if args.run_command and args.run_command[0] == "--" else args.run_command
            exit_code = supervisor.run_child(command)
            if exit_code == 0 and args.next_phase:
                supervisor.transition(args.next_phase)
            return exit_code
        supervisor.log("durable foreground dataset state ready")
        return 0
    finally:
        supervisor.stop_requested = True
        supervisor.write()


if __name__ == "__main__":
    raise SystemExit(main())
