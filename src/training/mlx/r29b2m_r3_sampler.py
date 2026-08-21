"""Deterministic quality-weighted schedule for the admitted R2 train split."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import random
from typing import Any, Sequence


CAMPAIGN_SEED = 29032026
QUALITY_WEIGHTS = {"gold_canonical": 2, "verified_surface_variant": 1}


@dataclass(frozen=True)
class ScheduleEntry:
    epoch: int
    schedule_position: int
    row_index: int
    session_id: str
    family_id: str
    quality_tier: str
    supervised_tokens: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "epoch": self.epoch,
            "schedule_position": self.schedule_position,
            "row_index": self.row_index,
            "session_id": self.session_id,
            "family_id": self.family_id,
            "quality_tier": self.quality_tier,
            "supervised_tokens": self.supervised_tokens,
        }


def validate_sampling_contract(contract: dict[str, Any]) -> None:
    if contract.get("valid") is not True:
        raise ValueError("sampling_contract_invalid")
    actual = {
        str(name): int(spec.get("weight", -1))
        for name, spec in contract.get("quality_tiers", {}).items()
    }
    if actual != QUALITY_WEIGHTS:
        raise ValueError(f"sampling_contract_weight_mismatch:{actual}")
    forbidden = set(contract.get("forbidden_tiers", []))
    if not {"legacy_r1_generated", "synthetic_unreviewed"}.issubset(forbidden):
        raise ValueError("sampling_contract_missing_forbidden_tiers")


def build_epoch_schedule(
    rows: Sequence[dict[str, Any]],
    *,
    epoch: int,
    seed: int = CAMPAIGN_SEED,
) -> tuple[ScheduleEntry, ...]:
    if epoch < 0:
        raise ValueError("negative_logical_epoch")
    expanded: list[int] = []
    for index, row in enumerate(rows):
        tier = str(row.get("quality_tier"))
        if tier not in QUALITY_WEIGHTS:
            raise ValueError(f"forbidden_schedule_quality_tier:{tier}")
        expanded.extend([index] * QUALITY_WEIGHTS[tier])
    # A derived integer seed avoids dependence on global RNG state and makes
    # an epoch independently reconstructable after a new process starts.
    derived = int.from_bytes(hashlib.sha256(f"{seed}:{epoch}".encode()).digest()[:8], "big")
    random.Random(derived).shuffle(expanded)
    return tuple(
        ScheduleEntry(
            epoch=epoch,
            schedule_position=position,
            row_index=row_index,
            session_id=str(rows[row_index]["session_id"]),
            family_id=str(rows[row_index]["family_id"]),
            quality_tier=str(rows[row_index]["quality_tier"]),
            supervised_tokens=int(rows[row_index]["token_counts"]["assistant_target_including_eos"]),
        )
        for position, row_index in enumerate(expanded)
    )


def schedule_sha256(entries: Sequence[ScheduleEntry]) -> str:
    payload = json.dumps([entry.as_dict() for entry in entries], sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def schedule_manifest(entries: Sequence[ScheduleEntry], *, seed: int = CAMPAIGN_SEED) -> dict[str, Any]:
    if not entries:
        raise ValueError("empty_schedule")
    family_distribution: dict[str, int] = {}
    quality_distribution: dict[str, int] = {}
    for entry in entries:
        family_distribution[entry.family_id] = family_distribution.get(entry.family_id, 0) + 1
        quality_distribution[entry.quality_tier] = quality_distribution.get(entry.quality_tier, 0) + 1
    return {
        "campaign_seed": seed,
        "logical_epoch": entries[0].epoch,
        "entry_count": len(entries),
        "schedule_sha256": schedule_sha256(entries),
        "family_distribution": dict(sorted(family_distribution.items())),
        "quality_distribution": dict(sorted(quality_distribution.items())),
        "entries": [entry.as_dict() for entry in entries],
    }
