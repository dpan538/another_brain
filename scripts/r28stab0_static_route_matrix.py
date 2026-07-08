#!/usr/bin/env python3
"""R28STAB0 static route matrix for pre-merge runtime stability soak."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REPORT_PATH = ROOT / "artifacts" / "r28stab0" / "reports" / "static_route_matrix.json"
VERSION = "r28p0d-browser-compat-no-fallback-choice"
BUILD_MARKERS = ("R28P0D", "R28P0C", "R28P0", "R28MERGE3", "R28SHIP0", "R28UX5", "R28RAG3", "R28SURF2", "R28ROUT1", "R28HOTFIX3", "R28HOTFIX2", "R28HOTFIX1")

ROUTES = [
    "/",
    "/another_brain_chat",
    "/another_brain_chat/",
    "/another_brain_chat?message=你好",
    "/another_brain_chat/?message=你是谁",
    "/another_brain_chat?message=你从哪里来",
    "/another_brain_chat?message=你是鳄鱼吗",
]

ROUTE_TO_FILE = {
    "/": WEB / "index.html",
    "/another_brain_chat": WEB / "another_brain_chat.html",
    "/another_brain_chat/": WEB / "another_brain_chat" / "index.html",
}

REQUIRED_MARKERS = {
    "viewport": 'name="viewport"',
    "app_shell": "app-shell",
    "process_panel": "过程摘要",
    "self_check": "检查本地模型路径",
    "stop_check": "停止检查",
    "static_q4": "static_q4_experimental",
    "exact_tokenizer": "exact_runtime_tokenizer",
    "no_backend_badge": "No backend inference",
    "non_product": "不是产品模型",
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def read_json(path: Path) -> dict:
    return json.loads(read_text(path))


def route_file(route: str) -> Path | None:
    path = urlsplit(route).path or "/"
    return ROUTE_TO_FILE.get(path)


def route_record(route: str) -> dict:
    entry = route_file(route)
    if entry is None or not entry.exists():
        return {
            "status": 404,
            "redirect_count": 0,
            "entry": "",
            "query_message": "",
            "markers": {},
        }
    body = read_text(entry)
    query = parse_qs(urlsplit(route).query)
    return {
        "status": 200,
        "redirect_count": 0,
        "entry": entry.relative_to(ROOT).as_posix(),
        "query_message": unquote((query.get("message") or [""])[0]),
        "markers": {name: marker in body for name, marker in REQUIRED_MARKERS.items()},
        "contains_build_marker": any(marker in body for marker in BUILD_MARKERS),
        "loads_absolute_app": f"/another_brain_chat/app.js?v={VERSION}" in body,
        "loads_absolute_css": f"/another_brain_chat/styles.css?v={VERSION}" in body,
        "desktop_viewport_ready": 'name="viewport"' in body and "workspace-grid" in body,
        "mobile_viewport_ready": 'name="viewport"' in body and "composer-actions" in body,
    }


def build_static_route_matrix(write: bool = True) -> dict:
    vercel = read_json(ROOT / "vercel.json")
    runtime_mode = read_json(WEB / "another_brain" / "runtime_mode.json")
    asset_manifest = read_json(WEB / "another_brain" / "asset_manifest.json")
    app = read_text(WEB / "another_brain_chat" / "app.js")
    runtime = read_text(WEB / "another_brain_chat" / "browser_runtime.js")
    q4_runtime = read_text(WEB / "another_brain_chat" / "q4_worker_runtime.js")

    routes = {route: route_record(route) for route in ROUTES}
    failures: list[str] = []
    for route, record in routes.items():
        if record["status"] != 200:
            failures.append(f"route_not_200:{route}:{record['status']}")
        if record["redirect_count"] > 1:
            failures.append(f"route_redirect_loop:{route}:{record['redirect_count']}")
        if not record.get("contains_build_marker"):
            failures.append(f"route_missing_build_marker:{route}")
        for name, ok in record.get("markers", {}).items():
            if not ok:
                failures.append(f"route_missing_{name}:{route}")
        for name in ("loads_absolute_app", "loads_absolute_css", "desktop_viewport_ready", "mobile_viewport_ready"):
            if not record.get(name):
                failures.append(f"route_missing_{name}:{route}")

    if vercel.get("outputDirectory") != "web":
        failures.append("vercel_output_directory_not_web")
    if vercel.get("buildCommand") != "npm run build:vercel":
        failures.append("vercel_build_command_not_build_vercel")
    if vercel.get("redirects"):
        failures.append("vercel_redirects_present")
    if runtime_mode.get("model_mode") != "static_q4_experimental":
        failures.append("runtime_mode_not_static_q4")
    if runtime_mode.get("backend_inference") is not False:
        failures.append("runtime_mode_backend_inference_not_false")
    if asset_manifest.get("backend_inference") is not False:
        failures.append("asset_manifest_backend_inference_not_false")
    if asset_manifest.get("external_llm_api") is not False:
        failures.append("asset_manifest_external_llm_api_not_false")
    if asset_manifest.get("doubao") is not False:
        failures.append("asset_manifest_doubao_not_false")
    if f"browser_runtime.js?v={VERSION}" not in app:
        failures.append("app_runtime_version_mismatch")
    if "sameOriginAssetUrl" not in runtime or "normalizeBrowserAssetPath" not in runtime:
        failures.append("runtime_missing_same_origin_asset_normalization")
    if "new URL(`../${path}`" in runtime or "fetchJsonSameOrigin(`../" in runtime:
        failures.append("route_relative_asset_probe_present")
    if "originRoot()" not in q4_runtime or "/another_brain/" not in q4_runtime:
        failures.append("q4_runtime_asset_origin_root_not_obvious")

    report = {
        "ok": not failures,
        "version": VERSION,
        "routes_passed": not failures,
        "routes": routes,
        "route_count": len(ROUTES),
        "route_list": ROUTES,
        "static_environment": {
            "output_directory": vercel.get("outputDirectory"),
            "clean_urls": vercel.get("cleanUrls") is True,
            "trailing_slash": vercel.get("trailingSlash"),
            "backend_required": False,
            "external_runtime_required": False,
        },
        "failures": failures,
    }
    if write:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    report = build_static_route_matrix(write=True)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
