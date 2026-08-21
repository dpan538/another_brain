"""Durable campaign and filesystem contracts for R29B2M-R3."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import tempfile
from typing import Any


CAMPAIGN_ID = "r29b2m_r3_exact_resume_daily_dialogue_sft_v1"
STATES = (
    "ORIENTATION",
    "EVIDENCE_ADOPTION",
    "DATASET_ADMISSION",
    "PRETRAIN_BASELINE",
    "TRAINER_IMPLEMENTATION",
    "CHECKPOINT_DRY_RUN",
    "RESUME_VALIDATION",
    "MEMORY_SMOKE",
    "SFT_SMOKE",
    "STAGE_A_TRAINING",
    "STAGE_A_EVALUATION",
    "STAGE_A_DECISION",
    "STAGE_B_TRAINING",
    "FINAL_EVALUATION",
    "CANDIDATE_SELECTION",
    "ENGINEERING_HANDOFF",
    "FINAL_VALIDATION",
    "PASSED_MLX_DIALOGUE_CANDIDATE",
    "BLOCKED_EVIDENCE_MISMATCH",
    "BLOCKED_RESOURCE_WITH_MEASURED_EVIDENCE",
    "BLOCKED_TRAINING_RUNTIME_WITH_EVIDENCE",
    "BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE",
    "ABORTED_SAFELY",
)
TERMINAL_STATES = frozenset(STATES[-6:])
ACTIVE_STATES = frozenset(STATES) - TERMINAL_STATES


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _atomic_text(path: Path, payload: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    os.replace(temporary, path)
    directory_fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def atomic_json(path: Path, value: dict[str, Any] | list[Any]) -> None:
    _atomic_text(path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def atomic_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    _atomic_text(path, "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows))


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
    def checkpoints(self) -> Path:
        return self.root / "checkpoints"

    @property
    def candidate(self) -> Path:
        return self.root / "candidate"

    @property
    def state(self) -> Path:
        return self.root / "campaign_state.json"

    @property
    def heartbeat(self) -> Path:
        return self.root / "heartbeat_latest.json"


def initial_state(*, artifact_root: Path, source_revision: str, parent_seed_sha256: str | None = None) -> dict[str, Any]:
    now = utc_now()
    return {
        "campaign_id": CAMPAIGN_ID,
        "state": "ORIENTATION",
        "phase_started_at": now,
        "updated_at": now,
        "artifact_root": str(artifact_root),
        "source_revision": source_revision,
        "supervisor_pid": None,
        "child_pid": None,
        "child_command": None,
        "last_output": None,
        "last_output_at": None,
        "parent_seed_sha256": parent_seed_sha256,
        "parent_checkpoint": "r28m1_q4_recovered_mlx_seed",
        "active_checkpoint": None,
        "candidate_checkpoint": None,
        "training_started": False,
        "global_optimizer_step": 0,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "logical_epoch": 0,
        "dataset_cursor": 0,
        "accumulation_index": 0,
        "current_train_loss": None,
        "validation_loss": None,
        "peak_mlx_memory_bytes": 0,
        "process_rss_bytes": 0,
        "free_disk_bytes": None,
        "best_behaviour_metrics": None,
        "patience_state": {"evaluations_without_meaningful_improvement": 0},
        "current_decision": None,
        "resume_status": None,
        "interruption": None,
        "human_review_completed": False,
        "product_training_admission": False,
        "weights_committed": False,
        "corpus_committed": False,
        "public_model_replaced": False,
        "deployment_performed": False,
        "q4_exported": False,
    }


def validate_state(state: dict[str, Any]) -> None:
    if state.get("campaign_id") != CAMPAIGN_ID:
        raise ValueError("r29b2m_r3_campaign_state_mismatch")
    if state.get("state") not in STATES and state.get("state") != "PAUSED_RECOVERABLE":
        raise ValueError("r29b2m_r3_unknown_state")
    if int(state.get("accumulation_index", 0)) != 0 and state.get("active_checkpoint"):
        raise ValueError("checkpoint_recorded_outside_accumulation_boundary")
    for key in ("optimizer_tokens", "assistant_target_tokens", "global_optimizer_step", "dataset_cursor"):
        if int(state.get(key, 0)) < 0:
            raise ValueError(f"negative_campaign_counter:{key}")
