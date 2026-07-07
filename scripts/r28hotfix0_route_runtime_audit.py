#!/usr/bin/env python3
"""Audit R28HOTFIX0 static routes, DOM wiring, and q4 runtime activation markers."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REPORT_PATH = ROOT / "artifacts" / "r28hotfix0" / "reports" / "route_runtime_audit.json"
ACCEPTED_VERSIONS = ("r28hotfix0-runtime-ui-activation", "r28hotfix1-route-loop-free-runtime", "r28hotfix2-nonblocking-selfcheck")
ACCEPTED_MARKERS = ("R28HOTFIX0", "R28HOTFIX1", "R28HOTFIX2")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(read(path))


def git_ls_files(prefix: str) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", prefix],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return [line for line in result.stdout.splitlines() if line]


def build_route_runtime_audit() -> dict[str, Any]:
    root_html = read(WEB / "index.html")
    chat_html = read(WEB / "another_brain_chat" / "index.html")
    chat_no_slash_html = read(WEB / "another_brain_chat.html")
    app_js = read(WEB / "another_brain_chat" / "app.js")
    runtime_js = read(WEB / "another_brain_chat" / "browser_runtime.js")
    worker_js = read(WEB / "another_brain_chat" / "runtime_worker.js")
    q4_worker_js = read(WEB / "another_brain_chat" / "q4_worker_runtime.js")
    root_app_js = read(WEB / "app.js")
    vercel = load_json(ROOT / "vercel.json")
    runtime_mode = load_json(WEB / "another_brain" / "runtime_mode.json")
    asset_manifest = load_json(WEB / "another_brain" / "asset_manifest.json")

    q4_files = [
        WEB / "another_brain" / "model_assets" / "r28m1" / "quantization.manifest.json",
        WEB / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json",
        *(WEB / "another_brain" / "model_assets" / "r28m1" / "shards").glob("model-q4-*.bin"),
    ]
    tracked_q4 = git_ls_files("web/another_brain/model_assets/r28m1/")
    redirects = vercel.get("redirects") or []
    chat_redirect = next((item for item in redirects if item.get("source") == "/another_brain_chat"), {})
    selected_version = str(runtime_mode.get("ui_version") or "")

    checks = {
        "root_contains_hotfix_marker": any(marker in root_html for marker in ACCEPTED_MARKERS),
        "root_exposes_process_ui": "过程摘要" in root_html and "static_q4_experimental" in root_html,
        "chat_slash_contains_process_panel": "过程摘要" in chat_html and "trace-steps" in chat_html,
        "chat_slash_loads_absolute_css": 'href="/another_brain_chat/styles.css' in chat_html,
        "chat_slash_loads_absolute_app": 'src="/another_brain_chat/app.js' in chat_html,
        "chat_no_slash_static_fallback_exists": any(marker in chat_no_slash_html for marker in ACCEPTED_MARKERS) and "过程摘要" in chat_no_slash_html,
        "vercel_redirects_safe_or_absent": not redirects or chat_redirect.get("destination") == "/another_brain_chat/",
        "query_route_not_client_redirect_loop": "window.location.replace" not in root_html + chat_no_slash_html,
        "app_uses_hotfix_runtime_import": any(f"browser_runtime.js?v={version}" in app_js for version in ACCEPTED_VERSIONS),
        "app_has_null_safe_event_binding": "function on(node, eventName, handler" in app_js and ".addEventListener(\"submit\"" not in app_js,
        "root_app_has_null_safe_event_binding": "bindRootHandler" in root_app_js and "els.form.addEventListener" not in root_app_js,
        "runtime_uses_cache_busted_worker": any(f"runtime_worker.js?v={version}" in runtime_js for version in ACCEPTED_VERSIONS),
        "worker_uses_q4_runtime": "generateStaticQ4Draft" in worker_js and "web_static_q4_worker_bundle_not_embedded" not in worker_js,
        "q4_worker_reads_same_origin_assets": "another_brain/asset_manifest.json" in q4_worker_js and "non_same_origin_asset_rejected" in q4_worker_js,
        "q4_worker_generates_tokens": "tokens_generated" in q4_worker_js and "static_q4_experimental" in q4_worker_js,
        "model_self_check_visible": "检查本地模型路径" in chat_html and "self-check-tokens" in chat_html,
        "runtime_mode_static_q4_default": runtime_mode.get("model_mode") == "static_q4_experimental",
        "runtime_mode_hotfix_version": selected_version in ACCEPTED_VERSIONS,
        "asset_manifest_hotfix_version": asset_manifest.get("ui_version") in ACCEPTED_VERSIONS,
        "asset_manifest_exact_tokenizer": asset_manifest.get("tokenizer_decode_status") == "exact_runtime_tokenizer",
        "q4_files_exist": all(path.exists() for path in q4_files),
        "q4_files_tracked": len(tracked_q4) >= len(q4_files),
    }
    failures = [name for name, ok in checks.items() if not ok]
    return {
        "ok": not failures,
        "failures": failures,
        "version": selected_version,
        "routes": {
            "/": "web/index.html direct app shell",
            "/another_brain_chat": "web/another_brain_chat.html direct app shell",
            "/another_brain_chat/": "web/another_brain_chat/index.html",
            "/another_brain_chat?message=...": "web/another_brain_chat.html direct app shell",
            "/another_brain_chat/?message=...": "web/another_brain_chat/index.html",
        },
        "checks": checks,
        "assets": {
            "q4_file_count": len(q4_files),
            "tracked_r28m1_file_count": len(tracked_q4),
            "shard_count": len(list((WEB / "another_brain" / "model_assets" / "r28m1" / "shards").glob("model-q4-*.bin"))),
            "tokenizer_path": "web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json",
        },
    }


def main() -> int:
    report = build_route_runtime_audit()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
