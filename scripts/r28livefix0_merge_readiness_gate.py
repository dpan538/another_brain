#!/usr/bin/env python3
"""R28LIVEFIX0 merge readiness gate.

This gate intentionally refuses fixture-only merge_ready. A live preview or
browser console diagnostics payload must prove q4 runtime readiness.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "r28livefix0" / "reports" / "merge_readiness_gate.json"


def _load_live_diagnostics() -> dict[str, Any] | None:
    raw = os.environ.get("R28LIVEFIX0_LIVE_DIAGNOSTICS_JSON", "").strip()
    if not raw:
        return None
    if not raw.startswith("{") and not raw.startswith("["):
        path = Path(raw)
        if path.exists():
            raw = path.read_text(encoding="utf-8")
    return json.loads(raw)


def _has_marker() -> bool:
    html = (ROOT / "web/another_brain_chat/index.html").read_text(encoding="utf-8")
    runtime_mode = json.loads((ROOT / "web/another_brain/runtime_mode.json").read_text(encoding="utf-8"))
    return "R28LIVEFIX0" in html and runtime_mode.get("branch_marker") == "R28LIVEFIX0"


def merge_readiness_gate(*, write_report: bool = True) -> dict[str, Any]:
    diagnostics = _load_live_diagnostics()
    failures: list[str] = []
    label = "preview_ready_not_merge_ready"
    live_verified = False

    if not _has_marker():
      failures.append("branch_marker_missing")
      label = "blocked_branch_mismatch"

    if diagnostics:
        marker = diagnostics.get("branch_marker")
        if marker != "R28LIVEFIX0":
            failures.append(f"live_branch_marker_mismatch:{marker}")
            label = "blocked_branch_mismatch"
        shard_failures = [
            item for item in diagnostics.get("q4_shards", [])
            if item.get("ok") is not True or int(item.get("bytes_read") or 0) <= 0
        ]
        if shard_failures:
            failures.append("live_q4_shard_probe_failed")
            label = "blocked_live_q4_mount"
        forward = diagnostics.get("q4_forward", {})
        if diagnostics.get("merge_runtime_ready") is True:
            live_verified = True
        elif "asset_probe_failed" in json.dumps(diagnostics, ensure_ascii=False):
            failures.append("live_asset_probe_failed")
            label = "blocked_live_q4_mount"
        elif forward.get("q4_forward_ran") is not True:
            failures.append(forward.get("blocker") or "live_q4_forward_not_confirmed")
            if label == "preview_ready_not_merge_ready":
                label = "blocked_live_q4_mount"
        if live_verified and not failures:
            label = "merge_ready"
    elif not failures:
        failures.append("live_diagnostics_missing")

    report = {
        "task": "R28LIVEFIX0",
        "ok": label in {"merge_ready", "preview_ready_not_merge_ready"},
        "decision_label": label,
        "live_q4_mount_verified": live_verified,
        "fixture_only_merge_ready_allowed": False,
        "merge_ready_requires_live_diagnostics": True,
        "failures": failures,
        "manual_diagnostics_command": "await window.__anotherBrainDiagnostics()",
        "non_claims": {
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "training": False,
            "new_model_assets": False,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
        },
    }
    if write_report:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    report = merge_readiness_gate(write_report=True)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["decision_label"] in {"merge_ready", "preview_ready_not_merge_ready"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
