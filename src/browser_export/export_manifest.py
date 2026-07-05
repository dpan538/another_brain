from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "r27b1a.browser_export_manifest.v1"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def make_export_manifest(
    *,
    runtime_version: str = "r27b1a-export-experiment-v1",
    source_checkpoint: str | None = None,
    config: dict[str, Any] | None = None,
    tensors: list[dict[str, Any]] | None = None,
    assets: list[dict[str, Any]] | None = None,
    quantization: dict[str, Any] | None = None,
    onnx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "runtime_version": runtime_version,
        "source_checkpoint": source_checkpoint,
        "same_origin_only": True,
        "external_runtime_dependency": False,
        "backend_inference": False,
        "product_admission": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "tokenizer_artifact_committed": False,
        "model_assets_committed": False,
        "config": config or {},
        "tensors": tensors or [],
        "assets": assets or [],
        "quantization": quantization or {},
        "onnx": onnx or {"attempted": False, "supported": False, "blocker": "not_attempted"},
    }


def validate_export_manifest(manifest: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    if manifest.get("schema_version") != SCHEMA_VERSION:
        failures.append("schema_version_mismatch")
    for key in ("same_origin_only",):
        if manifest.get(key) is not True:
            failures.append(f"{key}_must_be_true")
    for key in (
        "external_runtime_dependency",
        "backend_inference",
        "product_admission",
        "browser_admission",
        "release_checkpoint",
        "tokenizer_artifact_committed",
        "model_assets_committed",
    ):
        if manifest.get(key) is not False:
            failures.append(f"{key}_must_be_false")
    for asset in manifest.get("assets", []):
        path = str(asset.get("path", ""))
        if path.startswith(("http://", "https://", "//")):
            failures.append(f"external_asset_path:{path}")
    return failures


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
