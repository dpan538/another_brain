#!/usr/bin/env python3
"""Audit R28M1 q4 and materialise the explicitly q4-recovered MLX seed."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
from pathlib import Path
import sys
from typing import Any

import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.training.mlx.r29b2m_campaign import atomic_json  # noqa: E402
from src.training.mlx.r29b2m_q4_source import load_r28m1_q4_source, sha256_file  # noqa: E402


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _source_file_checksums(source: Any) -> list[dict[str, Any]]:
    files = source.checksums.get("files", [])
    if not isinstance(files, list):
        raise ValueError("source_checksum_files_missing")
    return files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--asset-dir", type=Path, required=True)
    args = parser.parse_args()
    source = load_r28m1_q4_source(args.asset_dir)
    tensors = source.dequantize_all_numpy(dtype=np.float32)
    finite = {
        name: bool(values.dtype == np.bool_ or np.all(np.isfinite(values)))
        for name, values in tensors.items()
    }
    if not all(finite.values()):
        raise ValueError("nonfinite_q4_recovered_seed")
    import mlx.core as mx

    seed_dir = args.artifact_root / "seed"
    seed_dir.mkdir(parents=True, exist_ok=True)
    seed_path = seed_dir / "model_seed.safetensors"
    mlx_tensors = {name: mx.array(values) for name, values in tensors.items()}
    mx.eval(*mlx_tensors.values())
    mx.save_safetensors(str(seed_path), mlx_tensors)
    # Re-open to prove the serialized seed is readable and has no dropped tensor.
    reloaded = mx.load(str(seed_path))
    if set(reloaded) != set(mlx_tensors):
        raise ValueError("seed_safetensors_tensor_set_mismatch")
    mx.eval(*reloaded.values())
    manifest = {
        "schema_version": "r29b2m.q4_recovered_seed.v1",
        "created_at": now(),
        "source_kind": "r28m1_q4_recovered_seed",
        "source_precision": "q4_symmetric_per_tensor",
        "source_fp32_checkpoint_loaded": False,
        "source_checkpoint_parity_claim": False,
        "source_quantized_sha256": source.source_sha256,
        "tokenizer_sha256": source.tokenizer_sha256,
        "source_files": _source_file_checksums(source),
        "architecture": source.architecture,
        "tensor_count": len(source.records),
        "tensors": [
            {"name": record.name, "shape": list(record.shape), "dtype": str(tensors[record.name].dtype), "encoding": record.encoding}
            for record in source.records
        ],
        "seed_safetensors_sha256": sha256_file(seed_path),
        "seed_safetensors_bytes": seed_path.stat().st_size,
        "provenance": {
            "public_r28m1_package": True,
            "q4_dequantisation": "low_nibble_then_high_nibble_signed_minus_8_times_per_tensor_scale",
            "no_pytorch_checkpoint_opened": True,
        },
    }
    atomic_json(seed_dir / "seed_manifest.json", manifest)
    report = {
        "campaign_id": "r29b2m_m1_mlx_daily_dialogue_v1",
        "created_at": now(),
        "valid": True,
        "source_kind": manifest["source_kind"],
        "source_fp32_checkpoint_loaded": False,
        "source_checkpoint_parity_claim": False,
        "q4_source_sha256": source.source_sha256,
        "tokenizer_sha256": source.tokenizer_sha256,
        "shard_total_bytes": len(source.packed),
        "shard_count": len(source.manifest["shards"]),
        "tensor_count": len(source.records),
        "architecture": source.architecture,
        "all_finite": all(finite.values()),
        "mask_records": [record.name for record in source.records if record.encoding == "bitpack_bool"],
        "seed_manifest_sha256": sha256_file(seed_dir / "seed_manifest.json"),
        "seed_safetensors_bytes": seed_path.stat().st_size,
        "seed_safetensors_sha256": manifest["seed_safetensors_sha256"],
    }
    atomic_json(args.artifact_root / "reports" / "q4_source_audit.json", report)
    print(json.dumps({"valid": True, "seed_bytes": report["seed_safetensors_bytes"], "tensor_count": report["tensor_count"]}, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
