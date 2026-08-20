"""Durable state and resource contracts for R29B2M-R1."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import tempfile
from typing import Any


CAMPAIGN_ID = "r29b2m_r1_measured_sft_v1"
STATES = (
    "ORIENTATION",
    "EVIDENCE_ADOPTION",
    "Q4_ENCODING_AUDIT",
    "Q4_BROWSER_DECODER_REPAIR",
    "RESOURCE_MEASUREMENT",
    "RESOURCE_DECISION",
    "EVAL_V2_FREEZE",
    "DATASET_BUILD",
    "DATASET_VALIDATION",
    "DATASET_AGENT_AUDIT",
    "TRAINING_IMPLEMENTATION",
    "RESUME_VALIDATION",
    "SFT_SMOKE",
    "STAGE_A_TRAINING",
    "STAGE_A_EVALUATION",
    "STAGE_B_TRAINING",
    "FINAL_EVALUATION",
    "CANDIDATE_SELECTION",
    "PASSED_MLX_DIALOGUE_CANDIDATE",
    "BLOCKED_RESOURCE_WITH_MEASURED_EVIDENCE",
    "BLOCKED_DATA_QUALITY_WITH_EVIDENCE",
    "BLOCKED_TRAINING_RUNTIME_WITH_EVIDENCE",
    "BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE",
    "ABORTED_SAFELY",
)
TERMINAL_STATES = frozenset(STATES[-6:])


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, value: dict[str, Any]) -> None:
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
        "human_review_completed": False,
    }


def calculate_dynamic_budget(*, full_checkpoint_bytes: int, measured_final_dataset_bytes: int) -> dict[str, int]:
    if full_checkpoint_bytes <= 0 or measured_final_dataset_bytes < 0:
        raise ValueError("invalid_dynamic_budget_measurement")
    retained_checkpoint_count = 3
    retained_checkpoint_budget = full_checkpoint_bytes * retained_checkpoint_count
    atomic_checkpoint_headroom = full_checkpoint_bytes
    dataset_budget = max(measured_final_dataset_bytes * 2, 1_000_000_000)
    evaluation_and_log_budget = 1_000_000_000
    temporary_training_budget = 1_000_000_000
    post_campaign_warning_floor = 25_000_000_000
    post_campaign_hard_floor = 20_000_000_000
    required_free_before_training = (
        retained_checkpoint_budget
        + atomic_checkpoint_headroom
        + dataset_budget
        + evaluation_and_log_budget
        + temporary_training_budget
        + post_campaign_hard_floor
    )
    return {
        "retained_checkpoint_count": retained_checkpoint_count,
        "retained_checkpoint_budget": retained_checkpoint_budget,
        "atomic_checkpoint_headroom": atomic_checkpoint_headroom,
        "dataset_budget": dataset_budget,
        "evaluation_and_log_budget": evaluation_and_log_budget,
        "temporary_training_budget": temporary_training_budget,
        "post_campaign_warning_floor": post_campaign_warning_floor,
        "post_campaign_hard_floor": post_campaign_hard_floor,
        "required_free_before_training": required_free_before_training,
    }
