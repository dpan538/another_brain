#!/usr/bin/env python3
"""Audit R28UX4 root and chat static routes for visible process UI."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
REPORT_PATH = ROOT / "artifacts" / "r28ux4" / "reports" / "route_audit.json"

ACCEPTED_UI_VERSIONS = ("r28ux4-visible-preview-ui", "r28hotfix0-runtime-ui-activation", "r28hotfix1-route-loop-free-runtime", "r28hotfix2-nonblocking-selfcheck", "r28hotfix3-q4-asset-path-fix")
PROCESS_MARKERS = ("过程摘要", "static_q4_experimental", "exact_runtime_tokenizer")
BUILD_MARKERS = ("R28UX4", "R28HOTFIX0", "R28HOTFIX1", "R28HOTFIX2", "R28HOTFIX3")


def read_text(path: Path) -> str:
  return path.read_text(encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
  return json.loads(read_text(path))


def build_route_audit_report(write: bool = True) -> dict[str, Any]:
  root_html_path = WEB_ROOT / "index.html"
  chat_html_path = WEB_ROOT / "another_brain_chat" / "index.html"
  app_js_path = WEB_ROOT / "another_brain_chat" / "app.js"
  runtime_js_path = WEB_ROOT / "another_brain_chat" / "browser_runtime.js"
  styles_path = WEB_ROOT / "another_brain_chat" / "styles.css"
  asset_manifest_path = WEB_ROOT / "another_brain" / "asset_manifest.json"
  runtime_mode_path = WEB_ROOT / "another_brain" / "runtime_mode.json"
  vercel_path = ROOT / "vercel.json"

  root_html = read_text(root_html_path)
  chat_html = read_text(chat_html_path)
  app_js = read_text(app_js_path)
  runtime_js = read_text(runtime_js_path)
  styles_css = read_text(styles_path)
  asset_manifest = read_json(asset_manifest_path)
  runtime_mode = read_json(runtime_mode_path)
  vercel = read_json(vercel_path)

  root_redirect_target = "/another_brain_chat/" if "another_brain_chat" in root_html else ""
  failures: list[str] = []

  checks = {
    "root_contains_build_marker": any(marker in root_html for marker in BUILD_MARKERS),
    "root_contains_process_marker": "过程摘要" in root_html,
    "root_redirects_to_chat": root_redirect_target in ("", "/another_brain_chat/"),
    "chat_contains_build_marker": any(marker in chat_html for marker in BUILD_MARKERS),
    "chat_contains_process_panel": all(marker in chat_html for marker in ("process-panel", "过程摘要", "输入包", "最终回答")),
    "chat_loads_cache_busted_app": any(f"app.js?v={version}" in chat_html for version in ACCEPTED_UI_VERSIONS),
    "app_loads_cache_busted_runtime": any(f"browser_runtime.js?v={version}" in app_js for version in ACCEPTED_UI_VERSIONS),
    "runtime_contains_trace_code": "buildProcessTrace" in runtime_js and "router_route_selected" in runtime_js,
    "runtime_contains_cache_version_invalidation": "invalidateStaleAssetCache" in runtime_js and any(version in runtime_js for version in ACCEPTED_UI_VERSIONS),
    "root_not_old_simple_ui": "Answer Machine | efishother" not in root_html and "chatForm" not in root_html,
    "vercel_static_output_web": vercel.get("outputDirectory") == "web" and vercel.get("framework") is None,
    "asset_manifest_ui_version": asset_manifest.get("ui_version") in ACCEPTED_UI_VERSIONS,
    "runtime_mode_ui_version": runtime_mode.get("ui_version") in ACCEPTED_UI_VERSIONS,
    "process_panel_default_visible": "<aside class=\"process-panel\"" in chat_html and "hidden" not in chat_html.split("<aside class=\"process-panel\"", 1)[1].split(">", 1)[0],
    "self_check_visible": "检查本地模型路径" in chat_html,
    "no_visible_cot_label": "chain of thought" not in (root_html + chat_html + app_js).lower()
      and "chain-of-thought" not in (root_html + chat_html + app_js).lower()
      and "思维链" not in root_html + chat_html + app_js,
  }

  for key, ok in checks.items():
    if not ok:
      failures.append(key)

  report = {
    "ok": not failures,
    "failures": failures,
    "version": asset_manifest.get("ui_version"),
    "root": {
      "path": "web/index.html",
      "route": "/",
      "redirect_target": root_redirect_target,
      "contains_markers": {marker: marker in root_html for marker in PROCESS_MARKERS},
    },
    "chat": {
      "path": "web/another_brain_chat/index.html",
      "route": "/another_brain_chat/",
      "contains_process_panel": checks["chat_contains_process_panel"],
      "script": f"app.js?v={asset_manifest.get('ui_version')}",
      "style": f"styles.css?v={asset_manifest.get('ui_version')}",
    },
    "runtime": {
      "app_imports_runtime": checks["app_loads_cache_busted_runtime"],
      "trace_code_present": checks["runtime_contains_trace_code"],
      "cache_version_invalidation": checks["runtime_contains_cache_version_invalidation"],
    },
    "static_config": {
      "vercel_output_directory": vercel.get("outputDirectory"),
      "vercel_framework": vercel.get("framework"),
      "asset_manifest_ui_version": asset_manifest.get("ui_version", ""),
      "runtime_mode_ui_version": runtime_mode.get("ui_version", ""),
    },
  }

  if write:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
  return report


def main() -> int:
  report = build_route_audit_report(write=True)
  print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
  return 0 if report["ok"] else 2


if __name__ == "__main__":
  raise SystemExit(main())
