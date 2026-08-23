"""Pure supervision helpers for the foreground-only R30J1A campaign.

This module intentionally has no MLX dependency so resource parsing and
failure-accounting contracts can be exercised by the ordinary unit suite.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any, Mapping, Sequence


MLX_HARD_STOP_BYTES = 6_500_000_000
SWAP_GROWTH_STOP_BYTES = 1_000_000_000
MEMORY_PRESSURE_WARNING_FREE_PERCENT = 10
MEMORY_PRESSURE_CRITICAL_FREE_PERCENT = 5


def parse_swap_usage(text: str) -> dict[str, int]:
    """Parse macOS ``vm.swapusage`` output or fail closed."""

    matches = re.findall(r"(total|used|free)\s*=\s*([0-9.]+)([KMGT])", text)
    if len(matches) != 3:
        raise ValueError("swap_telemetry_duplicate_or_extra_fields")
    values = {name: (number, unit) for name, number, unit in matches}
    if set(values) != {"total", "used", "free"}:
        raise ValueError("swap_telemetry_incomplete")
    powers = {"K": 1, "M": 2, "G": 3, "T": 4}
    result = {
        f"{name}_bytes": int(float(number) * (1024 ** powers[unit]))
        for name, (number, unit) in values.items()
    }
    # sysctl rounds each displayed value independently.  Permit a small
    # display-rounding discrepancy, but never accept impossible accounting.
    discrepancy = abs(result["total_bytes"] - result["used_bytes"] - result["free_bytes"])
    if discrepancy > 4 * 1024 * 1024:
        raise ValueError("swap_telemetry_accounting_mismatch")
    return result


def parse_memory_pressure(text: str) -> dict[str, Any]:
    """Convert macOS ``memory_pressure`` output into a conservative gate."""

    match = re.search(r"System-wide memory free percentage:\s*([0-9]+)%", text)
    if match is None:
        raise ValueError("memory_pressure_telemetry_incomplete")
    free_percent = int(match.group(1))
    if not 0 <= free_percent <= 100:
        raise ValueError("memory_pressure_percentage_invalid")
    if free_percent <= MEMORY_PRESSURE_CRITICAL_FREE_PERCENT:
        state = "critical"
    elif free_percent <= MEMORY_PRESSURE_WARNING_FREE_PERCENT:
        state = "warning"
    else:
        state = "normal"
    return {
        "state": state,
        "free_percent": free_percent,
        "warning_at_or_below_free_percent": MEMORY_PRESSURE_WARNING_FREE_PERCENT,
        "critical_at_or_below_free_percent": MEMORY_PRESSURE_CRITICAL_FREE_PERCENT,
        "source": "macos_memory_pressure",
    }


def validate_resource_snapshot(snapshot: Mapping[str, Any]) -> None:
    """Reject missing or placeholder telemetry instead of treating it as safe."""

    required_positive = (
        "system_ram_bytes",
        "available_ram_bytes",
        "process_rss_bytes",
        "free_disk_bytes",
    )
    for key in required_positive:
        if int(snapshot.get(key, 0)) <= 0:
            raise ValueError(f"resource_telemetry_invalid:{key}")
    for key in ("mlx_active_memory_bytes", "mlx_cache_memory_bytes", "mlx_peak_memory_bytes"):
        if int(snapshot.get(key, -1)) < 0:
            raise ValueError(f"resource_telemetry_invalid:{key}")
    swap = snapshot.get("swap")
    if not isinstance(swap, Mapping):
        raise ValueError("resource_telemetry_invalid:swap")
    for key in ("total_bytes", "used_bytes", "free_bytes"):
        if int(swap.get(key, -1)) < 0:
            raise ValueError(f"resource_telemetry_invalid:swap.{key}")
    pressure = snapshot.get("memory_pressure")
    if not isinstance(pressure, Mapping) or pressure.get("state") not in {"normal", "warning", "critical"}:
        raise ValueError("resource_telemetry_invalid:memory_pressure")


def resource_stop_reason(before: Mapping[str, Any], current: Mapping[str, Any]) -> str | None:
    """Return the first conservative stop reason, or ``None`` when safe."""

    validate_resource_snapshot(before)
    validate_resource_snapshot(current)
    if current["memory_pressure"]["state"] != "normal":
        return "j1a_memory_pressure_not_normal"
    if int(current["mlx_peak_memory_bytes"]) > MLX_HARD_STOP_BYTES:
        return "j1a_mlx_hard_stop_exceeded"
    swap_growth = int(current["swap"]["used_bytes"]) - int(before["swap"]["used_bytes"])
    if swap_growth > SWAP_GROWTH_STOP_BYTES:
        return "j1a_swap_growth_stop"
    return None


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def safe_failure_code(error: BaseException | str) -> str:
    """Produce an aggregate-only failure code without persisting local paths."""

    if isinstance(error, BaseException):
        raw = str(error).strip("'\"")
        kind = type(error).__name__
    else:
        raw = str(error)
        kind = "RecordedFailure"
    if re.fullmatch(r"[A-Za-z0-9_.:-]{1,120}", raw):
        return raw
    return kind


def build_failed_segment_receipt(
    *,
    segment_root: Path,
    error: BaseException | str,
    failure_source: str,
    checkpoint_root: Path | None = None,
) -> dict[str, Any]:
    """Derive an auditable failed receipt solely from durable segment events."""

    manifest_path = segment_root / "segment_manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError("failed_segment_manifest_missing")
    if (segment_root / "segment_receipt.json").exists():
        raise FileExistsError("segment_receipt_already_exists")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    train_events = read_jsonl(segment_root / "train_events.jsonl")
    resource_events = read_jsonl(segment_root / "resource_events.jsonl")
    start_step = int(manifest.get("starting_global_optimizer_step", 0))
    last_train = train_events[-1] if train_events else {}
    attempted_end = int(last_train.get("global_optimizer_step", start_step))
    if attempted_end < start_step or attempted_end - start_step != len(train_events):
        raise ValueError("failed_segment_event_step_mismatch")
    before_value = manifest.get("resource_before")
    before: Mapping[str, Any] = before_value if isinstance(before_value, Mapping) else {}
    last_resource: Mapping[str, Any] = resource_events[-1] if resource_events else before
    # Historical malformed telemetry is preserved, not silently blessed.
    telemetry_complete = True
    try:
        validate_resource_snapshot(before)
        validate_resource_snapshot(last_resource)
    except (TypeError, ValueError):
        telemetry_complete = False
    swap_delta = None
    if telemetry_complete:
        swap_delta = int(last_resource["swap"]["used_bytes"]) - int(before["swap"]["used_bytes"])
    peak_rss = max(
        [int(before.get("process_rss_bytes", 0))]
        + [int(row.get("process_rss_bytes", 0)) for row in resource_events]
        + [int(row.get("process_rss_bytes", 0)) for row in train_events]
    )
    peak_mlx = max(
        [int(before.get("mlx_peak_memory_bytes", 0))]
        + [int(row.get("mlx_peak_memory_bytes", 0)) for row in resource_events]
        + [int(row.get("MLX_peak_memory_bytes", 0)) for row in train_events]
    )
    attempted_state = {
        "global_optimizer_step": attempted_end,
        "examples_seen": int(last_train.get("examples_seen", 0)),
        "optimizer_tokens": int(last_train.get("optimizer_tokens", 0)),
        "representation_target_examples": int(last_train.get("representation_target_examples", 0)),
        "assistant_target_tokens": int(last_train.get("assistant_target_tokens", 0)),
    }
    durable_start = manifest.get("starting_training_state")
    if not isinstance(durable_start, Mapping):
        durable_start = {
            "global_optimizer_step": start_step,
            "examples_seen": 0,
            "optimizer_tokens": 0,
            "representation_target_examples": 0,
            "assistant_target_tokens": 0,
        }
    checkpoint: dict[str, Any] | None = None
    checkpoint_training_state: dict[str, Any] | None = None
    if checkpoint_root is not None and checkpoint_root.is_dir():
        candidates = sorted(path for path in checkpoint_root.iterdir() if path.is_dir())
        if len(candidates) > 1:
            raise ValueError("failed_segment_checkpoint_count_ambiguous")
        if candidates:
            receipt_path = candidates[0] / "checkpoint_receipt.json"
            if receipt_path.is_file():
                candidate = json.loads(receipt_path.read_text(encoding="utf-8"))
                if candidate.get("verified") is True:
                    checkpoint = candidate
                    state_path = candidates[0] / "training_state.json"
                    if state_path.is_file():
                        checkpoint_training_state = json.loads(state_path.read_text(encoding="utf-8"))
    checkpoint_verified = checkpoint is not None
    durable_step = int(checkpoint["global_optimizer_step"]) if checkpoint_verified else int(durable_start["global_optimizer_step"])
    discarded_updates = max(0, attempted_end - durable_step)
    return {
        "schema_version": "r30j1a.failed-segment-receipt.v1",
        "campaign_id": manifest["campaign_id"],
        "segment_id": manifest["segment_id"],
        "phase": manifest["phase"],
        "completed": False,
        "failed": True,
        "failure_code": safe_failure_code(error),
        "failure_source": failure_source,
        "raw_exception_persisted": False,
        "planned_steps": int(manifest["planned_steps"]),
        "starting_global_optimizer_step": start_step,
        "attempted_ending_global_optimizer_step": attempted_end,
        "attempted_optimizer_updates": attempted_end - start_step,
        "discarded_uncheckpointed_optimizer_updates": discarded_updates,
        "attempted_training_state": attempted_state,
        "durable_training_state": checkpoint_training_state if checkpoint_verified else dict(durable_start),
        "durable_global_optimizer_step": durable_step,
        "checkpoint": checkpoint,
        "checkpoint_created": checkpoint_verified,
        "checkpoint_verified": checkpoint_verified,
        "recoverable": checkpoint_verified,
        "resume_allowed": checkpoint_verified,
        "restart_from_original_seed_required": not checkpoint_verified and start_step == 0,
        "resource_before": dict(before) if before else None,
        "resource_last": dict(last_resource) if last_resource else None,
        "resource_telemetry_complete": telemetry_complete,
        "swap_delta_bytes": swap_delta,
        "peak_process_rss_bytes": peak_rss,
        "peak_mlx_memory_bytes": peak_mlx,
        "heldout_opened": False,
        "foreground_training": True,
        "background_training": False,
        "parent_decision_pending": True,
        "raw_text_persisted": False,
    }


def incomplete_segments_without_parent_decision(segment_roots: Sequence[Path]) -> list[str]:
    """Return any prior segment that has not completed synchronous review."""

    pending: list[str] = []
    for root in segment_roots:
        if not root.is_dir():
            continue
        if not (root / "parent_decision.json").is_file():
            pending.append(root.name)
    return sorted(pending)
