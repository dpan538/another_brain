#!/usr/bin/env python3
"""R27B0 static-only runtime gate."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
CHAT_ROOT = WEB_ROOT / "another_brain_chat"
MANIFEST_PATH = WEB_ROOT / "another_brain" / "asset_manifest.json"

SKIP_DIRS = {
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

API_ROUTE_PATTERNS = (
    re.compile(r"(^|/)api(/|$)"),
    re.compile(r"(^|/)pages/api(/|$)"),
    re.compile(r"(^|/)app/api(/|$)"),
    re.compile(r"(^|/)functions(/|$)"),
    re.compile(r"(^|/)vercel/functions(/|$)"),
)

REMOTE_MODEL_PATTERNS = (
    re.compile(r"https?://[^\s'\"`]+(?:model|weights|checkpoint|tokenizer|gguf|safetensors)", re.I),
    re.compile(r"https?://(?:huggingface\.co|api\.openai\.com|[^\s'\"`]*doubao[^\s'\"`]*)", re.I),
)

EXTERNAL_LLM_TERMS = (
    "api.openai.com",
    "openai.com/v1",
    "anthropic.com",
    "cohere.ai",
    "together.ai",
    "replicate.com",
    "dashscope.aliyuncs.com",
    "volces.com",
    "doubao",
)

HOSTED_STORAGE_TERMS = (
    "pinecone",
    "weaviate",
    "qdrant.cloud",
    "supabase",
    "upstash",
    "vercel blob",
    "@vercel/blob",
    "blob read-write token",
    "kv_rest_api_url",
)


def repo_rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def safe_walk_files() -> list[Path]:
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = Path(dirpath).relative_to(ROOT).as_posix()
        dirnames[:] = [
            name
            for name in dirnames
            if name not in SKIP_DIRS and (Path(rel_dir) / name).as_posix().lstrip("./") not in SKIP_DIRS
        ]
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.suffix.lower() in TEXT_EXTENSIONS:
                out.append(path)
    return out


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def check_manifest(failures: list[str]) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    for key in ("model_assets", "tokenizer_assets", "rag_assets", "gate_assets"):
        value = manifest.get(key)
        if not isinstance(value, list):
            failures.append(f"manifest_{key}_must_be_list")
            continue
        for item in value:
            asset_path = item if isinstance(item, str) else item.get("path")
            if not asset_path:
                failures.append(f"manifest_{key}_missing_path")
                continue
            if asset_path.startswith(("http://", "https://", "//")):
                failures.append(f"manifest_external_asset_reference:{asset_path}")
    for key, expected in {
        "same_origin_only": True,
        "external_runtime_dependency": False,
        "backend_inference": False,
    }.items():
        if manifest.get(key) is not expected:
            failures.append(f"manifest_{key}_must_be_{str(expected).lower()}")


def check_no_api_or_function_inference(failures: list[str]) -> None:
    for path in safe_walk_files():
        rel = repo_rel(path)
        if not any(pattern.search(rel) for pattern in API_ROUTE_PATTERNS):
            continue
        text = read_text(path).lower()
        if any(term in text for term in ("inference", "llm", "completion", "generate", "model")):
            failures.append(f"api_or_function_inference_file:{rel}")


def check_no_external_runtime_dependencies(failures: list[str]) -> None:
    scanned_roots = [
        CHAT_ROOT,
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
        text = read_text(path).lower()
        if any(term in text for term in EXTERNAL_LLM_TERMS) and "no " not in text:
            failures.append(f"external_llm_endpoint_reference:{rel}")
        if any(term in text for term in HOSTED_STORAGE_TERMS):
            failures.append(f"hosted_runtime_storage_reference:{rel}")
        if any(pattern.search(text) for pattern in REMOTE_MODEL_PATTERNS):
            failures.append(f"remote_model_url_reference:{rel}")


def check_chat_shell_static_only(failures: list[str]) -> None:
    for path in CHAT_ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        rel = repo_rel(path)
        text = read_text(path)
        lowered = text.lower()
        if "xmlhttprequest" in lowered or "websocket" in lowered:
            failures.append(f"chat_shell_network_call:{rel}")
        if "fetch(" in lowered:
            static_rag_fetch = "static_rag" in lowered and not re.search(r"fetch\(\s*['\"]https?://", text, re.I)
            if not static_rag_fetch:
                failures.append(f"chat_shell_network_call:{rel}")
        if re.search(r"(src|href)=['\"]https?://", text, re.I):
            failures.append(f"chat_shell_external_asset_reference:{rel}")


def check_vercel_static_config(failures: list[str]) -> None:
    vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    if vercel.get("framework") is not None:
        failures.append("vercel_framework_must_remain_null")
    if vercel.get("outputDirectory") != "web":
        failures.append("vercel_output_directory_must_remain_web")
    if "functions" in vercel or "routes" in vercel:
        failures.append("vercel_must_not_define_runtime_functions_or_routes")


def check_static_only() -> list[str]:
    failures: list[str] = []
    check_manifest(failures)
    check_vercel_static_config(failures)
    check_no_api_or_function_inference(failures)
    check_no_external_runtime_dependencies(failures)
    check_chat_shell_static_only(failures)
    return failures


def main() -> int:
    failures = check_static_only()
    if failures:
        print("R27B0 static-only runtime check failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("R27B0 static-only runtime check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
