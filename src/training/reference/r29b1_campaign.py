"""Durable, foreground-safe state helpers for R29B1.

The helpers deliberately contain no model loading code.  Native extension
imports are isolated in child processes so an importer crash cannot erase the
campaign evidence written by the foreground supervisor.
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


CAMPAIGN_ID = "r29b1_torch_reference_q4_recovery_v1"
STATES = (
    "ORIENTATION",
    "ENVIRONMENT_DISCOVERY",
    "ENVIRONMENT_INSTALL",
    "ENVIRONMENT_VALIDATION",
    "CHECKPOINT_INVENTORY",
    "CHECKPOINT_SAFE_LOAD",
    "ARCHITECTURE_AUDIT",
    "FP32_REFERENCE",
    "KV_CACHE_PARITY",
    "CURRENT_Q4_REFERENCE",
    "FAILURE_ATTRIBUTION",
    "Q4V2_EXPERIMENT",
    "Q4V2_SELECTION",
    "FINAL_VALIDATION",
    "PASSED_REFERENCE_Q4_GATE",
    "BLOCKED_WITH_EVIDENCE",
    "ABORTED_SAFELY",
)
TERMINAL_STATES = {"PASSED_REFERENCE_Q4_GATE", "BLOCKED_WITH_EVIDENCE", "ABORTED_SAFELY"}


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    """Atomically replace a JSON evidence file without exposing partial JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def campaign_state(*, state: str, artifact_root: Path, **extra: Any) -> dict[str, Any]:
    if state not in STATES:
        raise ValueError(f"unknown_r29b1_state:{state}")
    return {
        "campaign_id": CAMPAIGN_ID,
        "state": state,
        "terminal": state in TERMINAL_STATES,
        "updated_at_utc": utc_now(),
        "artifact_root": str(artifact_root),
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "weights_committed": False,
        "corpus_committed": False,
        "browser_model_replaced": False,
        **extra,
    }


def require_nonterminal(state: dict[str, Any]) -> None:
    if state.get("state") in TERMINAL_STATES:
        raise RuntimeError("cannot_continue_terminal_campaign")
