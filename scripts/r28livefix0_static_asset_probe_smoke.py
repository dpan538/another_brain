#!/usr/bin/env python3
"""Static smoke for R28LIVEFIX0 q4 shard availability and probe contract."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "r28livefix0" / "reports" / "static_asset_probe_smoke.json"


def static_asset_probe_smoke(*, write_report: bool = True) -> dict:
    manifest = json.loads((ROOT / "web/another_brain/asset_manifest.json").read_text(encoding="utf-8"))
    shards = [item for item in manifest.get("model_assets", []) if item.get("role") == "q4_shard"]
    failures: list[str] = []
    for item in shards:
        path = ROOT / "web" / item["path"]
        if not path.exists():
            failures.append(f"missing_shard:{item['path']}")
        elif path.stat().st_size <= 0:
            failures.append(f"empty_shard:{item['path']}")

    runtime = (ROOT / "web/another_brain_chat/browser_runtime.js").read_text(encoding="utf-8")
    ts_probe = (ROOT / "src/browser_runtime/assets/live_asset_probe.ts").read_text(encoding="utf-8")
    source = runtime + "\n" + ts_probe
    required = [
        "Range",
        "bytes=0-15",
        "bytes_read",
        "content_length_header",
        "GET_RANGE",
        "GET_BODY",
        "get_range_then_get_body",
    ]
    for marker in required:
        if marker not in source:
            failures.append(f"probe_marker_missing:{marker}")
    if 'method: "HEAD"' in source or "method: 'HEAD'" in source:
        failures.append("head_probe_must_not_be_primary")
    if "Number(response.headers?.get?.(\"content-length\") || 0)" in runtime:
        failures.append("legacy_content_length_only_probe_present")

    report = {
        "task": "R28LIVEFIX0",
        "ok": not failures,
        "q4_shard_count": len(shards),
        "q4_shards": [
            {"path": item["path"], "bytes": item.get("bytes", 0), "exists": (ROOT / "web" / item["path"]).exists()}
            for item in shards
        ],
        "probe_strategy": "GET Range bytes=0-15, then GET body bytes if Range is unsupported",
        "content_length_required": False,
        "head_only_allowed": False,
        "failures": failures,
    }
    if len(shards) != 5:
        report["ok"] = False
        report["failures"].append(f"expected_5_q4_shards:{len(shards)}")
    if write_report:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    report = static_asset_probe_smoke(write_report=True)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
