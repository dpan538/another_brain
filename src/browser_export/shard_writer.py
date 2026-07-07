from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .export_manifest import sha256_file

SHARD_SCHEMA_VERSION = "r27b1a.static_tensor_shards.v1"


def _bytes_for_tensor(name: str, shape: list[int], dtype: str) -> bytes:
    payload = {
        "name": name,
        "shape": shape,
        "dtype": dtype,
        "synthetic_payload": True,
    }
    return json.dumps(payload, sort_keys=True).encode("utf-8")


def write_static_shards(
    *,
    output_dir: Path,
    tensors: list[dict[str, Any]],
    config: dict[str, Any] | None = None,
    quantization: dict[str, Any] | None = None,
    shard_prefix: str = "tensor",
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    assets: list[dict[str, Any]] = []
    for index, tensor in enumerate(tensors):
        rel_name = f"{shard_prefix}-{index:05d}.bin"
        path = output_dir / rel_name
        path.write_bytes(_bytes_for_tensor(tensor["name"], tensor["shape"], tensor.get("dtype", "float32")))
        assets.append(
            {
                "path": rel_name,
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "tensor": tensor["name"],
            }
        )

    config_path = output_dir / "config.json"
    config_path.write_text(json.dumps(config or {}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    quant_path = output_dir / "quantization.json"
    quant_path.write_text(json.dumps(quantization or {}, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    manifest = {
        "schema_version": SHARD_SCHEMA_VERSION,
        "same_origin_only": True,
        "backend_inference": False,
        "external_runtime_dependency": False,
        "tokenizer_manifest_reference": None,
        "config": {"path": "config.json", "bytes": config_path.stat().st_size, "sha256": sha256_file(config_path)},
        "quantization": {"path": "quantization.json", "bytes": quant_path.stat().st_size, "sha256": sha256_file(quant_path)},
        "tensor_shards": assets,
        "total_shard_bytes": sum(asset["bytes"] for asset in assets),
    }
    manifest_path = output_dir / "shard_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest


def validate_shard_manifest(manifest: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    if manifest.get("schema_version") != SHARD_SCHEMA_VERSION:
        failures.append("schema_version_mismatch")
    if manifest.get("same_origin_only") is not True:
        failures.append("same_origin_only_must_be_true")
    if manifest.get("backend_inference") is not False:
        failures.append("backend_inference_must_be_false")
    for shard in manifest.get("tensor_shards", []):
        path = str(shard.get("path", ""))
        if path.startswith(("http://", "https://", "//")) or path.startswith("/"):
            failures.append(f"non_relative_shard_path:{path}")
    return failures
