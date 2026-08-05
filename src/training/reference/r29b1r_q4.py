"""Vectorised q4 unpacking and compact group-q4 experiment helpers for R29B1R."""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_current_q4(torch: Any, asset_dir: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    config = json.loads((asset_dir / "model.config.json").read_text(encoding="utf-8"))
    quant = json.loads((asset_dir / "quantization.manifest.json").read_text(encoding="utf-8"))
    raw = b""
    shards = []
    for entry in quant["shards"]:
        path = asset_dir / Path(entry["path"]).name if False else asset_dir / "shards" / Path(entry["path"]).name
        actual = {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
        actual["matches"] = actual["bytes"] == int(entry["bytes"]) and actual["sha256"] == entry["sha256"]
        shards.append(actual)
        raw += path.read_bytes()
    if not all(item["matches"] for item in shards):
        raise ValueError("current_q4_shard_integrity_failed")
    state: dict[str, Any] = {}
    for entry in config["tensors"]:
        offset, count, shape = int(entry["offset"]), int(entry["bytes"]), tuple(entry["shape"])
        block = memoryview(raw)[offset : offset + count]
        if len(block) != count:
            raise ValueError(f"q4_offset_out_of_range:{entry['name']}")
        encoded = entry["encoding"]
        if encoded == "q4_symmetric_per_tensor":
            bytes_tensor = torch.frombuffer(block, dtype=torch.uint8).clone()
            low = bytes_tensor & 0x0F
            high = (bytes_tensor >> 4) & 0x0F
            values = torch.stack([low, high], dim=1).reshape(-1)[: int(entry["numel"])]
            values = torch.where(values >= 8, values.to(torch.int16) - 16, values.to(torch.int16)).to(torch.float32)
            state[entry["name"]] = (values * float(entry["scale"])).reshape(shape)
        elif encoded == "bitpack_bool":
            bytes_tensor = torch.frombuffer(block, dtype=torch.uint8).clone()
            bits = ((bytes_tensor[:, None] >> torch.arange(8, dtype=torch.uint8)) & 1).reshape(-1)[: int(entry["numel"])]
            state[entry["name"]] = bits.to(torch.bool).reshape(shape)
        else:
            raise ValueError(f"unsupported_current_q4_encoding:{encoded}")
    return state, {"config": config, "quantization": quant, "shards": shards, "raw_bytes": len(raw)}


def _encode_tensor(torch: Any, tensor: Any, *, group_size: int, fp16: bool, int8: bool) -> tuple[bytes, dict[str, Any], Any]:
    flat = tensor.detach().cpu().reshape(-1).to(torch.float32)
    if tensor.dtype == torch.bool:
        padded = torch.nn.functional.pad(flat.to(torch.uint8), (0, (-flat.numel()) % 8))
        packed = (padded.reshape(-1, 8) * (2 ** torch.arange(8, dtype=torch.uint8))).sum(dim=1).to(torch.uint8)
        return packed.numpy().tobytes(), {"encoding": "bitpack_bool", "group_size": None, "quantized_bytes": packed.numel(), "scale_bytes": 0}, tensor.detach().cpu().clone()
    if fp16:
        decoded = flat.to(torch.float16).to(torch.float32).reshape(tensor.shape)
        return flat.to(torch.float16).numpy().tobytes(), {"encoding": "fp16", "group_size": None, "quantized_bytes": flat.numel() * 2, "scale_bytes": 0}, decoded
    levels = 127 if int8 else 7
    padded_count = (-flat.numel()) % group_size
    padded = torch.nn.functional.pad(flat, (0, padded_count))
    groups = padded.reshape(-1, group_size)
    scales = groups.abs().amax(dim=1).clamp_min(1e-8) / levels
    quantized = torch.round(groups / scales[:, None]).clamp(-levels, levels).to(torch.int8)
    decoded = (quantized.to(torch.float32) * scales[:, None]).reshape(-1)[: flat.numel()].reshape(tensor.shape)
    if int8:
        data = quantized.reshape(-1).numpy().tobytes()
        encoding = "int8_symmetric_groupwise"
    else:
        digits = quantized.reshape(-1).to(torch.int16)
        digits = torch.where(digits < 0, digits + 16, digits).to(torch.uint8)
        if digits.numel() % 2:
            digits = torch.cat([digits, torch.zeros(1, dtype=torch.uint8)])
        data = (digits[0::2] | (digits[1::2] << 4)).numpy().tobytes()
        encoding = "q4_symmetric_groupwise"
    scales_bytes = scales.to(torch.float16).numpy().tobytes()
    return data + scales_bytes, {"encoding": encoding, "group_size": group_size, "num_groups": int(scales.numel()), "quantized_bytes": len(data), "scale_bytes": len(scales_bytes)}, decoded


def export_group_q4(torch: Any, state: dict[str, Any], *, output_dir: Path, checkpoint_sha256: str, tokenizer_sha256: str, architecture_fingerprint: str, candidate_id: str, group_size: int, int8_embedding_head: bool = False) -> tuple[dict[str, Any], dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    blob = bytearray()
    tensors = []
    decoded: dict[str, Any] = {}
    for name, tensor in state.items():
        fp16 = name.startswith("pos_emb") or ".ln" in name or name.endswith(".bias")
        use_int8 = int8_embedding_head and (name == "token_emb.weight" or name == "lm_head.weight")
        data, detail, reconstruction = _encode_tensor(torch, tensor, group_size=group_size, fp16=fp16, int8=use_int8)
        offset = len(blob)
        blob.extend(data)
        decoded[name] = reconstruction
        tensors.append({"name": name, "shape": list(tensor.shape), "numel": int(tensor.numel()), "source_dtype": str(tensor.dtype), "runtime_dtype": "float32", "offset": offset, "bytes": len(data), "scale_offset": offset + int(detail["quantized_bytes"]), "alignment": 1, "tensor_sha256": hashlib.sha256(data).hexdigest(), **detail})
    shard = output_dir / "model-q4v2-00001.bin"
    shard.write_bytes(bytes(blob))
    manifest = {
        "schema_version": "r29b1r.q4v2.v1",
        "candidate_id": candidate_id,
        "checkpoint_sha256": checkpoint_sha256,
        "tokenizer_sha256": tokenizer_sha256,
        "architecture_fingerprint": architecture_fingerprint,
        "group_size": group_size,
        "shards": [{"path": shard.name, "bytes": shard.stat().st_size, "sha256": sha256(shard)}],
        "total_bytes": shard.stat().st_size,
        "tensors": tensors,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest, decoded


def unpack_group_q4(torch: Any, manifest_path: Path) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not validate_manifest(manifest_path)["ok"]:
        raise ValueError("q4v2_manifest_integrity_failed")
    shard = manifest_path.parent / manifest["shards"][0]["path"]
    raw = memoryview(shard.read_bytes())
    state: dict[str, Any] = {}
    for entry in manifest["tensors"]:
        offset, size = int(entry["offset"]), int(entry["bytes"])
        block = raw[offset : offset + size]
        if hashlib.sha256(block).hexdigest() != entry["tensor_sha256"]:
            raise ValueError(f"q4v2_tensor_checksum:{entry['name']}")
        shape, numel, encoding = tuple(entry["shape"]), int(entry["numel"]), entry["encoding"]
        if encoding == "bitpack_bool":
            values = torch.frombuffer(block, dtype=torch.uint8).clone()
            bits = ((values[:, None] >> torch.arange(8, dtype=torch.uint8)) & 1).reshape(-1)[:numel]
            state[entry["name"]] = bits.to(torch.bool).reshape(shape)
        elif encoding == "fp16":
            state[entry["name"]] = torch.frombuffer(block, dtype=torch.float16).clone().to(torch.float32).reshape(shape)
        else:
            quantized_bytes = int(entry["quantized_bytes"])
            scales = torch.frombuffer(block[quantized_bytes:], dtype=torch.float16).clone().to(torch.float32)
            if encoding == "int8_symmetric_groupwise":
                digits = torch.frombuffer(block[:quantized_bytes], dtype=torch.int8).clone().to(torch.float32)
            elif encoding == "q4_symmetric_groupwise":
                packed = torch.frombuffer(block[:quantized_bytes], dtype=torch.uint8).clone()
                digits = torch.stack([packed & 0x0F, (packed >> 4) & 0x0F], dim=1).reshape(-1)[: scales.numel() * int(entry["group_size"])]
                digits = torch.where(digits >= 8, digits.to(torch.int16) - 16, digits.to(torch.int16)).to(torch.float32)
            else:
                raise ValueError(f"unsupported_q4v2_encoding:{encoding}")
            decoded = (digits.reshape(-1, int(entry["group_size"])) * scales[:, None]).reshape(-1)[:numel]
            state[entry["name"]] = decoded.reshape(shape)
    return state


def validate_manifest(path: Path) -> dict[str, Any]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    root = path.parent
    spans = []
    errors = []
    for tensor in manifest.get("tensors", []):
        start, end = int(tensor.get("offset", -1)), int(tensor.get("offset", -1)) + int(tensor.get("bytes", -1))
        if start < 0 or end < start or end > int(manifest.get("total_bytes", -1)):
            errors.append(f"offset:{tensor.get('name')}")
        spans.append((start, end, tensor.get("name")))
    spans.sort()
    if any(left[1] > right[0] for left, right in zip(spans, spans[1:])):
        errors.append("overlapping_offsets")
    for shard in manifest.get("shards", []):
        file = root / shard["path"]
        if not file.exists() or file.stat().st_size != int(shard["bytes"]) or sha256(file) != shard["sha256"]:
            errors.append(f"shard:{shard['path']}")
    return {"ok": not errors, "errors": errors, "tensor_count": len(manifest.get("tensors", []))}
