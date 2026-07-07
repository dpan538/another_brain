#!/usr/bin/env python3
"""R27B0 static asset budget gate."""

from __future__ import annotations

import fnmatch
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
MANIFEST_PATH = WEB_ROOT / "another_brain" / "asset_manifest.json"

MAX_TOTAL_STATIC_BYTES = 100_000_000
CATEGORY_BUDGETS = {
    "model_assets": 70_000_000,
    "tokenizer_assets": 5_000_000,
    "runtime_app_shell_assets": 15_000_000,
    "rag_gate_assets": 10_000_000,
}

WEIGHT_EXTENSIONS = {
    ".bin",
    ".ckpt",
    ".gguf",
    ".mlmodel",
    ".mlpackage",
    ".onnx",
    ".pt",
    ".pth",
    ".safetensors",
}

R28M1_ALLOWED_STATIC_MODEL_SHARD_PREFIX = "web/another_brain/model_assets/r28m1/shards/model-q4-"

FORBIDDEN_CODE_DIRS = (
    "api",
    "pages/api",
    "app/api",
    "functions",
    "vercel/functions",
)

EXCLUDED_WALK_DIRS = {
    ".git",
    ".vercel",
    "artifacts",
    "data/public_ingestion",
    "node_modules",
    "__pycache__",
}

TEXT_EXTENSIONS = {
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".py",
    ".sh",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}


def repo_rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def load_vercel_ignore() -> list[str]:
    path = ROOT / ".vercelignore"
    if not path.exists():
        return []
    entries = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and not line.startswith("!"):
            entries.append(line)
    return entries


def ignored_by_vercel(rel: str, entries: list[str]) -> bool:
    for entry in entries:
        normalized = entry.rstrip("/")
        if entry.endswith("/**"):
            prefix = normalized[:-3]
            if rel == prefix or rel.startswith(prefix + "/"):
                return True
        if fnmatch.fnmatch(rel, entry) or rel == normalized or rel.startswith(normalized + "/"):
            return True
    return False


def deployable_web_files() -> list[Path]:
    ignore_entries = load_vercel_ignore()
    files = []
    for path in WEB_ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = repo_rel(path)
        if ignored_by_vercel(rel, ignore_entries):
            continue
        files.append(path)
    return files


def declared_asset_bytes(manifest: dict, key: str) -> int:
    total = 0
    for item in manifest.get(key, []):
        if isinstance(item, str):
            asset_path = item
            declared = None
        else:
            asset_path = item.get("path")
            declared = item.get("bytes")
        if not asset_path:
            raise AssertionError(f"{key}:missing_path")
        if asset_path.startswith(("http://", "https://", "//")):
            raise AssertionError(f"{key}:external_asset_url:{asset_path}")
        candidate = (WEB_ROOT / asset_path.lstrip("/")).resolve()
        if not str(candidate).startswith(str(WEB_ROOT.resolve())):
            raise AssertionError(f"{key}:asset_outside_web:{asset_path}")
        if not candidate.exists():
            raise AssertionError(f"{key}:missing_asset:{asset_path}")
        actual = candidate.stat().st_size
        if declared is not None and int(declared) != actual:
            raise AssertionError(f"{key}:declared_size_mismatch:{asset_path}")
        total += actual
    return total


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout.splitlines()


def is_allowed_r28m1_static_model_shard(rel: str) -> bool:
    path = ROOT / rel
    return (
        rel.startswith(R28M1_ALLOWED_STATIC_MODEL_SHARD_PREFIX)
        and rel.endswith(".bin")
        and path.exists()
        and path.stat().st_size <= 25_000_000
    )


def safe_walk_files() -> list[Path]:
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = Path(dirpath).relative_to(ROOT).as_posix()
        dirnames[:] = [
            name
            for name in dirnames
            if (Path(rel_dir) / name).as_posix().lstrip("./") not in EXCLUDED_WALK_DIRS
            and name not in EXCLUDED_WALK_DIRS
        ]
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.suffix.lower() in TEXT_EXTENSIONS:
                out.append(path)
    return out


def check_no_forbidden_inference_surfaces() -> list[str]:
    failures = []
    for rel_dir in FORBIDDEN_CODE_DIRS:
        path = ROOT / rel_dir
        if not path.exists():
            continue
        for file_path in path.rglob("*"):
            if not file_path.is_file() or file_path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            text = file_path.read_text(encoding="utf-8", errors="ignore")
            if any(term in text.lower() for term in ("inference", "llm", "model", "completion", "generate")):
                failures.append(f"forbidden_inference_surface:{repo_rel(file_path)}")
    return failures


def check_forbidden_urls() -> list[str]:
    failures = []
    external_model_url = (
        "http://",
        "https://",
        "//",
    )
    url_model_terms = ("model", "weights", "checkpoint", "tokenizer", "gguf", "safetensors")
    scanned_roots = [
        WEB_ROOT / "another_brain_chat",
        WEB_ROOT / "another_brain",
        ROOT / "vercel.json",
        ROOT / "package.json",
    ]
    paths: list[Path] = []
    for root in scanned_roots:
        if root.is_file():
            paths.append(root)
        elif root.exists():
            paths.extend(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS)
    for path in paths:
        text = path.read_text(encoding="utf-8", errors="ignore").lower()
        if any(prefix in text for prefix in external_model_url) and any(term in text for term in url_model_terms):
            failures.append(f"external_model_or_llm_url:{repo_rel(path)}")
    return failures


def check_budget() -> list[str]:
    failures = []
    manifest = load_manifest()

    if manifest.get("max_total_static_bytes") != MAX_TOTAL_STATIC_BYTES:
        failures.append("manifest_max_total_static_bytes_mismatch")
    if manifest.get("same_origin_only") is not True:
        failures.append("manifest_same_origin_only_must_be_true")
    if manifest.get("external_runtime_dependency") is not False:
        failures.append("manifest_external_runtime_dependency_must_be_false")
    if manifest.get("backend_inference") is not False:
        failures.append("manifest_backend_inference_must_be_false")

    deployable_total = sum(path.stat().st_size for path in deployable_web_files())
    if deployable_total > MAX_TOTAL_STATIC_BYTES:
        failures.append(f"deployable_static_bytes_exceed_100mb:{deployable_total}")

    try:
        model_bytes = declared_asset_bytes(manifest, "model_assets")
        tokenizer_bytes = declared_asset_bytes(manifest, "tokenizer_assets")
        rag_bytes = declared_asset_bytes(manifest, "rag_assets")
        gate_bytes = declared_asset_bytes(manifest, "gate_assets")
    except AssertionError as error:
        failures.append(str(error))
        model_bytes = tokenizer_bytes = rag_bytes = gate_bytes = 0

    shell_names = (
        "index.html",
        "styles.css",
        "runtime_interfaces.js",
        "mock_runtime.js",
        "app.js",
    )
    runtime_shell_bytes = sum((WEB_ROOT / "another_brain_chat" / name).stat().st_size for name in shell_names)

    category_totals = {
        "model_assets": model_bytes,
        "tokenizer_assets": tokenizer_bytes,
        "runtime_app_shell_assets": runtime_shell_bytes,
        "rag_gate_assets": rag_bytes + gate_bytes,
    }
    for key, total in category_totals.items():
        if total > CATEGORY_BUDGETS[key]:
            failures.append(f"{key}_budget_exceeded:{total}>{CATEGORY_BUDGETS[key]}")

    declared_total = model_bytes + tokenizer_bytes + rag_bytes + gate_bytes
    if manifest.get("total_declared_bytes") != declared_total:
        failures.append(f"manifest_total_declared_bytes_mismatch:{manifest.get('total_declared_bytes')}!={declared_total}")

    for tracked in tracked_files():
        suffix = Path(tracked).suffix.lower()
        if suffix in WEIGHT_EXTENSIONS and not is_allowed_r28m1_static_model_shard(tracked):
            failures.append(f"tracked_weight_asset:{tracked}")
        if tracked.startswith("artifacts/") and tracked != "artifacts/.gitkeep":
            failures.append(f"tracked_artifact:{tracked}")
        if tracked.startswith("web/another_brain_chat/") and "api" in tracked.lower():
            failures.append(f"chat_shell_must_not_add_api:{tracked}")

    failures.extend(check_no_forbidden_inference_surfaces())
    failures.extend(check_forbidden_urls())
    return failures


def main() -> int:
    failures = check_budget()
    if failures:
        print("R27B0 static asset budget check failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("R27B0 static asset budget check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
