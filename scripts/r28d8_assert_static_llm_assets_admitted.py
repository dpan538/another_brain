#!/usr/bin/env python3
"""Assert R28M1 static q4 assets are admitted and deployable."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from r28d8_vercel_static_asset_admission_audit import ROOT, build_audit_report


def run_vercel_check() -> dict:
    result = subprocess.run(
        ["node", "scripts/check_vercel_static_build.mjs"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=300,
    )
    match = re.search(r'"admittedStaticLlmAssets"\s*:\s*(\d+)', result.stdout)
    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "admittedStaticLlmAssets": int(match.group(1)) if match else None,
        "stdout_tail": result.stdout[-4000:],
        "stderr_tail": result.stderr[-2000:],
    }


def main() -> int:
    report = build_audit_report(run_builds=False)
    vercel_check = run_vercel_check()
    failures = list(report["failures"])
    assets = report["assets"]
    runtime = assets["runtime_mode"]

    if assets["q4_shard_count"] < 1:
        failures.append("no_q4_shard_admitted")
    if assets["q4_shard_count"] != assets["quantization_manifest_shard_count"]:
        failures.append("q4_shard_count_does_not_match_quantization_manifest")
    if assets["quantization_manifest_shard_count"] != 5:
        failures.append(f"unexpected_quantization_manifest_shard_count:{assets['quantization_manifest_shard_count']}")
    if not assets["tokenizer_runtime_exists"]:
        failures.append("runtime_tokenizer_missing")
    if assets["full_bundle_estimate_bytes"] >= assets["max_total_static_bytes"]:
        failures.append("static_deploy_bytes_over_100mb")
    for row in assets["expected_assets"]:
        if row["path"].startswith("artifacts/") or "/artifacts/" in row["path"]:
            failures.append(f"artifact_path_used:{row['path']}")
    for key in ["backend_inference", "external_llm_api", "doubao", "hosted_vector_store", "product_model"]:
        if runtime.get(key) is not False:
            failures.append(f"runtime_non_claim_not_false:{key}")
    if not vercel_check["ok"]:
        failures.append("check_vercel_static_build_failed")
    if vercel_check["admittedStaticLlmAssets"] is None:
        failures.append("admittedStaticLlmAssets_not_reported")
    elif vercel_check["admittedStaticLlmAssets"] <= 0:
        failures.append("admittedStaticLlmAssets_not_positive")

    out = {
        "ok": not failures,
        "failures": failures,
        "admittedStaticLlmAssets": vercel_check["admittedStaticLlmAssets"],
        "q4_shard_count": assets["q4_shard_count"],
        "full_bundle_estimate_bytes": assets["full_bundle_estimate_bytes"],
        "remaining_bytes_under_100mb": assets["remaining_bytes_under_100mb"],
        "vercel_check": vercel_check,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if out["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
