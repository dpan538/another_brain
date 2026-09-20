#!/usr/bin/env python3
"""R27B0 static asset budget gate."""

from __future__ import annotations

import re

import fnmatch
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
MANIFEST_PATH = WEB_ROOT / "another_brain" / "asset_manifest.json"

# Two separate ceilings, R31A3.
#
# PLATFORM_MAX_STATIC_BYTES is what Vercel will accept. The old 100 MB figure
# was the Hobby limit; this project deploys on Pro, where static uploads are
# capped at 1 GB and included Fast Data Transfer is 1 TB per month.
#
# COLD_START_BUDGET_BYTES is the number that actually governs the product. It
# is not a platform limit, it is what a phone will sit through. Production
# transfer was measured at about 209 KB/s in R29LOAD1, so every 1 MB of
# first-visit payload costs roughly 5 seconds on a cold load:
#
#     49.8 MB (today, q4 model included)     ~4.0 minutes
#      0.5 MB (q4 model dropped)             ~2.5 seconds
#    120.5 MB (a browser multilingual encoder) ~9.6 minutes
#
# The platform would accept all three. Only the first two are a product.
PLATFORM_MAX_STATIC_BYTES = 1_000_000_000
# Product decision: a 10 MB first-visit payload is acceptable. On the measured
# CDN transfer rate that is about 4 s, inside the 5 s warm-up requirement.
COLD_START_BUDGET_BYTES = 10_000_000
MAX_TOTAL_STATIC_BYTES = PLATFORM_MAX_STATIC_BYTES
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
    """Files Vercel actually serves.

    R31A3 correction. This previously filtered by `.vercelignore`, which lists
    `*.bin`, so the five q4 model shards were excluded from every budget number.
    They are served in production: a range request to
    /another_brain/model_assets/r28m1/shards/model-q4-00001.bin returns 206, and
    a HEAD returns 200 with content-length 12000000. `.vercelignore` filters a
    CLI source upload; this project deploys from a Git connection, where the
    repository contents are cloned instead. The gate was therefore reporting
    21.7 MB against a real payload of 71.0 MB.

    Git-tracked content under web/ is what the deployment receives, so that is
    what is measured.
    """
    tracked = subprocess.run(
        ["git", "ls-files", "web"],
        cwd=ROOT, capture_output=True, text=True, check=False,
    ).stdout.split()
    files = []
    for rel in tracked:
        path = ROOT / rel
        if path.is_file():
            files.append(path)
    if files:
        return files
    # Fall back to a plain walk when git metadata is unavailable.
    return [p for p in WEB_ROOT.rglob("*") if p.is_file()]


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
    """Refuse a remote origin used as a model-asset source.

    The intent is that model weights, tokenizers and checkpoints load from this
    origin only. Two corrections, R31A0:

    1. The previous check treated the bare substring "//" as a URL prefix, so
       every file containing a JavaScript comment and the word "model" failed.
       q4_worker_runtime.js, which contains no absolute URL at all, failed for
       that reason. Only a real absolute URL counts now, and it must sit on the
       same line as a model-asset term.
    2. The product answers with DeepSeek, called by the browser with a key the
       user supplies at runtime. The reviewed BYOK files may name that one host.
       No other remote host is allowed anywhere, and a model asset may never be
       fetched from any remote host, including that one.
    """
    failures = []
    url_model_terms = ("model", "weights", "checkpoint", "gguf", "safetensors", "shard")
    absolute_url = re.compile(r'''\bhttps?://[^\s"'`)>\]]+''', re.IGNORECASE)
    byok_allowed_host = "api.deepseek.com"
    byok_files = {
        "web/another_brain_chat/deepseek_answer_path.js",
        "web/another_brain_chat/deepseek_browser_adapter.js",
        "web/another_brain_chat/deepseek_key_store.js",
        "web/another_brain_chat/deepseek_system_prompt.js",
        "web/another_brain_chat/deterministic_length_policy.js",
        "web/another_brain_chat/local_signal_provider.js",
        "web/another_brain_chat/style_policy_compiler.js",
        "web/another_brain_chat/app.js",
        "web/another_brain_chat/index.html",
        "web/index.html",
        "web/another_brain_chat.html",
    }
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
        rel = repo_rel(path)
        is_byok = str(rel).replace("\\", "/") in byok_files
        text = path.read_text(encoding="utf-8", errors="ignore")
        for line in text.splitlines():
            urls = absolute_url.findall(line)
            if not urls:
                continue
            lowered = line.lower()
            for url in urls:
                host = url.split("//", 1)[-1].split("/", 1)[0].lower()
                if host == byok_allowed_host:
                    if not is_byok:
                        failures.append(f"deepseek_host_outside_byok_files:{rel}")
                    elif any(term in lowered for term in url_model_terms):
                        failures.append(f"model_asset_from_remote_host:{rel}")
                    continue
                if any(term in lowered for term in url_model_terms):
                    failures.append(f"external_model_or_llm_url:{rel}")
    return sorted(set(failures))


def check_budget() -> list[str]:
    failures = []
    manifest = load_manifest()

    if manifest.get("max_total_static_bytes") != PLATFORM_MAX_STATIC_BYTES:
        failures.append("manifest_max_total_static_bytes_mismatch")
    if manifest.get("same_origin_only") is not True:
        failures.append("manifest_same_origin_only_must_be_true")
    if manifest.get("external_runtime_dependency") is not False:
        failures.append("manifest_external_runtime_dependency_must_be_false")
    if manifest.get("backend_inference") is not False:
        failures.append("manifest_backend_inference_must_be_false")

    deployable_total = sum(path.stat().st_size for path in deployable_web_files())
    if deployable_total > PLATFORM_MAX_STATIC_BYTES:
        failures.append(f"deployable_static_bytes_exceed_platform_limit:{deployable_total}")
    if deployable_total > COLD_START_BUDGET_BYTES:
        seconds = deployable_total / 208_919
        failures.append(
            f"cold_start_budget_exceeded:{deployable_total}>{COLD_START_BUDGET_BYTES}"
            f" (~{seconds:.0f}s first visit at measured production transfer rate)"
        )

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
