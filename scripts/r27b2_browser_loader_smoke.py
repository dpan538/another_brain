#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.candidate_asset_writer import MANIFEST_DIR, SHARD_DIR, load_candidate_static_manifest, write_json
from scripts.r27b2_write_candidate_static_manifest import ensure_inputs
from src.browser_export.candidate_asset_writer import write_candidate_static_manifest
from src.browser_export.export_manifest import sha256_file


BASE_URL = "http://localhost/another_brain_candidate/"


def is_same_origin(path: str, base: str = BASE_URL) -> bool:
    if path.startswith("//"):
        return False
    parsed = urlparse(urljoin(base, path))
    base_parsed = urlparse(base)
    return (parsed.scheme, parsed.netloc) == (base_parsed.scheme, base_parsed.netloc)


def ensure_manifest(synthetic_if_missing: bool) -> dict:
    try:
        return load_candidate_static_manifest()
    except FileNotFoundError:
        export_report, quantization_report = ensure_inputs(synthetic_if_missing)
        return write_candidate_static_manifest(export_report, quantization_report)


def smoke_manifest(manifest: dict) -> dict:
    failures: list[str] = []
    if manifest.get("same_origin_only") is not True:
        failures.append("same_origin_only_must_be_true")
    if manifest.get("backend_inference") is not False:
        failures.append("backend_inference_must_be_false")
    if manifest.get("external_runtime_dependency") is not False:
        failures.append("external_runtime_dependency_must_be_false")
    if int(manifest.get("total_bytes", 0)) > int(manifest.get("budget_bytes", 100_000_000)):
        failures.append("candidate_exceeds_static_budget")
    for shard in manifest.get("shards", []):
        path = str(shard.get("path", ""))
        if not is_same_origin(path):
            failures.append(f"non_same_origin_shard:{path}")
            continue
        local = SHARD_DIR / path
        if not local.exists():
            failures.append(f"missing_shard:{path}")
            continue
        if int(shard.get("bytes", -1)) != local.stat().st_size:
            failures.append(f"shard_size_mismatch:{path}")
        if shard.get("sha256") != sha256_file(local):
            failures.append(f"shard_sha256_mismatch:{path}")
    synthetic_answer = "Static shard manifest smoke used synthetic generation path."
    report = {
        "ok": not failures,
        "failures": failures,
        "manifest_path": manifest.get("manifest_path", ""),
        "candidate_id": manifest.get("candidate_id", ""),
        "runtime_mode": manifest.get("runtime_mode", ""),
        "same_origin_paths_verified": not any(failure.startswith("non_same_origin") for failure in failures),
        "checksums_verified": not any("sha256" in failure for failure in failures),
        "budget_verified": not any("budget" in failure for failure in failures),
        "static_forward_performed": False,
        "generation_mode": "synthetic_fallback",
        "synthetic_answer": synthetic_answer,
        "product_model": False,
        "browser_admission": False,
    }
    write_json(MANIFEST_DIR / "browser_loader_smoke.json", report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic-if-missing", action="store_true")
    args = parser.parse_args()
    report = smoke_manifest(ensure_manifest(args.synthetic_if_missing))
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
