"""Strict reader for the committed R28M1 offset-binary q4 package.

The exporter stores signed int4 values as ``signed + 8`` in little nibble order
(low nibble first) with one symmetric scale per tensor.  The loader validates every
declared byte, checksum and tensor range before dequantising.  It deliberately
does not know how to open a PyTorch checkpoint: R29B2M's seed provenance is
q4-recovered only.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np


class Q4SourceError(ValueError):
    """Raised when an R28M1 source package is malformed or inconsistent."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_json(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise Q4SourceError(f"invalid_json:{path.name}:{exc}") from exc
    if not isinstance(value, dict):
        raise Q4SourceError(f"json_object_required:{path.name}")
    return value


def decode_offset_binary_int4_numpy(raw: bytes, count: int) -> np.ndarray:
    """Decode ``low_then_high`` nibbles using the R28M1 ``nibble - 8`` rule."""
    if count < 0 or count > len(raw) * 2:
        raise Q4SourceError("invalid_q4_decode_count")
    packed = np.frombuffer(raw, dtype=np.uint8)
    values = np.empty(packed.size * 2, dtype=np.int8)
    values[0::2] = (packed & 0x0F).astype(np.int8) - 8
    values[1::2] = (packed >> 4).astype(np.int8) - 8
    return values[:count]


def decode_offset_binary_int4_mlx(raw: bytes, count: int):
    """MLX parity decoder; import MLX lazily so source audits remain NumPy-only."""
    import mlx.core as mx

    decoded = decode_offset_binary_int4_numpy(raw, count)
    result = mx.array(decoded)
    mx.eval(result)
    return result


def _unpack_bool_little_endian(raw: bytes, count: int) -> np.ndarray:
    packed = np.frombuffer(raw, dtype=np.uint8)
    bits = np.unpackbits(packed, bitorder="little")
    return bits[:count].astype(np.bool_)


@dataclass(frozen=True)
class TensorRecord:
    name: str
    shape: tuple[int, ...]
    encoding: str
    offset: int
    bytes: int
    scale: float | None
    pad_nibbles: int
    source_dtype: str


@dataclass(frozen=True)
class R28M1Source:
    asset_dir: Path
    config: dict[str, Any]
    manifest: dict[str, Any]
    checksums: dict[str, Any]
    tokenizer: dict[str, Any]
    tokenizer_sha256: str
    source_sha256: str
    records: tuple[TensorRecord, ...]
    packed: bytes

    @property
    def architecture(self) -> dict[str, Any]:
        arch = self.config.get("architecture")
        if not isinstance(arch, dict):
            raise Q4SourceError("architecture_missing")
        return arch

    def dequantize_numpy(self, name: str, *, dtype: np.dtype[Any] = np.float32) -> np.ndarray:
        record = next((item for item in self.records if item.name == name), None)
        if record is None:
            raise Q4SourceError(f"unknown_tensor:{name}")
        start, stop = record.offset, record.offset + record.bytes
        raw = self.packed[start:stop]
        if len(raw) != record.bytes:
            raise Q4SourceError(f"truncated_tensor:{name}")
        count = int(np.prod(record.shape, dtype=np.int64))
        if record.encoding == "q4_symmetric_per_tensor":
            if record.scale is None or not np.isfinite(record.scale) or record.scale <= 0:
                raise Q4SourceError(f"invalid_scale:{name}")
            expected = (count + 1) // 2
            if record.bytes != expected:
                raise Q4SourceError(f"q4_byte_count:{name}")
            if record.pad_nibbles not in (0, 1):
                raise Q4SourceError(f"q4_pad_nibbles:{name}")
            values = decode_offset_binary_int4_numpy(raw, count).astype(dtype, copy=False)
            return (values * np.asarray(record.scale, dtype=dtype)).reshape(record.shape)
        if record.encoding == "bitpack_bool":
            expected = (count + 7) // 8
            if record.bytes != expected:
                raise Q4SourceError(f"bool_byte_count:{name}")
            return _unpack_bool_little_endian(raw, count).reshape(record.shape)
        raise Q4SourceError(f"unsupported_encoding:{record.encoding}:{name}")

    def dequantize_all_numpy(self, *, dtype: np.dtype[Any] = np.float32) -> dict[str, np.ndarray]:
        return {record.name: self.dequantize_numpy(record.name, dtype=dtype) for record in self.records}


def _relative_path_from_manifest(asset_dir: Path, manifest_path: str) -> Path:
    marker = "another_brain/model_assets/r28m1/"
    if marker not in manifest_path:
        raise Q4SourceError(f"unexpected_shard_path:{manifest_path}")
    return asset_dir / manifest_path.split(marker, 1)[1]


def _validate_architecture(config: dict[str, Any]) -> None:
    architecture = config.get("architecture")
    expected = {"vocab_size": 16000, "context_length": 256, "n_layer": 7, "n_embd": 896, "n_head": 14}
    if not isinstance(architecture, dict):
        raise Q4SourceError("architecture_missing")
    mismatches = {key: (architecture.get(key), value) for key, value in expected.items() if architecture.get(key) != value}
    if mismatches:
        raise Q4SourceError(f"unexpected_architecture:{mismatches}")


def _checksum_for(checksums: dict[str, Any], suffix: str) -> str:
    files = checksums.get("files")
    if not isinstance(files, list):
        raise Q4SourceError("checksum_file_list_missing")
    matches = [item.get("sha256") for item in files if isinstance(item, dict) and str(item.get("path", "")).endswith(suffix)]
    if len(matches) != 1 or not isinstance(matches[0], str):
        raise Q4SourceError(f"checksum_entry_missing:{suffix}")
    return matches[0]


def load_r28m1_q4_source(asset_dir: Path) -> R28M1Source:
    """Validate and open R28M1 without any PyTorch dependency."""
    asset_dir = asset_dir.resolve()
    config_path = asset_dir / "model.config.json"
    manifest_path = asset_dir / "quantization.manifest.json"
    checksum_path = asset_dir / "checksums.sha256.json"
    tokenizer_path = asset_dir / "tokenizer" / "runtime_tokenizer.json"
    config, manifest = _read_json(config_path), _read_json(manifest_path)
    checksums, tokenizer = _read_json(checksum_path), _read_json(tokenizer_path)
    _validate_architecture(config)
    if sha256_file(config_path) != _checksum_for(checksums, "model.config.json"):
        raise Q4SourceError("config_checksum_mismatch")
    if sha256_file(manifest_path) != _checksum_for(checksums, "quantization.manifest.json"):
        raise Q4SourceError("manifest_checksum_mismatch")
    if config.get("tensor_count") != 96:
        raise Q4SourceError("unexpected_tensor_count")
    if manifest.get("quantization_kind") != "q4_symmetric_per_tensor_with_bool_bitpack":
        raise Q4SourceError("unexpected_quantization_kind")
    if manifest.get("shard_count") != 5 or manifest.get("shard_total_bytes") != 48_267_968:
        raise Q4SourceError("unexpected_shard_layout")
    if tokenizer.get("exact_runtime_tokenizer") is not True or tokenizer.get("runtime_compatible") is not True:
        raise Q4SourceError("runtime_tokenizer_contract_missing")
    tokenizer_sha = sha256_file(tokenizer_path)
    expected_tokenizer_sha = _checksum_for(checksums, "tokenizer/runtime_tokenizer.json")
    if expected_tokenizer_sha != tokenizer_sha:
        raise Q4SourceError("tokenizer_checksum_mismatch")
    shard_blobs: list[bytes] = []
    expected_offset = 0
    for shard in manifest.get("shards", []):
        if not isinstance(shard, dict) or shard.get("offset") != expected_offset:
            raise Q4SourceError("shard_offset_gap_or_overlap")
        path = _relative_path_from_manifest(asset_dir, str(shard.get("path", "")))
        if not path.is_file():
            raise Q4SourceError(f"missing_shard:{path.name}")
        blob = path.read_bytes()
        if len(blob) != shard.get("bytes"):
            raise Q4SourceError(f"shard_bytes:{path.name}")
        if sha256_file(path) != shard.get("sha256"):
            raise Q4SourceError(f"shard_checksum:{path.name}")
        shard_blobs.append(blob)
        expected_offset += len(blob)
    packed = b"".join(shard_blobs)
    if len(packed) != manifest.get("shard_total_bytes"):
        raise Q4SourceError("packed_total_bytes")
    if hashlib.sha256(packed).hexdigest() != manifest.get("quantized_sha256"):
        raise Q4SourceError("packed_checksum")
    records: list[TensorRecord] = []
    expected_tensor_offset = 0
    seen_names: set[str] = set()
    for item in config.get("tensors", []):
        if not isinstance(item, dict):
            raise Q4SourceError("tensor_record_not_object")
        name = item.get("name")
        shape = item.get("shape")
        offset, size = item.get("offset"), item.get("bytes")
        if not isinstance(name, str) or not isinstance(shape, list) or not all(isinstance(dim, int) and dim > 0 for dim in shape):
            raise Q4SourceError("invalid_tensor_identity")
        if name in seen_names or offset != expected_tensor_offset or not isinstance(size, int) or size <= 0:
            raise Q4SourceError(f"tensor_gap_overlap_or_duplicate:{name}")
        expected_tensor_offset += size
        seen_names.add(name)
        records.append(TensorRecord(
            name=name,
            shape=tuple(shape),
            encoding=str(item.get("encoding")),
            offset=offset,
            bytes=size,
            scale=float(item["scale"]) if "scale" in item else None,
            pad_nibbles=int(item.get("pad_nibbles", 0)),
            source_dtype=str(item.get("source_dtype", "")),
        ))
    if len(records) != 96 or expected_tensor_offset != len(packed):
        raise Q4SourceError("tensor_coverage")
    return R28M1Source(
        asset_dir=asset_dir,
        config=config,
        manifest=manifest,
        checksums=checksums,
        tokenizer=tokenizer,
        tokenizer_sha256=tokenizer_sha,
        source_sha256=hashlib.sha256(packed).hexdigest(),
        records=tuple(records),
        packed=packed,
    )
