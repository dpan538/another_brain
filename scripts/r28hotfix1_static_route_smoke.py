#!/usr/bin/env python3
"""Static route smoke for R28HOTFIX1 without starting a backend server."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REPORT_PATH = ROOT / "artifacts" / "r28hotfix1" / "reports" / "static_route_smoke.json"
VERSION = "r28hotfix2-nonblocking-selfcheck"
ACCEPTED_MARKERS = ("R28HOTFIX1", "R28HOTFIX2")

ROUTE_TO_FILE = {
    "/": WEB / "index.html",
    "/another_brain_chat": WEB / "another_brain_chat.html",
    "/another_brain_chat/": WEB / "another_brain_chat" / "index.html",
}
SMOKE_ROUTES = [
    "/",
    "/another_brain_chat",
    "/another_brain_chat/",
    "/another_brain_chat?message=你是谁",
    "/another_brain_chat/?message=你是谁",
]


def resolve_route(route: str) -> tuple[int, int, Path, str]:
    path = route.split("?", 1)[0]
    entry = ROUTE_TO_FILE.get(path)
    if entry is None or not entry.exists():
        return 404, 0, Path(""), ""
    return 200, 0, entry, entry.read_text(encoding="utf-8")


def build_static_route_smoke(write: bool = True) -> dict:
    failures = []
    routes = {}
    for route in SMOKE_ROUTES:
        status, redirect_count, entry, body = resolve_route(route)
        record = {
            "status": status,
            "redirect_count": redirect_count,
            "entry": entry.relative_to(ROOT).as_posix() if entry else "",
            "contains_hotfix1": any(marker in body for marker in ACCEPTED_MARKERS),
            "contains_process": "过程摘要" in body,
            "contains_q4": "static_q4_experimental" in body,
            "contains_tokenizer": "exact_runtime_tokenizer" in body,
            "contains_self_check": "检查本地模型路径" in body,
        }
        routes[route] = record
        if status != 200:
            failures.append(f"route_not_200:{route}:{status}")
        if redirect_count > 1:
            failures.append(f"route_too_many_redirects:{route}:{redirect_count}")
        for key in ("contains_hotfix1", "contains_process", "contains_q4", "contains_tokenizer", "contains_self_check"):
            if not record[key]:
                failures.append(f"route_missing_{key}:{route}")
    report = {
        "ok": not failures,
        "failures": failures,
        "version": VERSION,
        "routes": routes,
        "backend_required": False,
    }
    if write:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    report = build_static_route_smoke(write=True)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
