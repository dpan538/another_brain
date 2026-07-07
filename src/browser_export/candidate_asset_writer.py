from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from .export_manifest import sha256_file
from .quantize import estimate_quantization
from .shard_writer import write_static_shards


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_ROOT = ROOT / "artifacts" / "r27b2"
EXPORT_DIR = ARTIFACT_ROOT / "candidate_export"
QUANTIZED_DIR = ARTIFACT_ROOT / "candidate_quantized"
SHARD_DIR = ARTIFACT_ROOT / "candidate_shards"
MANIFEST_DIR = ARTIFACT_ROOT / "manifests"
MAX_TOTAL_STATIC_BYTES = 100_000_000
MODEL_WEIGHT_BUDGET_BYTES = 70_000_000
TOKENIZER_BUDGET_BYTES = 5_000_000
RUNTIME_UI_RAG_GATE_BYTES = 25_000_000


def ensure_artifact_dirs() -> None:
    for path in (EXPORT_DIR, QUANTIZED_DIR, SHARD_DIR, MANIFEST_DIR):
        path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_export_report(reconstruction: dict[str, Any]) -> dict[str, Any]:
    ensure_artifact_dirs()
    report = {
        "schema_version": "r27b2.candidate_export.v1",
        "candidate_id": reconstruction.get("candidate_id", "r27b2_candidate"),
        "product_model": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "source_checkpoint": reconstruction.get("source_checkpoint", ""),
        "source_kind": reconstruction.get("source_kind", ""),
        "model_config": reconstruction.get("model_config", {}),
        "params": int(reconstruction.get("params", 0)),
        "tensor_count": int(reconstruction.get("tensor_count", 0)),
        "tensors": reconstruction.get("tensors", []),
        "state_dict_loaded": bool(reconstruction.get("state_dict_loaded")),
        "blockers": reconstruction.get("blockers", []),
        "weights_committed": False,
        "tokenizer_committed": False,
    }
    write_json(EXPORT_DIR / "export_manifest.json", report)
    return report


def load_export_report() -> dict[str, Any]:
    return read_json(EXPORT_DIR / "export_manifest.json")


def write_quantization_report(export_report: dict[str, Any], quant: str = "q4") -> dict[str, Any]:
    ensure_artifact_dirs()
    plan = estimate_quantization(
        int(export_report.get("params", 0)),
        quant,
        tensor_count=max(1, int(export_report.get("tensor_count", 1))),
    ).to_dict()
    label = "q4_experimental" if plan["quantization"] in {"q4", "int4"} else f"{plan['quantization']}_experimental"
    report = {
        "schema_version": "r27b2.candidate_quantization.v1",
        "candidate_id": export_report.get("candidate_id", "r27b2_candidate"),
        "product_model": False,
        "browser_admission": False,
        "quantization": label,
        "quantization_plan": plan,
        "model_config": export_report.get("model_config", {}),
        "params": int(export_report.get("params", 0)),
        "weights_committed": False,
        "tokenizer_committed": False,
        "blockers": export_report.get("blockers", []),
    }
    write_json(QUANTIZED_DIR / "quantization_manifest.json", report)
    return report


def load_quantization_report() -> dict[str, Any]:
    return read_json(QUANTIZED_DIR / "quantization_manifest.json")


def write_candidate_static_manifest(export_report: dict[str, Any], quantization_report: dict[str, Any]) -> dict[str, Any]:
    ensure_artifact_dirs()
    if SHARD_DIR.exists():
        for path in SHARD_DIR.glob("tensor-*.bin"):
            path.unlink()
    shard_manifest = write_static_shards(
        output_dir=SHARD_DIR,
        tensors=export_report.get("tensors", []),
        config={
            **dict(export_report.get("model_config") or {}),
            "candidate_id": export_report.get("candidate_id", ""),
            "source_checkpoint": export_report.get("source_checkpoint", ""),
            "product_model": False,
            "browser_admission": False,
        },
        quantization=quantization_report,
        shard_prefix="tensor",
    )
    manifest = {
        "schema_version": "r27b2.candidate_static_manifest.v1",
        "candidate_id": export_report.get("candidate_id", "r27b2_candidate"),
        "product_model": False,
        "browser_admission": False,
        "same_origin_only": True,
        "backend_inference": False,
        "external_runtime_dependency": False,
        "runtime_mode": "static_shard_manifest_experimental",
        "model_config": export_report.get("model_config", {}),
        "params": int(export_report.get("params", 0)),
        "quantization": quantization_report.get("quantization", "q4_experimental"),
        "shards": shard_manifest["tensor_shards"],
        "tensor_shards": shard_manifest["tensor_shards"],
        "sha256": {item["path"]: item["sha256"] for item in shard_manifest["tensor_shards"]},
        "total_bytes": int(shard_manifest["total_shard_bytes"]),
        "total_shard_bytes": int(shard_manifest["total_shard_bytes"]),
        "budget_bytes": MAX_TOTAL_STATIC_BYTES,
        "budget": {
            "max_total_static_bytes": MAX_TOTAL_STATIC_BYTES,
            "model_weight_budget_bytes": MODEL_WEIGHT_BUDGET_BYTES,
            "tokenizer_budget_bytes": TOKENIZER_BUDGET_BYTES,
            "runtime_ui_rag_gate_budget_bytes": RUNTIME_UI_RAG_GATE_BYTES,
        },
        "weights_committed": False,
        "tokenizer_committed": False,
        "source_handoff": export_report.get("source_checkpoint", ""),
        "source_checkpoint": export_report.get("source_checkpoint", ""),
        "blockers": export_report.get("blockers", []),
    }
    manifest_path = MANIFEST_DIR / "candidate_static_manifest.json"
    write_json(manifest_path, manifest)
    shutil.copy2(manifest_path, SHARD_DIR / "candidate_static_manifest.json")
    manifest["manifest_path"] = str(manifest_path.relative_to(ROOT))
    manifest["manifest_sha256"] = sha256_file(manifest_path)
    write_json(manifest_path, manifest)
    shutil.copy2(manifest_path, SHARD_DIR / "candidate_static_manifest.json")
    return manifest


def load_candidate_static_manifest() -> dict[str, Any]:
    return read_json(MANIFEST_DIR / "candidate_static_manifest.json")
