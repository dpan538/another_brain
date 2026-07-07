#!/usr/bin/env python3
"""R27B1C static asset packaging policy check."""

from __future__ import annotations

import fnmatch
import json
import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
ASSET_MANIFEST = WEB_ROOT / "another_brain" / "asset_manifest.json"
MAX_TOTAL_STATIC_BYTES = 100_000_000

MODEL_ASSET_SUFFIXES = (".pt", ".pth", ".safetensors", ".ckpt", ".onnx", ".bin", ".gguf")
TOKENIZER_ARTIFACT_NAME = "tokenizer.json"
R28M1_ALLOWED_STATIC_ASSET_PREFIX = "web/another_brain/model_assets/r28m1/"
R28M1_ALLOWED_TOKENIZER = "web/another_brain/model_assets/r28m1/tokenizer/tokenizer.json"

REQUIRED_CANDIDATE_METADATA = (
    "model_asset_manifest",
    "sha256",
    "quantization_manifest",
    "tokenizer_manifest",
    "source_lineage_metadata",
    "non_product",
)


def repo_rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


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
    files: list[Path] = []
    for path in WEB_ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = repo_rel(path)
        if ignored_by_vercel(rel, ignore_entries):
            continue
        files.append(path)
    return sorted(files)


def tracked_files() -> list[str]:
    result = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True)
    return result.stdout.splitlines()


def asset_path_from_item(item: Any) -> str | None:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        value = item.get("path")
        return value if isinstance(value, str) else None
    return None


def is_external_reference(value: str) -> bool:
    if value.startswith("//"):
        return True
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and parsed.netloc not in {"", "localhost", "127.0.0.1"}


def declared_asset_items(manifest: dict[str, Any]) -> list[tuple[str, Any, str]]:
    out: list[tuple[str, Any, str]] = []
    for key in ("model_assets", "tokenizer_assets", "rag_assets", "gate_assets"):
        for item in manifest.get(key, []):
            asset_path = asset_path_from_item(item)
            out.append((key, item, asset_path or ""))
    return out


def tracked_asset_failures() -> list[str]:
    failures: list[str] = []
    for rel in tracked_files():
        lowered = rel.lower()
        if lowered.startswith("artifacts/") and rel != "artifacts/.gitkeep":
            failures.append(f"tracked_artifact:{rel}")
        if lowered.endswith(MODEL_ASSET_SUFFIXES) and not rel.startswith(R28M1_ALLOWED_STATIC_ASSET_PREFIX):
            failures.append(f"tracked_model_asset:{rel}")
        if lowered.endswith("/" + TOKENIZER_ARTIFACT_NAME):
            allowed_fixture = rel == "static_llm/fixtures/tiny_decoder_fixture/tokenizer.json"
            allowed_r28m1_runtime_tokenizer = rel == R28M1_ALLOWED_TOKENIZER
            if not allowed_fixture and not allowed_r28m1_runtime_tokenizer:
                failures.append(f"tracked_tokenizer_artifact:{rel}")
    return failures


def validate_declared_assets(manifest: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    for key, item, asset_path in declared_asset_items(manifest):
        if not asset_path:
            failures.append(f"{key}:missing_path")
            continue
        if is_external_reference(asset_path):
            failures.append(f"{key}:external_reference:{asset_path}")
        if asset_path.startswith("/") or ".." in Path(asset_path).parts:
            failures.append(f"{key}:not_relative_same_origin:{asset_path}")
        if key in {"model_assets", "tokenizer_assets"} and isinstance(item, dict) and not item.get("sha256"):
            failures.append(f"{key}:missing_sha256:{asset_path}")
        if key in {"model_assets", "tokenizer_assets"} and isinstance(item, str):
            failures.append(f"{key}:asset_entry_must_be_object_with_sha256:{asset_path}")
    return failures


def validate_candidate_metadata(manifest: dict[str, Any]) -> list[str]:
    has_candidate_assets = bool(manifest.get("model_assets") or manifest.get("tokenizer_assets"))
    if not has_candidate_assets:
        return []
    metadata = manifest.get("model_asset_manifest")
    if not isinstance(metadata, dict):
        return ["candidate_model_assets_require_model_asset_manifest"]
    failures = []
    for key in REQUIRED_CANDIDATE_METADATA:
        if key not in metadata:
            failures.append(f"model_asset_manifest_missing:{key}")
    if metadata.get("product_admitted") is not True and metadata.get("non_product") is not True:
        failures.append("model_asset_manifest_requires_non_product_unless_admitted")
    return failures


def make_package_report() -> dict[str, Any]:
    manifest = read_json(ASSET_MANIFEST)
    files = deployable_web_files()
    build_output_bytes = sum(path.stat().st_size for path in files)
    declared_model_assets = manifest.get("model_assets", [])
    declared_tokenizer_assets = manifest.get("tokenizer_assets", [])
    failures: list[str] = []

    if build_output_bytes > MAX_TOTAL_STATIC_BYTES:
        failures.append(f"build_output_exceeds_100mb:{build_output_bytes}")
    if manifest.get("same_origin_only") is not True:
        failures.append("asset_manifest_same_origin_only_must_be_true")
    if manifest.get("external_runtime_dependency") is not False:
        failures.append("asset_manifest_external_runtime_dependency_must_be_false")
    if manifest.get("backend_inference") is not False:
        failures.append("asset_manifest_backend_inference_must_be_false")
    failures.extend(validate_declared_assets(manifest))
    failures.extend(validate_candidate_metadata(manifest))
    failures.extend(tracked_asset_failures())

    return {
        "ok": not failures,
        "failures": failures,
        "output_directory": "web",
        "chat_route": "/another_brain_chat/",
        "build_output_bytes": build_output_bytes,
        "max_total_static_bytes": MAX_TOTAL_STATIC_BYTES,
        "static_file_count": len(files),
        "model_assets_declared": len(declared_model_assets),
        "tokenizer_assets_declared": len(declared_tokenizer_assets),
        "same_origin_only": manifest.get("same_origin_only") is True,
        "backend_inference": manifest.get("backend_inference") is True,
        "external_runtime_dependency": manifest.get("external_runtime_dependency") is True,
        "candidate_model_injection_path": {
            "source": "local ignored artifacts after separate admission",
            "copy_timing": "build-time copy only",
            "raw_checkpoint_direct_copy": False,
            "tracked_by_default": False,
        },
        "required_candidate_metadata": list(REQUIRED_CANDIDATE_METADATA),
    }


def main() -> int:
    report = make_package_report()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
