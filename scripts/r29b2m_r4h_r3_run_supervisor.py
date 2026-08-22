#!/usr/bin/env python3
"""Blocking foreground supervisor for bounded R29B2M-R4H-R3 live phases."""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CAMPAIGN_ID = "r29b2m_r4h_r3_controlled_critic_hybrid_v1"
PHASE_STATES = {
    "provider-baseline": "CONTROLLED_BASELINE",
    "one-call-diagnostic": "ONE_CALL_CAUSAL_REPLAY",
    "one-call-expansion": "ONE_CALL_DECISION",
    "two-stage": "TWO_STAGE_LIVE_EVAL",
}
SUCCESS_STATES = {
    "provider-baseline": "CONTROLLED_BASELINE_COMPLETE_AWAITING_VARIANCE_REVIEW",
    "one-call-diagnostic": "ONE_CALL_CAUSAL_REPLAY_COMPLETE_AWAITING_BLIND_REVIEW",
    "one-call-expansion": "ONE_CALL_EXPANSION_COMPLETE_AWAITING_BLIND_REVIEW",
    "two-stage": "TWO_STAGE_LIVE_EVAL_COMPLETE_AWAITING_BLIND_REVIEW",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def safe_line(value: str) -> str:
    value = re.sub(r"Bearer\s+[A-Za-z0-9._~+/=-]+", "Bearer [REDACTED]", value, flags=re.I)
    value = re.sub(r"(?:api[ _-]?key|authorization)\s*[:=]\s*[^\s,;]+", "[REDACTED_SECRET_REFERENCE]", value, flags=re.I)
    return value.rstrip()[-2000:]


def load_secret(repo: Path) -> tuple[bool, str | None]:
    secret_path = repo / ".env.deepseek.local"
    if not secret_path.is_file():
        return False, "secret_file_missing"
    try:
        value: str | None = None
        for raw in secret_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if not line.startswith("DEEPSEEK_API_KEY="):
                return False, "secret_file_unexpected_field"
            candidate = line.split("=", 1)[1].strip()
            if len(candidate) >= 2 and candidate[0] == candidate[-1] and candidate[0] in {'"', "'"}:
                candidate = candidate[1:-1]
            if not candidate or value is not None:
                return False, "secret_file_invalid_value"
            value = candidate
        if value is None:
            return False, "secret_key_missing"
        os.environ["DEEPSEEK_API_KEY"] = value
        return True, None
    except (OSError, UnicodeError):
        return False, "secret_file_unreadable"


class Supervisor:
    def __init__(self, repo: Path, artifact_root: Path, phase: str) -> None:
        self.repo = repo.resolve()
        self.artifact_root = artifact_root.resolve()
        self.phase = phase
        self.state_path = self.artifact_root / "supervisor_state.json"
        self.heartbeat_path = self.artifact_root / "heartbeat_latest.json"
        self.log_path = self.artifact_root / "logs" / "foreground_live.log"
        self.child: subprocess.Popen[str] | None = None
        self.stop_event = threading.Event()
        self.interrupted = False
        key_present, configuration_error = load_secret(self.repo)
        self.state: dict[str, Any] = {
            "campaign_id": CAMPAIGN_ID,
            "state": "PREFLIGHT",
            "phase": phase,
            "updated_at": utc_now(),
            "supervisor_pid": os.getpid(),
            "child_pid": None,
            "child_command": None,
            "child_exit_code": None,
            "key_present": key_present,
            "key_value_logged": False,
            "configuration_error": configuration_error,
            "environment_dumped": False,
            "maximum_total_requests": 200,
            "maximum_estimated_cost_cny": 2.0,
            "concurrency": 1,
            "temperature": 0,
            "top_p_sent": False,
            "old_R4H_R2_terminal": "BLOCKED_HYBRID_V2_FACTUAL",
            "old_R4H_R2_terminal_modified": False,
            "production_deployment": False,
            "production_API_route": False,
            "production_UI_modified": False,
            "training_started": False,
            "optimizer_tokens": 0,
            "assistant_target_tokens": 0,
            "actual_efish_critic_model_trained": False,
            "oracle_critic": True,
        }

    def write(self) -> None:
        self.state["updated_at"] = utc_now()
        atomic_json(self.state_path, self.state)

    def transition(self, state: str) -> None:
        self.state["state"] = state
        self.write()

    def heartbeat(self) -> None:
        while not self.stop_event.wait(5):
            atomic_json(self.heartbeat_path, {**self.state, "heartbeat_at": utc_now(), "process_active": True})

    def stop(self, *_args: object) -> None:
        self.interrupted = True
        if self.child and self.child.poll() is None:
            try:
                os.killpg(self.child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass

    def run(self) -> int:
        if not self.state["key_present"]:
            self.transition("BLOCKED_LIVE_CONFIGURATION")
            atomic_json(self.heartbeat_path, {**self.state, "heartbeat_at": utc_now(), "process_active": False})
            return 2
        self.artifact_root.mkdir(parents=True, exist_ok=True)
        heartbeat = threading.Thread(target=self.heartbeat, name="r4h-r3-heartbeat", daemon=True)
        heartbeat.start()
        self.transition(PHASE_STATES[self.phase])
        command = [
            "node",
            "--experimental-strip-types",
            "scripts/r29b2m_r4h_r3_live_experiment.mjs",
            "--phase",
            self.phase,
            "--artifact-root",
            str(self.artifact_root),
        ]
        self.state["child_command"] = [
            "node",
            "--experimental-strip-types",
            "r29b2m_r4h_r3_live_experiment.mjs",
            "--phase",
            self.phase,
            "--artifact-root",
            "artifacts/r29b2m_r4h_r3",
        ]
        self.child = subprocess.Popen(
            command,
            cwd=self.repo,
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            start_new_session=True,
        )
        self.state["child_pid"] = self.child.pid
        self.write()
        assert self.child.stdout is not None
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a", encoding="utf-8") as log:
            for raw in self.child.stdout:
                line = safe_line(raw)
                if not line:
                    continue
                print(line, flush=True)
                log.write(f"{utc_now()} {line}\n")
                log.flush()
        code = self.child.wait()
        self.state["child_exit_code"] = code
        self.state["child_pid"] = None
        self.state["child_command"] = None
        try:
            live_state = json.loads((self.artifact_root / "live_state.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            live_state = {}
        for field in ["live_request_count", "input_tokens", "output_tokens", "cache_hit_tokens", "cache_miss_tokens", "estimated_cost_usd", "estimated_cost_cny_conservative_upper_bound"]:
            if field in live_state:
                self.state[field] = live_state[field]
        if self.interrupted:
            self.transition("ABORTED_SAFELY")
            result = 130
        elif code != 0:
            self.transition("BLOCKED_LIVE_CONFIGURATION")
            result = code
        else:
            self.transition(SUCCESS_STATES[self.phase])
            result = 0
        self.stop_event.set()
        heartbeat.join(timeout=2)
        atomic_json(self.heartbeat_path, {**self.state, "heartbeat_at": utc_now(), "process_active": False})
        return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--artifact-root", type=Path, default=Path("artifacts/r29b2m_r4h_r3"))
    parser.add_argument("--phase", choices=sorted(PHASE_STATES), required=True)
    args = parser.parse_args()
    artifact_root = args.artifact_root if args.artifact_root.is_absolute() else args.repo / args.artifact_root
    supervisor = Supervisor(args.repo, artifact_root, args.phase)
    signal.signal(signal.SIGINT, supervisor.stop)
    signal.signal(signal.SIGTERM, supervisor.stop)
    return supervisor.run()


if __name__ == "__main__":
    raise SystemExit(main())
