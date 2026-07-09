#!/usr/bin/env python3
"""R28LIVEFIX0 branch marker audit."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "r28livefix0" / "reports" / "branch_marker_audit.json"
MARKER = "R28LIVEFIX0"
BRANCH = "r28livefix0-live-q4-mount"


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def branch_marker_audit(*, write_report: bool = True) -> dict:
    failures: list[str] = []
    html_paths = [
        "web/another_brain_chat/index.html",
        "web/index.html",
        "web/another_brain_chat.html",
    ]
    for path in html_paths:
        text = _read(path)
        if MARKER not in text:
            failures.append(f"{path}:marker_missing")
        if BRANCH not in text:
            failures.append(f"{path}:branch_missing")
        if "another-brain-commit-short" not in text and "build-env-pending" not in text:
            failures.append(f"{path}:commit_short_missing")

    runtime_mode = json.loads(_read("web/another_brain/runtime_mode.json"))
    asset_manifest = json.loads(_read("web/another_brain/asset_manifest.json"))
    for name, data in [("runtime_mode", runtime_mode), ("asset_manifest", asset_manifest)]:
        if data.get("branch_marker") != MARKER and data.get("ui_build_marker") != MARKER:
            failures.append(f"{name}:marker_missing")
        if data.get("branch_name") != BRANCH and data.get("ui_version") != BRANCH:
            failures.append(f"{name}:branch_missing")
        if not data.get("build_commit_short"):
            failures.append(f"{name}:commit_short_missing")
        if not data.get("ui_build_timestamp"):
            failures.append(f"{name}:build_timestamp_missing")

    report = {
        "task": "R28LIVEFIX0",
        "ok": not failures,
        "marker": MARKER,
        "branch": BRANCH,
        "routes_checked": ["/", "/another_brain_chat"],
        "html_paths": html_paths,
        "failures": failures,
        "branch_mismatch_rule": "If a preview does not display R28LIVEFIX0 and r28livefix0-live-q4-mount, it is not this branch.",
    }
    if write_report:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    report = branch_marker_audit(write_report=True)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
