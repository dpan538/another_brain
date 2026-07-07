"""R28M0 model asset packaging dry-run helpers.

This module intentionally writes all generated model bytes under ignored
artifacts/r28m0 paths. It is an admission decision aid, not a product/runtime
admission path.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from src.product_prelaunch.a12_handoff_intake import A12_WORKTREE as P0B_A12_WORKTREE
from src.product_prelaunch.a12_handoff_intake import ROOT, load_a12_handoff
from src.product_prelaunch.candidate_binding import is_same_origin_path

ARTIFACT_ROOT = ROOT / "artifacts" / "r28m0"
EXPORT_DIR = ARTIFACT_ROOT / "export"
QUANTIZED_DIR = ARTIFACT_ROOT / "quantized"
SHARDS_DIR = ARTIFACT_ROOT / "shards"
MANIFEST_DIR = ARTIFACT_ROOT / "manifests"
REPORT_DIR = ARTIFACT_ROOT / "reports"

A12_WORKTREE = Path(os.environ.get("R28M0_A12_WORKTREE", P0B_A12_WORKTREE.as_posix()))
MAX_STATIC_BYTES = 100_000_000
DEFAULT_TARGET_SHARD_MB = 12
MIN_TARGET_SHARD_BYTES = 8_000_000
MAX_TARGET_SHARD_BYTES = 16_000_000
PREFERRED_MAX_SHARD_BYTES = 25_000_000
WARNING_MAX_SHARD_BYTES = 50 * 1024 * 1024
HARD_MAX_SHARD_BYTES = 100 * 1024 * 1024
DEFAULT_TOKENIZER_BYTES_ESTIMATE = 4_000_000


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_rel(path: Path, root: Path = ROOT) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def load_intake() -> dict:
    return load_a12_handoff(root=ROOT, a12_worktree=A12_WORKTREE, synthetic_if_missing=True)


def checkpoint_path_from_intake(intake: dict) -> Path | None:
    value = intake.get("best_checkpoint_path")
    return Path(value) if value else None


def handoff_blockers(intake: dict) -> list[str]:
    blockers = list(intake.get("hard_blockers") or [])
    if not intake.get("handoff_exists") and not intake.get("summary_exists"):
        blockers.append("missing_handoff")
    if intake.get("handoff_status") != "product_path_engineering_candidate":
        blockers.append("not_product_path_engineering_candidate")
    checkpoint = checkpoint_path_from_intake(intake)
    if not checkpoint or not checkpoint.exists():
        blockers.append("missing_checkpoint")
    return sorted(set(blockers))


def _import_torch():
    import torch

    return torch


def _import_numpy():
    import numpy

    return numpy


def _json_safe(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return repr(value)


def _contains_tensor(value: Any, torch_module: Any) -> bool:
    if torch_module.is_tensor(value):
        return True
    if isinstance(value, Mapping):
        return any(_contains_tensor(item, torch_module) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_contains_tensor(item, torch_module) for item in value)
    return False


def _select_tensor_container(checkpoint: Any, torch_module: Any) -> Any:
    if isinstance(checkpoint, Mapping):
        for key in ("model_state_dict", "state_dict", "model", "module", "net"):
            value = checkpoint.get(key)
            if _contains_tensor(value, torch_module):
                return value
    return checkpoint


def iter_named_tensors(value: Any, prefix: str = "", torch_module: Any | None = None) -> Iterable[tuple[str, Any]]:
    torch_module = torch_module or _import_torch()
    if torch_module.is_tensor(value):
        yield prefix.rstrip(".") or "tensor", value
        return
    if isinstance(value, Mapping):
        for key, item in value.items():
            name = f"{prefix}{key}."
            yield from iter_named_tensors(item, name, torch_module)
        return
    if isinstance(value, (list, tuple)):
        for index, item in enumerate(value):
            name = f"{prefix}{index}."
            yield from iter_named_tensors(item, name, torch_module)


def load_checkpoint(path: Path) -> Any:
    torch = _import_torch()
    return torch.load(path, map_location="cpu", weights_only=False)


def tensor_inventory(checkpoint_path: Path) -> tuple[dict, Any]:
    torch = _import_torch()
    checkpoint = load_checkpoint(checkpoint_path)
    container = _select_tensor_container(checkpoint, torch)
    entries = []
    total_numel = 0
    tensor_bytes = 0
    floating_numel = 0
    bool_numel = 0
    non_float_numel = 0
    for name, tensor in iter_named_tensors(container, torch_module=torch):
        numel = int(tensor.numel())
        entry_bytes = int(numel * tensor.element_size())
        total_numel += numel
        tensor_bytes += entry_bytes
        if tensor.is_floating_point():
            floating_numel += numel
            family = "floating"
        elif tensor.dtype == torch.bool:
            bool_numel += numel
            family = "bool"
        else:
            non_float_numel += numel
            family = "non_float"
        entries.append(
            {
                "name": name,
                "shape": [int(dim) for dim in tensor.shape],
                "dtype": str(tensor.dtype).replace("torch.", ""),
                "numel": numel,
                "source_bytes": entry_bytes,
                "family": family,
            }
        )
    config = _json_safe(checkpoint.get("config")) if isinstance(checkpoint, Mapping) else None
    return (
        {
            "tensor_count": len(entries),
            "total_numel": total_numel,
            "source_tensor_bytes": tensor_bytes,
            "floating_numel": floating_numel,
            "bool_numel": bool_numel,
            "non_float_numel": non_float_numel,
            "tensors": entries,
            "config": config,
        },
        checkpoint,
    )


def export_a12_candidate(*, intake: dict | None = None, artifact_root: Path = ARTIFACT_ROOT) -> dict:
    intake = intake or load_intake()
    checkpoint_path = checkpoint_path_from_intake(intake)
    blockers = handoff_blockers(intake)
    report = {
        "ok": not blockers,
        "export_kind": "r28m0_checkpoint_inventory_no_weight_copy",
        "handoff_status": intake.get("handoff_status"),
        "handoff_used": {
            "handoff_source": intake.get("handoff_source"),
            "summary_source": intake.get("summary_source"),
            "finalizer_source": intake.get("finalizer_source"),
        },
        "selected_model": intake.get("selected_model"),
        "source_checkpoint": checkpoint_path.as_posix() if checkpoint_path else None,
        "source_checkpoint_exists": bool(checkpoint_path and checkpoint_path.exists()),
        "source_checkpoint_bytes": checkpoint_path.stat().st_size if checkpoint_path and checkpoint_path.exists() else 0,
        "weights_copied": False,
        "tokenizer_copied": False,
        "shards_written": False,
        "model_assets_committed": False,
        "tokenizer_assets_committed": False,
        "exported_assets_committed": False,
        "hard_blockers": blockers,
        "non_claims": {
            "training": False,
            "product_model": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "backend_inference": False,
            "external_llm_api": False,
        },
    }
    if not blockers and checkpoint_path:
        inventory, _ = tensor_inventory(checkpoint_path)
        report.update(inventory)
    write_json(artifact_root / "export" / "export_manifest.json", report)
    write_json(artifact_root / "reports" / "export_a12_candidate.json", report)
    return report


def _pack_float_q4(tensor: Any, fh: Any) -> dict:
    torch = _import_torch()
    numpy = _import_numpy()
    flat = tensor.detach().cpu().contiguous().view(-1).to(torch.float32)
    if flat.numel() == 0:
        return {"bytes": 0, "scale": 1.0, "max_abs": 0.0, "pad_nibbles": 0}
    max_abs = float(flat.abs().max().item())
    scale = max_abs / 7.0 if max_abs > 0 else 1.0
    q_signed = torch.round(flat / scale).clamp(-8, 7).to(torch.int16)
    q = (q_signed + 8).to(torch.uint8)
    pad_nibbles = int(q.numel() % 2)
    if pad_nibbles:
        q = torch.cat([q, torch.zeros(1, dtype=torch.uint8)])
    q_np = q.numpy()
    packed = (q_np[0::2] | (q_np[1::2] << 4)).astype(numpy.uint8, copy=False)
    payload = packed.tobytes()
    fh.write(payload)
    return {"bytes": len(payload), "scale": scale, "max_abs": max_abs, "pad_nibbles": pad_nibbles}


def _pack_bool_bits(tensor: Any, fh: Any) -> dict:
    numpy = _import_numpy()
    flat = tensor.detach().cpu().contiguous().view(-1).numpy().astype(numpy.uint8, copy=False)
    payload = numpy.packbits(flat, bitorder="little").tobytes()
    fh.write(payload)
    return {"bytes": len(payload), "bitorder": "little", "pad_bits": (8 - int(tensor.numel()) % 8) % 8}


def _write_raw_tensor(tensor: Any, fh: Any) -> dict:
    payload = tensor.detach().cpu().contiguous().numpy().tobytes()
    fh.write(payload)
    return {"bytes": len(payload)}


def quantize_q4(*, artifact_root: Path = ARTIFACT_ROOT, export_report: dict | None = None) -> dict:
    export_report = export_report or export_a12_candidate(artifact_root=artifact_root)
    out_path = artifact_root / "quantized" / "a12_new_96m_q4.bin"
    manifest_path = artifact_root / "quantized" / "q4_manifest.json"

    if not export_report.get("ok"):
        report = {
            "ok": False,
            "quantization_kind": "real_checkpoint_q4_dryrun",
            "decision": "no_go",
            "hard_blockers": export_report.get("hard_blockers", ["missing_handoff"]),
            "actual_quantized_assets_written": False,
            "quantized_path": out_path.as_posix(),
            "weights_committed": False,
            "tokenizer_copied": False,
            "non_claims": export_report.get("non_claims", {}),
        }
        write_json(manifest_path, report)
        write_json(artifact_root / "reports" / "quantize_q4.json", report)
        return report

    torch = _import_torch()
    checkpoint_path = Path(export_report["source_checkpoint"])
    checkpoint = load_checkpoint(checkpoint_path)
    container = _select_tensor_container(checkpoint, torch)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tensor_entries = []
    with out_path.open("wb") as fh:
        for name, tensor in iter_named_tensors(container, torch_module=torch):
            offset = fh.tell()
            if tensor.is_floating_point():
                packed = _pack_float_q4(tensor, fh)
                encoding = "q4_symmetric_per_tensor"
            elif tensor.dtype == torch.bool:
                packed = _pack_bool_bits(tensor, fh)
                encoding = "bitpack_bool"
            else:
                packed = _write_raw_tensor(tensor, fh)
                encoding = "raw_tensor_bytes"
            tensor_entries.append(
                {
                    "name": name,
                    "shape": [int(dim) for dim in tensor.shape],
                    "source_dtype": str(tensor.dtype).replace("torch.", ""),
                    "numel": int(tensor.numel()),
                    "encoding": encoding,
                    "offset": offset,
                    **packed,
                }
            )
    actual_bytes = out_path.stat().st_size
    report = {
        "ok": actual_bytes > 0,
        "quantization_kind": "real_checkpoint_q4_dryrun",
        "selected_model": export_report.get("selected_model"),
        "source_checkpoint": checkpoint_path.as_posix(),
        "source_checkpoint_bytes": export_report.get("source_checkpoint_bytes"),
        "quantized_path": out_path.as_posix(),
        "quantized_artifact_relpath": artifact_rel(out_path),
        "actual_quantized_bytes": actual_bytes,
        "sha256": sha256_file(out_path),
        "tensor_count": len(tensor_entries),
        "tensors": tensor_entries,
        "actual_quantized_assets_written": True,
        "weights_committed": False,
        "tokenizer_copied": False,
        "model_assets_committed": False,
        "non_claims": {
            "training": False,
            "product_model": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "backend_inference": False,
            "external_llm_api": False,
        },
    }
    write_json(manifest_path, report)
    write_json(artifact_root / "reports" / "quantize_q4.json", report)
    return report


def _target_shard_bytes(target_shard_mb: int) -> int:
    return int(target_shard_mb) * 1_000_000


def _shard_warnings(max_shard_bytes: int, target_shard_bytes: int) -> list[str]:
    warnings = []
    if target_shard_bytes < MIN_TARGET_SHARD_BYTES or target_shard_bytes > MAX_TARGET_SHARD_BYTES:
        warnings.append("target_shard_size_outside_8mb_16mb_range")
    if max_shard_bytes > PREFERRED_MAX_SHARD_BYTES:
        warnings.append("shard_over_25mb_preferred_limit")
    if max_shard_bytes > WARNING_MAX_SHARD_BYTES:
        warnings.append("shard_over_50mib_warning_limit")
    return warnings


def _shard_hard_violations(max_shard_bytes: int) -> list[str]:
    return ["shard_over_100mib_hard_limit"] if max_shard_bytes > HARD_MAX_SHARD_BYTES else []


def write_shards(*, target_shard_mb: int = DEFAULT_TARGET_SHARD_MB, artifact_root: Path = ARTIFACT_ROOT) -> dict:
    quant_manifest_path = artifact_root / "quantized" / "q4_manifest.json"
    manifest_path = artifact_root / "manifests" / "same_origin_shards.json"
    if not quant_manifest_path.exists():
        report = {
            "ok": False,
            "hard_blockers": ["missing_quantized_manifest"],
            "shards_written": False,
            "model_assets_committed": False,
        }
        write_json(manifest_path, report)
        write_json(artifact_root / "reports" / "write_shards.json", report)
        return report

    quant_manifest = read_json(quant_manifest_path)
    quant_path = Path(quant_manifest.get("quantized_path", ""))
    if not quant_manifest.get("ok") or not quant_path.exists():
        report = {
            "ok": False,
            "hard_blockers": ["missing_quantized_artifact"],
            "shards_written": False,
            "model_assets_committed": False,
            "quantized_manifest": quant_manifest,
        }
        write_json(manifest_path, report)
        write_json(artifact_root / "reports" / "write_shards.json", report)
        return report

    target_bytes = _target_shard_bytes(target_shard_mb)
    shard_dir = artifact_root / "shards"
    shard_dir.mkdir(parents=True, exist_ok=True)
    for old in shard_dir.glob("a12_new_96m_q4_shard_*.bin"):
        old.unlink()

    shards = []
    offset = 0
    index = 0
    with quant_path.open("rb") as src:
        while True:
            chunk = src.read(target_bytes)
            if not chunk:
                break
            shard_name = f"a12_new_96m_q4_shard_{index:05d}.bin"
            shard_path = shard_dir / shard_name
            shard_path.write_bytes(chunk)
            shard_bytes = shard_path.stat().st_size
            same_origin_path = f"another_brain/model_assets/r28m0/new_96m/q4/{shard_name}"
            shards.append(
                {
                    "index": index,
                    "artifact_path": shard_path.as_posix(),
                    "artifact_relpath": artifact_rel(shard_path),
                    "same_origin_path": same_origin_path,
                    "bytes": shard_bytes,
                    "offset": offset,
                    "sha256": sha256_file(shard_path),
                }
            )
            offset += shard_bytes
            index += 1

    total_bytes = sum(int(shard["bytes"]) for shard in shards)
    max_shard_bytes = max((int(shard["bytes"]) for shard in shards), default=0)
    hard_violations = _shard_hard_violations(max_shard_bytes)
    warnings = _shard_warnings(max_shard_bytes, target_bytes)
    same_origin_ok = all(is_same_origin_path(shard["same_origin_path"]) for shard in shards)
    report = {
        "ok": bool(shards) and not hard_violations and same_origin_ok and total_bytes == int(quant_manifest["actual_quantized_bytes"]),
        "manifest_version": "r28m0-same-origin-shards-v1",
        "selected_model": quant_manifest.get("selected_model"),
        "quantized_sha256": quant_manifest.get("sha256"),
        "quantized_bytes": int(quant_manifest["actual_quantized_bytes"]),
        "target_shard_mb": int(target_shard_mb),
        "target_shard_bytes": target_bytes,
        "shard_count": len(shards),
        "shard_total_bytes": total_bytes,
        "max_shard_bytes": max_shard_bytes,
        "preferred_max_shard_bytes": PREFERRED_MAX_SHARD_BYTES,
        "warning_max_shard_bytes": WARNING_MAX_SHARD_BYTES,
        "hard_max_shard_bytes": HARD_MAX_SHARD_BYTES,
        "warnings": warnings,
        "hard_violations": hard_violations,
        "same_origin_paths": same_origin_ok,
        "shards": shards,
        "shards_written": True,
        "model_assets_committed": False,
        "tokenizer_assets_committed": False,
        "non_claims": {
            "product_model": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "backend_inference": False,
            "external_llm_api": False,
        },
    }
    write_json(manifest_path, report)
    write_json(artifact_root / "reports" / "write_shards.json", report)
    return report


def loader_smoke(*, artifact_root: Path = ARTIFACT_ROOT) -> dict:
    manifest_path = artifact_root / "manifests" / "same_origin_shards.json"
    failures = []
    warnings = []
    checked = []
    if not manifest_path.exists():
        failures.append("missing_same_origin_shard_manifest")
        manifest = {}
    else:
        manifest = read_json(manifest_path)
        warnings.extend(manifest.get("warnings") or [])

    total_bytes = 0
    max_shard_bytes = 0
    for shard in manifest.get("shards", []):
        same_origin_path = shard.get("same_origin_path", "")
        artifact_path = Path(shard.get("artifact_path", ""))
        if not is_same_origin_path(same_origin_path):
            failures.append(f"not_same_origin:{same_origin_path}")
        if not artifact_path.exists():
            failures.append(f"missing_shard:{artifact_path.as_posix()}")
            continue
        actual_bytes = artifact_path.stat().st_size
        expected_bytes = int(shard.get("bytes", -1))
        if actual_bytes != expected_bytes:
            failures.append(f"shard_size_mismatch:{artifact_path.name}")
        actual_sha = sha256_file(artifact_path)
        if actual_sha != shard.get("sha256"):
            failures.append(f"shard_sha256_mismatch:{artifact_path.name}")
        total_bytes += actual_bytes
        max_shard_bytes = max(max_shard_bytes, actual_bytes)
        checked.append(same_origin_path)

    if total_bytes != int(manifest.get("quantized_bytes", -1)):
        failures.append("shard_total_bytes_mismatch")
    hard_violations = _shard_hard_violations(max_shard_bytes)
    failures.extend(hard_violations)
    report = {
        "ok": not failures and bool(checked),
        "loader_smoke": "passed" if not failures and checked else "failed",
        "same_origin_dryrun_local_load": bool(checked),
        "actual_browser_load": False,
        "manifest_path": manifest_path.as_posix(),
        "shard_count": len(checked),
        "shard_total_bytes": total_bytes,
        "max_shard_bytes": max_shard_bytes,
        "checked_same_origin_paths": checked,
        "warnings": sorted(set(warnings)),
        "failures": failures,
        "model_assets_committed": False,
        "tokenizer_assets_committed": False,
        "non_claims": {
            "product_model": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "backend_inference": False,
            "external_llm_api": False,
        },
    }
    write_json(artifact_root / "reports" / "loader_smoke.json", report)
    return report


def current_static_bundle_report() -> dict:
    try:
        from scripts.r28b9_bundle_size_breakdown import build_breakdown

        breakdown = build_breakdown()
        return {
            "source": "r28b9_bundle_size_breakdown",
            "bundle_bytes": int(breakdown["after"]["bundle_bytes"]),
            "report": breakdown,
        }
    except Exception as exc:
        from scripts.r27b4_bundle_report import make_bundle_report

        fallback = make_bundle_report()
        return {
            "source": f"r27b4_bundle_report_fallback:{type(exc).__name__}",
            "bundle_bytes": int(fallback["build_output_bytes"]),
            "report": fallback,
        }


def _manifest_bytes(artifact_root: Path) -> dict:
    paths = [
        artifact_root / "quantized" / "q4_manifest.json",
        artifact_root / "manifests" / "same_origin_shards.json",
    ]
    entries = [{"path": path.as_posix(), "bytes": path.stat().st_size} for path in paths if path.exists()]
    return {"manifest_bytes": sum(item["bytes"] for item in entries), "manifest_files": entries}


def admission_label(report: dict) -> str:
    if report.get("missing_handoff"):
        return "missing_handoff"
    if report.get("safety_blocker"):
        return "safety_blocker"
    if report.get("candidate_route") != "product_path_engineering_candidate":
        return "research_only"
    if not report.get("loader_smoke_passed"):
        return "loader_smoke_failed"
    if int(report.get("margin_bytes", -1)) < 0:
        return "over_budget"
    return "ready_for_explicit_asset_commit_approval"


def budget_report(*, artifact_root: Path = ARTIFACT_ROOT) -> dict:
    intake = load_intake()
    quant_path = artifact_root / "quantized" / "q4_manifest.json"
    shard_path = artifact_root / "manifests" / "same_origin_shards.json"
    smoke_path = artifact_root / "reports" / "loader_smoke.json"
    quant = read_json(quant_path) if quant_path.exists() else {}
    shards = read_json(shard_path) if shard_path.exists() else {}
    smoke = read_json(smoke_path) if smoke_path.exists() else {}
    static_bundle = current_static_bundle_report()
    manifests = _manifest_bytes(artifact_root)
    tokenizer_estimate = int((intake.get("budget_row") or {}).get("tokenizer_bytes_estimate", DEFAULT_TOKENIZER_BYTES_ESTIMATE))
    actual_quantized_bytes = int(quant.get("actual_quantized_bytes", 0) or 0)
    actual_shard_bytes = int(shards.get("shard_total_bytes", 0) or 0)
    full_bundle_bytes = (
        int(static_bundle["bundle_bytes"]) + actual_shard_bytes + int(manifests["manifest_bytes"]) + tokenizer_estimate
    )
    margin = MAX_STATIC_BYTES - full_bundle_bytes
    missing_handoff = "missing_handoff" in handoff_blockers(intake)
    safety_blocker = bool(shards.get("hard_violations")) or intake.get("safety_guard") not in {None, "clean"}
    report = {
        "ok": True,
        "candidate_route": intake.get("handoff_status"),
        "selected_model": intake.get("selected_model"),
        "handoff_used": {
            "handoff_source": intake.get("handoff_source"),
            "summary_source": intake.get("summary_source"),
            "finalizer_source": intake.get("finalizer_source"),
        },
        "actual_quantized_bytes": actual_quantized_bytes,
        "actual_shard_bytes": actual_shard_bytes,
        "manifest_bytes": int(manifests["manifest_bytes"]),
        "manifest_files": manifests["manifest_files"],
        "estimated_tokenizer_bytes": tokenizer_estimate,
        "current_static_bundle_bytes": int(static_bundle["bundle_bytes"]),
        "static_bundle_source": static_bundle["source"],
        "total_full_bundle_bytes": full_bundle_bytes,
        "margin_bytes": margin,
        "product_path_possible": (
            not missing_handoff
            and not safety_blocker
            and smoke.get("ok") is True
            and margin >= 0
            and intake.get("handoff_status") == "product_path_engineering_candidate"
        ),
        "loader_smoke_passed": smoke.get("ok") is True,
        "shard_count": int(shards.get("shard_count", 0) or 0),
        "max_shard_bytes": int(shards.get("max_shard_bytes", 0) or 0),
        "missing_handoff": missing_handoff,
        "safety_blocker": safety_blocker,
        "admission_decision": None,
        "r28m1_asset_commit_approval_recommended": None,
        "a12_original_full_static_estimate_bytes": int(
            (intake.get("budget_row") or {}).get("full_static_bundle_estimate_bytes", 0) or 0
        ),
        "a12_original_margin_bytes": int((intake.get("budget_row") or {}).get("remaining_bytes_under_100mb", 0) or 0),
        "model_assets_committed": False,
        "tokenizer_assets_committed": False,
        "shards_committed": False,
        "non_claims": {
            "training": False,
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "backend_inference": False,
            "external_llm_api": False,
        },
    }
    label = admission_label(report)
    report["admission_decision"] = label
    report["r28m1_asset_commit_approval_recommended"] = label == "ready_for_explicit_asset_commit_approval"
    write_json(artifact_root / "reports" / "budget_report.json", report)
    write_json(artifact_root / "reports" / "admission_decision.json", report)
    return report


def parse_target_shard_mb(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-shard-mb", type=int, default=DEFAULT_TARGET_SHARD_MB)
    args = parser.parse_args(argv)
    return args.target_shard_mb
