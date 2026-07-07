#!/usr/bin/env python3
"""Audit Vercel source-upload admission for the R28M1 static q4 assets."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "artifacts" / "r28d8" / "reports" / "vercel_static_asset_admission_audit.json"
R28M1_DIR = Path("web/another_brain/model_assets/r28m1")
STATIC_MANIFEST = Path("static_llm/manifests/r28m1_new_96m_q4.admitted.json")
ASSET_MANIFEST = Path("web/another_brain/asset_manifest.json")
RUNTIME_MODE = Path("web/another_brain/runtime_mode.json")
BUILD_MUTABLE_FILES = [
    Path("web/app.js"),
    Path("web/index.html"),
    Path("web/runtime_version.js"),
]
MAX_TOTAL_STATIC_BYTES = 100_000_000


def repo_path(path: Path | str) -> str:
    return str(path).replace("\\", "/").lstrip("./")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str], *, env: dict[str, str] | None = None, timeout: int = 300) -> dict[str, Any]:
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    result = subprocess.run(command, cwd=ROOT, env=full_env, text=True, capture_output=True, timeout=timeout)
    stdout = result.stdout[-8000:]
    stderr = result.stderr[-4000:]
    admitted = None
    match = re.search(r'"admittedStaticLlmAssets"\s*:\s*(\d+)', stdout)
    if match:
        admitted = int(match.group(1))
    return {
        "command": command,
        "env": env or {},
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "admittedStaticLlmAssets": admitted,
        "static_llm_admission_count_zero": admitted == 0,
        "stdout_tail": stdout,
        "stderr_tail": stderr,
    }


def load_vercelignore_rules(text: str) -> list[tuple[str, bool, str]]:
    rules: list[tuple[str, bool, str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        include = line.startswith("!")
        pattern = line[1:] if include else line
        rules.append((pattern.lstrip("/"), include, line))
    return rules


def pattern_matches(rel: str, pattern: str) -> bool:
    rel = repo_path(rel)
    pattern = pattern.rstrip()
    if not pattern:
        return False
    if pattern.endswith("/**"):
        prefix = pattern[:-3].rstrip("/")
        return rel == prefix or rel.startswith(f"{prefix}/")
    if pattern.endswith("/"):
        prefix = pattern.rstrip("/")
        return rel == prefix or rel.startswith(f"{prefix}/")
    if "/" not in pattern:
        return any(fnmatch.fnmatchcase(part, pattern) for part in rel.split("/"))
    if not any(token in pattern for token in "*?[]"):
        normalized = pattern.rstrip("/")
        return rel == normalized or rel.startswith(f"{normalized}/")
    return fnmatch.fnmatchcase(rel, pattern)


def is_vercel_ignored(rel: str, rules: list[tuple[str, bool, str]]) -> tuple[bool, list[str]]:
    ignored = False
    matched: list[str] = []
    for pattern, include, raw in rules:
        if pattern_matches(rel, pattern):
            ignored = not include
            matched.append(raw)
    return ignored, matched


def git_ls_files(prefix: str) -> set[str]:
    result = subprocess.run(["git", "ls-files", prefix], cwd=ROOT, text=True, capture_output=True, check=True)
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def snapshot_mutable_files() -> dict[str, str]:
    return {repo_path(path): (ROOT / path).read_text(encoding="utf-8") for path in BUILD_MUTABLE_FILES}


def restore_mutable_files(snapshot: dict[str, str]) -> None:
    for rel, text in snapshot.items():
        (ROOT / rel).write_text(text, encoding="utf-8")


def expected_asset_paths(static_manifest: dict[str, Any]) -> list[str]:
    return [repo_path(item["path"]) for item in static_manifest.get("files", []) if isinstance(item, dict) and item.get("path")]


def inspect_assets() -> dict[str, Any]:
    static_manifest = read_json(STATIC_MANIFEST)
    asset_manifest = read_json(ASSET_MANIFEST)
    runtime_mode = read_json(RUNTIME_MODE)
    checksum_manifest = read_json(R28M1_DIR / "checksums.sha256.json")
    quantization_manifest = read_json(R28M1_DIR / "quantization.manifest.json")
    tracked = git_ls_files(repo_path(R28M1_DIR))
    rules = load_vercelignore_rules((ROOT / ".vercelignore").read_text(encoding="utf-8"))
    failures: list[str] = []

    expected = expected_asset_paths(static_manifest)
    asset_rows = []
    q4_shards = []
    for rel in expected:
        abs_path = ROOT / rel
        ignored, matched_rules = is_vercel_ignored(rel, rules)
        exists = abs_path.exists()
        tracked_by_git = rel in tracked
        size = abs_path.stat().st_size if exists else 0
        sha = sha256_file(abs_path) if exists else ""
        row = {
            "path": rel,
            "exists": exists,
            "tracked_by_git": tracked_by_git,
            "vercel_ignored": ignored,
            "matched_vercelignore_rules": matched_rules,
            "bytes": size,
            "sha256": sha,
        }
        asset_rows.append(row)
        if "/shards/" in rel and rel.endswith(".bin"):
            q4_shards.append(row)
        if not exists:
            failures.append(f"missing_expected_asset:{rel}")
        if not tracked_by_git:
            failures.append(f"expected_asset_not_tracked:{rel}")
        if ignored:
            failures.append(f"expected_asset_ignored_by_vercel:{rel}")

    checksum_files = checksum_manifest.get("files", [])
    checksum_paths = {f"web/{repo_path(item.get('path', ''))}" for item in checksum_files if isinstance(item, dict)}
    for row in asset_rows:
        if row["path"].endswith("checksums.sha256.json"):
            continue
        if row["path"] not in checksum_paths:
            failures.append(f"checksum_manifest_missing_asset:{row['path']}")
    if checksum_manifest.get("file_count") != len(checksum_files):
        failures.append("checksum_manifest_file_count_mismatch")

    quant_shard_count = int(quantization_manifest.get("shard_count") or 0)
    if quant_shard_count != len(q4_shards):
        failures.append(f"q4_shard_count_mismatch:{quant_shard_count}:{len(q4_shards)}")
    for row in q4_shards:
        if row["bytes"] > int(quantization_manifest.get("max_shard_bytes") or 0):
            failures.append(f"q4_shard_exceeds_quantization_max:{row['path']}:{row['bytes']}")
        if row["bytes"] > 25_000_000:
            failures.append(f"q4_shard_exceeds_r28d8_max:{row['path']}:{row['bytes']}")

    policy_text = (ROOT / "scripts/static_llm_policy.mjs").read_text(encoding="utf-8")
    for prefix in [
        "static_llm/assets/",
        "web/static_llm/assets/",
        "web/another_brain/model_assets/r28m1/",
    ]:
        if prefix not in policy_text:
            failures.append(f"static_llm_policy_missing_prefix:{prefix}")

    manifest_model_assets = asset_manifest.get("model_assets", [])
    manifest_tokenizer_assets = asset_manifest.get("tokenizer_assets", [])
    manifest_paths = {
        f"web/{repo_path(item.get('path', ''))}"
        for item in [*manifest_model_assets, *manifest_tokenizer_assets]
        if isinstance(item, dict)
    }
    for row in asset_rows:
        if row["path"].endswith("checksums.sha256.json"):
            continue
        if row["path"] not in manifest_paths and "tokenizer/tokenizer.json" not in row["path"]:
            failures.append(f"asset_manifest_missing_asset:{row['path']}")

    total_static = int(asset_manifest.get("full_bundle_estimate_bytes") or 0)
    if total_static >= MAX_TOTAL_STATIC_BYTES:
        failures.append(f"full_bundle_over_100mb:{total_static}")
    if runtime_mode.get("backend_inference") is not False or runtime_mode.get("external_llm_api") is not False:
        failures.append("runtime_mode_external_or_backend_inference_enabled")
    if runtime_mode.get("product_model") is not False or runtime_mode.get("product_admission") is not False:
        failures.append("runtime_mode_product_claim_enabled")

    return {
        "ok": not failures,
        "failures": failures,
        "r28m1_dir": repo_path(R28M1_DIR),
        "expected_assets": asset_rows,
        "expected_asset_count": len(asset_rows),
        "q4_shard_count": len(q4_shards),
        "quantization_manifest_shard_count": quant_shard_count,
        "tokenizer_runtime_exists": (ROOT / R28M1_DIR / "tokenizer/runtime_tokenizer.json").exists(),
        "model_config_exists": (ROOT / R28M1_DIR / "model.config.json").exists(),
        "quantization_manifest_exists": (ROOT / R28M1_DIR / "quantization.manifest.json").exists(),
        "checksums_manifest_exists": (ROOT / R28M1_DIR / "checksums.sha256.json").exists(),
        "tracked_r28m1_files": sorted(tracked),
        "vercelignore_rules_relevant_to_r28m1": sorted({rule for row in asset_rows for rule in row["matched_vercelignore_rules"]}),
        "asset_manifest_model_asset_count": len(manifest_model_assets),
        "asset_manifest_tokenizer_asset_count": len(manifest_tokenizer_assets),
        "static_manifest_file_count": len(static_manifest.get("files", [])),
        "checksum_manifest_file_count": checksum_manifest.get("file_count"),
        "full_bundle_estimate_bytes": total_static,
        "remaining_bytes_under_100mb": int(asset_manifest.get("remaining_bytes_under_100mb") or 0),
        "max_total_static_bytes": MAX_TOTAL_STATIC_BYTES,
        "runtime_mode": {
            "model_mode": runtime_mode.get("model_mode"),
            "backend_inference": runtime_mode.get("backend_inference"),
            "external_llm_api": runtime_mode.get("external_llm_api"),
            "doubao": runtime_mode.get("doubao"),
            "hosted_vector_store": runtime_mode.get("hosted_vector_store"),
            "product_model": runtime_mode.get("product_model"),
            "product_admission": runtime_mode.get("product_admission"),
            "browser_admission": runtime_mode.get("browser_admission"),
            "release_checkpoint_admission": runtime_mode.get("release_checkpoint_admission"),
            "phase_4": runtime_mode.get("phase_4"),
        },
    }


def run_build_matrix() -> list[dict[str, Any]]:
    snapshot = snapshot_mutable_files()
    try:
        return [
            run(["npm", "run", "build:vercel"]),
            run(["npm", "run", "build:vercel"], env={"CI": "1"}),
            run(["npm", "run", "build:vercel"], env={"VERCEL": "1"}),
            run(["npm", "run", "build:vercel"], env={"CI": "1", "VERCEL": "1"}),
        ]
    finally:
        restore_mutable_files(snapshot)


def build_audit_report(*, run_builds: bool = True) -> dict[str, Any]:
    assets = inspect_assets()
    build_matrix = run_build_matrix() if run_builds else []
    failures = list(assets["failures"])
    for item in build_matrix:
        if not item["ok"]:
            failures.append(f"build_command_failed:{' '.join(item['command'])}:{item['env']}")
        if item["static_llm_admission_count_zero"]:
            failures.append(f"build_static_llm_admission_count_zero:{item['env']}")
    return {
        "ok": not failures,
        "failures": failures,
        "assets": assets,
        "build_matrix": build_matrix,
        "root_cause_checked": ".vercelignore must not exclude admitted R28M1 q4 shard .bin files",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-builds", action="store_true", help="Skip build matrix; useful for unit tests.")
    args = parser.parse_args()
    report = build_audit_report(run_builds=not args.no_builds)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
