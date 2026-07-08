#!/usr/bin/env python3
"""Source-level live diagnostics contract for R28LIVEFIX0."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "r28livefix0" / "reports" / "live_probe_contract.json"


def live_probe_contract(*, write_report: bool = True) -> dict:
    app = (ROOT / "web/another_brain_chat/app.js").read_text(encoding="utf-8")
    runtime = (ROOT / "web/another_brain_chat/browser_runtime.js").read_text(encoding="utf-8")
    probe = (ROOT / "src/browser_runtime/assets/live_asset_probe.ts").read_text(encoding="utf-8")
    failures: list[str] = []
    for marker in [
        "window.__anotherBrainDiagnostics",
        "branch_marker",
        "asset_manifest",
        "q4_shards",
        "q4_forward",
        "merge_runtime_ready",
        "bytes_read",
        "normalized_url",
        "probe_strategy",
    ]:
        if marker not in app + runtime + probe:
            failures.append(f"diagnostics_marker_missing:{marker}")
    if "q4Shards.length === 5" not in app:
        failures.append("diagnostics_must_require_5_q4_shards")
    if "assetsOk && tokenizerOk && forwardOk" not in app:
        failures.append("merge_runtime_ready_must_require_assets_tokenizer_forward")
    report = {
        "task": "R28LIVEFIX0",
        "ok": not failures,
        "diagnostics_function": "window.__anotherBrainDiagnostics",
        "merge_runtime_ready_rule": "assets pass, exact tokenizer pass, and q4_forward_ran with tokens_generated > 0",
        "failures": failures,
    }
    if write_report:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    report = live_probe_contract(write_report=True)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
