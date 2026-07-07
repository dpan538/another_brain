#!/usr/bin/env python3
"""Audit R28HOTFIX1 static routes for redirect-loop-free app entry loading."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REPORT_PATH = ROOT / "artifacts" / "r28hotfix1" / "reports" / "route_loop_audit.json"
VERSION = "r28hotfix3-q4-asset-path-fix"
BUILD_MARKERS = ("R28HOTFIX1", "R28HOTFIX2", "R28HOTFIX3")
MARKERS = ("过程摘要", "static_q4_experimental", "exact_runtime_tokenizer", "检查本地模型路径")
ENTRY_FILES = {
    "/": WEB / "index.html",
    "/another_brain_chat": WEB / "another_brain_chat.html",
    "/another_brain_chat/": WEB / "another_brain_chat" / "index.html",
}
CLIENT_REDIRECT_MARKERS = (
    "http-equiv=\"refresh\"",
    "http-equiv='refresh'",
    "location.replace",
    "location.href",
    "history.replaceState",
)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(read(path))


def explicit_redirects(vercel: dict[str, Any]) -> list[dict[str, Any]]:
    return list(vercel.get("redirects") or [])


def route_body(path: str) -> str:
    clean_path = path.split("?", 1)[0]
    return read(ENTRY_FILES[clean_path])


def build_route_loop_audit(write: bool = True) -> dict[str, Any]:
    vercel = load_json(ROOT / "vercel.json")
    root_html = read(ENTRY_FILES["/"])
    chat_html = read(ENTRY_FILES["/another_brain_chat/"])
    chat_no_slash_html = read(ENTRY_FILES["/another_brain_chat"])
    app_js = read(WEB / "another_brain_chat" / "app.js")
    runtime_js = read(WEB / "another_brain_chat" / "browser_runtime.js")
    runtime_mode = load_json(WEB / "another_brain" / "runtime_mode.json")
    asset_manifest = load_json(WEB / "another_brain" / "asset_manifest.json")
    entries = {
        "root": root_html,
        "chat_no_slash": chat_no_slash_html,
        "chat_slash": chat_html,
    }
    redirects = explicit_redirects(vercel)
    failures: list[str] = []
    checks: dict[str, bool] = {
        "no_explicit_vercel_redirects": len(redirects) == 0,
        "root_direct_app": any(marker in root_html for marker in BUILD_MARKERS) and all(marker in root_html for marker in MARKERS),
        "chat_no_slash_direct_app": any(marker in chat_no_slash_html for marker in BUILD_MARKERS) and all(marker in chat_no_slash_html for marker in MARKERS),
        "chat_slash_direct_app": any(marker in chat_html for marker in BUILD_MARKERS) and all(marker in chat_html for marker in MARKERS),
        "root_and_chat_same_version": VERSION in root_html and VERSION in chat_html and VERSION in chat_no_slash_html,
        "root_and_chat_load_same_app_js": all(f'/another_brain_chat/app.js?v={VERSION}' in html for html in entries.values()),
        "root_and_chat_load_same_css": all(f'/another_brain_chat/styles.css?v={VERSION}' in html for html in entries.values()),
        "no_client_side_redirect_code": not any(marker in (root_html + chat_no_slash_html + chat_html) for marker in CLIENT_REDIRECT_MARKERS),
        "app_uses_hotfix1_runtime": f"browser_runtime.js?v={VERSION}" in app_js,
        "runtime_uses_hotfix1_worker": f"runtime_worker.js?v={VERSION}" in runtime_js,
        "runtime_mode_hotfix1": runtime_mode.get("ui_version") == VERSION,
        "asset_manifest_hotfix1": asset_manifest.get("ui_version") == VERSION,
        "runtime_mode_static_q4_default": runtime_mode.get("model_mode") == "static_q4_experimental",
    }
    for name, ok in checks.items():
        if not ok:
            failures.append(name)

    route_checks = {}
    for route in [
        "/",
        "/another_brain_chat",
        "/another_brain_chat/",
        "/another_brain_chat?message=你是谁",
        "/another_brain_chat/?message=你是谁",
    ]:
        body = route_body(route)
        route_checks[route] = {
            "redirect_count": 0,
            "contains_hotfix1": any(marker in body for marker in BUILD_MARKERS),
            "contains_process_panel": "过程摘要" in body,
            "contains_self_check": "检查本地模型路径" in body,
            "contains_static_q4": "static_q4_experimental" in body,
        }
        if (
            route_checks[route]["redirect_count"] > 1
            or not route_checks[route]["contains_hotfix1"]
            or not route_checks[route]["contains_process_panel"]
            or not route_checks[route]["contains_self_check"]
            or not route_checks[route]["contains_static_q4"]
        ):
            failures.append(f"route_marker_missing:{route}")

    report = {
        "ok": not failures,
        "failures": failures,
        "version": VERSION,
        "route_model": "direct_static_entries_no_client_redirect",
        "redirects": redirects,
        "checks": checks,
        "routes": route_checks,
        "build_output_files": {
            "/": "web/index.html",
            "/another_brain_chat": "web/another_brain_chat.html",
            "/another_brain_chat/": "web/another_brain_chat/index.html",
        },
    }
    if write:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    report = build_route_loop_audit(write=True)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
