#!/usr/bin/env python3
"""R27B1C deploy bundle verification."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27b1c_package_static_assets import MAX_TOTAL_STATIC_BYTES, make_package_report

WEB_ROOT = ROOT / "web"
CHAT_ROOT = WEB_ROOT / "another_brain_chat"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def verify_bundle() -> dict:
    package_report = make_package_report()
    failures = list(package_report["failures"])

    required_files = [
        WEB_ROOT / "index.html",
        CHAT_ROOT / "index.html",
        CHAT_ROOT / "app.js",
        CHAT_ROOT / "browser_runtime.js",
        CHAT_ROOT / "runtime_worker.js",
        WEB_ROOT / "another_brain" / "asset_manifest.json",
    ]
    for path in required_files:
        if not path.exists():
            failures.append(f"missing_static_file:{path.relative_to(ROOT).as_posix()}")

    if (CHAT_ROOT / "index.html").exists():
        html = read_text(CHAT_ROOT / "index.html")
        for marker in ("chat-form", "chat-input", "send-button", "No backend inference", "./app.js"):
            if marker not in html:
                failures.append(f"chat_route_missing_marker:{marker}")

    if (CHAT_ROOT / "app.js").exists() and "./browser_runtime.js" not in read_text(CHAT_ROOT / "app.js"):
        failures.append("chat_app_not_connected_to_browser_runtime")

    if (CHAT_ROOT / "browser_runtime.js").exists():
        runtime = read_text(CHAT_ROOT / "browser_runtime.js")
        for marker in ("new Worker", "./runtime_worker.js", "backend_inference: false", "external_runtime_dependency: false"):
            if marker not in runtime:
                failures.append(f"browser_runtime_missing_marker:{marker}")

    return {
        "ok": not failures,
        "failures": failures,
        "output_directory": "web",
        "chat_route": "/another_brain_chat/",
        "build_output_bytes": package_report["build_output_bytes"],
        "max_total_static_bytes": MAX_TOTAL_STATIC_BYTES,
        "static_file_count": package_report["static_file_count"],
        "model_assets_declared": package_report["model_assets_declared"],
        "tokenizer_assets_declared": package_report["tokenizer_assets_declared"],
    }


def main() -> int:
    report = verify_bundle()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
