#!/usr/bin/env python3
"""R27B4 100MB static bundle report."""

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
ASSET_MANIFEST = WEB_ROOT / "another_brain" / "asset_manifest.json"
CANDIDATE_MANIFEST = ROOT / "artifacts/r27b2/manifests/candidate_static_manifest.json"


def asset_bytes(manifest: dict, key: str) -> int:
    total = 0
    for item in manifest.get(key, []):
        if isinstance(item, str):
            path = item
            declared = None
        else:
            path = item.get("path", "")
            declared = item.get("bytes")
        if not path:
            continue
        absolute = WEB_ROOT / path.lstrip("/")
        actual = absolute.stat().st_size if absolute.exists() else 0
        total += int(declared if declared is not None else actual)
    return total


def runtime_app_bytes() -> int:
    roots = [CHAT_ROOT, WEB_ROOT / "another_brain"]
    total = 0
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".html", ".css", ".js", ".json"}:
                total += path.stat().st_size
    return total


def candidate_injected_bytes() -> int:
    if not CANDIDATE_MANIFEST.exists():
        return 0
    try:
        manifest = json.loads(CANDIDATE_MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return 0
    return int(manifest.get("total_bytes", 0))


def make_bundle_report() -> dict:
    package_report = make_package_report()
    manifest = json.loads(ASSET_MANIFEST.read_text(encoding="utf-8"))
    model_bytes = asset_bytes(manifest, "model_assets")
    tokenizer_bytes = asset_bytes(manifest, "tokenizer_assets")
    rag_bytes = asset_bytes(manifest, "rag_assets")
    gate_bytes = asset_bytes(manifest, "gate_assets")
    runtime_bytes = runtime_app_bytes()
    build_output_bytes = int(package_report["build_output_bytes"])
    failures = list(package_report["failures"])
    margin = MAX_TOTAL_STATIC_BYTES - build_output_bytes
    if margin < 0:
        failures.append(f"build_output_exceeds_100mb:{build_output_bytes}")
    return {
        "ok": not failures,
        "failures": failures,
        "build_output_bytes": build_output_bytes,
        "static_file_count": package_report["static_file_count"],
        "max_total_static_bytes": MAX_TOTAL_STATIC_BYTES,
        "margin_bytes": margin,
        "model_declared_bytes": model_bytes,
        "tokenizer_declared_bytes": tokenizer_bytes,
        "rag_asset_bytes": rag_bytes,
        "gate_asset_bytes": gate_bytes,
        "runtime_app_bytes": runtime_bytes,
        "candidate_injected_bytes_if_local_ignored_smoke_used": candidate_injected_bytes(),
        "backend_inference": False,
        "external_llm_api": False,
        "product_model": False,
    }


def main() -> int:
    report = make_bundle_report()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
