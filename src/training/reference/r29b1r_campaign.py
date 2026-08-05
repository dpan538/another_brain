"""Durable state helpers for the R29B1R CPU-reference recovery campaign."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


CAMPAIGN_ID = "r29b1r_probe_deconvolution_cpu_reference_v1"
STATES = (
    "ORIENTATION",
    "PROBE_REPAIR",
    "PYTHON_BASELINE",
    "TORCH_PACKAGE_INSPECTION",
    "TORCH_IMPORT_ONLY",
    "CPU_SMOKE",
    "MPS_PROBE",
    "SANDBOX_ATTRIBUTION",
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
    "HOST_CONTEXT_REQUIRED_WITH_BUNDLE",
    "BLOCKED_WITH_DIAGNOSTIC_EVIDENCE",
    "ABORTED_SAFELY",
)
TERMINAL_STATES = {
    "PASSED_REFERENCE_Q4_GATE",
    "HOST_CONTEXT_REQUIRED_WITH_BUNDLE",
    "BLOCKED_WITH_DIAGNOSTIC_EVIDENCE",
    "ABORTED_SAFELY",
}


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    """Write JSON durably without exposing a partially written evidence file."""
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


def state_payload(*, state: str, artifact_root: Path, **extra: Any) -> dict[str, Any]:
    if state not in STATES:
        raise ValueError(f"unknown_r29b1r_state:{state}")
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
