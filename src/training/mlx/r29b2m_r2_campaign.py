"""Durable, dataset-only campaign contract for R29B2M-R2."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import tempfile
from typing import Any


CAMPAIGN_ID = "r29b2m_r2_scenario_grounded_dataset_v1"
STATES = (
    "ORIENTATION",
    "EVIDENCE_ADOPTION",
    "REJECTED_DATASET_QUARANTINE",
    "ROOT_CAUSE_REGRESSION",
    "SCHEMA_DESIGN",
    "SEED_REVIEW",
    "SEED_REPAIR",
    "PILOT_BUILD",
    "PILOT_VALIDATION",
    "PILOT_SEMANTIC_AUDIT",
    "FULL_BUILD",
    "FULL_VALIDATION",
    "FULL_SEMANTIC_AUDIT",
    "HUMAN_REVIEW_PACK",
    "DATASET_ADMISSION",
    "PASSED_DATASET_ADMISSION_READY_FOR_SFT",
    "BLOCKED_CANONICAL_SEED_QUALITY",
    "BLOCKED_VARIATION_QUALITY",
    "BLOCKED_SEMANTIC_AUDIT",
    "ABORTED_SAFELY",
)
ACTIVE_STATES = frozenset(STATES[:15])
TERMINAL_STATES = frozenset(STATES[15:])


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, value: dict[str, Any] | list[Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    os.replace(temporary, path)


def atomic_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(payload)
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


def initial_state(*, artifact_root: Path, source_revision: str) -> dict[str, Any]:
    now = utc_now()
    return {
        "campaign_id": CAMPAIGN_ID,
        "state": "ORIENTATION",
        "phase_started_at": now,
        "updated_at": now,
        "artifact_root": str(artifact_root),
        "source_revision": source_revision,
        "child_pid": None,
        "child_command": None,
        "last_output": None,
        "last_output_at": None,
        "interruption": None,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "parent_checkpoint": None,
        "candidate_checkpoint": None,
        "weights_committed": False,
        "corpus_committed": False,
        "public_model_replaced": False,
        "deployment_performed": False,
        "human_review_completed": False,
    }


def assert_no_training(state: dict[str, Any]) -> None:
    expected = {
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "parent_checkpoint": None,
        "candidate_checkpoint": None,
    }
    for key, value in expected.items():
        if state.get(key) != value:
            raise ValueError(f"r29b2m_r2_training_boundary_violated:{key}")
