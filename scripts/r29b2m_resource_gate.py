#!/usr/bin/env python3
"""Evaluate the non-negotiable M1 resource floor before any SFT begins."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.training.mlx.r29b2m_campaign import atomic_json  # noqa: E402


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    args = parser.parse_args()
    disk = shutil.disk_usage(args.artifact_root)
    state = json.loads((args.artifact_root / "campaign_state.json").read_text(encoding="utf-8"))
    q4_changes = subprocess.run(["git", "diff", "--name-only", "--", "web/another_brain/model_assets/r28m1"], cwd=REPO_ROOT, capture_output=True, text=True, check=False).stdout.splitlines()
    report = {
        "campaign_id": "r29b2m_m1_mlx_daily_dialogue_v1",
        "created_at": now(),
        "resource_contract": {"disk_free_floor_bytes": 80_000_000_000, "peak_memory_target_bytes": 12_000_000_000},
        "disk": {"free_bytes": disk.free, "total_bytes": disk.total, "used_bytes": disk.used, "free_floor_met": disk.free >= 80_000_000_000},
        "training": {
            "training_started": state.get("training_started"),
            "optimizer_tokens": state.get("optimizer_tokens"),
            "assistant_target_tokens": state.get("assistant_target_tokens"),
            "permitted": disk.free >= 80_000_000_000,
        },
        "weight_files_modified_by_r29b2m": q4_changes,
        "decision": "ABORTED_SAFELY" if disk.free < 80_000_000_000 else "RESOURCE_READY",
        "reason": "disk_free_below_m1_training_floor" if disk.free < 80_000_000_000 else None,
        "next_requirement": "free at least 80,000,000,000 bytes on the training volume and start a new explicit campaign/resume decision" if disk.free < 80_000_000_000 else None,
    }
    atomic_json(args.artifact_root / "reports" / "resource_gate.json", report)
    print(json.dumps({"decision": report["decision"], "free_bytes": disk.free, "floor_bytes": 80_000_000_000}, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
