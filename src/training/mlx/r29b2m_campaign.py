"""Durable state primitives shared by the R29B2M foreground campaign."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import tempfile
from typing import Any


CAMPAIGN_ID = "r29b2m_m1_mlx_daily_dialogue_v1"
STATES = (
    "ORIENTATION",
    "MLX_ENVIRONMENT",
    "Q4_SOURCE_AUDIT",
    "MLX_ARCHITECTURE",
    "MLX_FULL_CONTEXT",
    "MLX_KV_CACHE",
    "SEED_BASELINE",
    "DIALOGUE_DATASET",
    "TRAINING_SMOKE",
    "DIALOGUE_SFT",
    "CANDIDATE_EVALUATION",
    "Q4V2_EXPORT",
    "Q4V2_EVALUATION",
    "BROWSER_HANDOFF",
    "FINAL_VALIDATION",
    "PASSED_MLX_DIALOGUE_Q4_GATE",
    "BLOCKED_MLX_RUNTIME_WITH_EVIDENCE",
    "BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE",
    "ABORTED_SAFELY",
)
TERMINAL_STATES = frozenset(STATES[-4:])


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    """Write a JSON record atomically without leaving a partial state file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    os.replace(temporary, path)


@dataclass(frozen=True)
class CampaignPaths:
    root: Path

    @property
    def reports(self) -> Path:
        return self.root / "reports"

    @property
    def logs(self) -> Path:
        return self.root / "logs"

    @property
    def state(self) -> Path:
        return self.root / "campaign_state.json"

    @property
    def heartbeat(self) -> Path:
        return self.root / "heartbeat_latest.json"


def initial_state(*, artifact_root: Path, source_revision: str | None = None) -> dict[str, Any]:
    return {
        "campaign_id": CAMPAIGN_ID,
        "state": "ORIENTATION",
        "phase_started_at": utc_now(),
        "updated_at": utc_now(),
        "artifact_root": str(artifact_root),
        "source_revision": source_revision,
        "child_pid": None,
        "child_command": None,
        "last_output_at": None,
        "last_output": None,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "candidate_checkpoint": None,
        "parent_checkpoint": None,
        "public_model_replaced": False,
        "deployment_performed": False,
        "external_api_used": False,
        "corpus_committed": False,
        "weights_committed": False,
    }


def read_state(paths: CampaignPaths, *, source_revision: str | None = None) -> dict[str, Any]:
    if not paths.state.exists():
        return initial_state(artifact_root=paths.root, source_revision=source_revision)
    value = json.loads(paths.state.read_text(encoding="utf-8"))
    if value.get("campaign_id") != CAMPAIGN_ID or value.get("state") not in STATES:
        raise ValueError("invalid_r29b2m_campaign_state")
    return value


def write_state(paths: CampaignPaths, state: dict[str, Any]) -> None:
    state = dict(state)
    state["updated_at"] = utc_now()
    atomic_json(paths.state, state)


def write_heartbeat(paths: CampaignPaths, state: dict[str, Any]) -> None:
    atomic_json(paths.heartbeat, {
        "campaign_id": CAMPAIGN_ID,
        "state": state["state"],
        "phase_started_at": state.get("phase_started_at"),
        "child_pid": state.get("child_pid"),
        "child_command": state.get("child_command"),
        "last_output_at": state.get("last_output_at"),
        "written_at": utc_now(),
        "training_started": state.get("training_started", False),
        "optimizer_tokens": state.get("optimizer_tokens", 0),
        "assistant_target_tokens": state.get("assistant_target_tokens", 0),
    })
