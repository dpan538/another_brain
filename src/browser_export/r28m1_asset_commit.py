from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from src.product_prelaunch import r28m0_dryrun
from src.product_prelaunch.a12_handoff_intake import A12_WORKTREE as DEFAULT_A12_WORKTREE
from src.product_prelaunch.a12_handoff_intake import load_a12_handoff
from src.product_prelaunch.candidate_binding import is_same_origin_path


ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = ROOT / "web"
STATIC_ROOT = WEB_ROOT / "another_brain"
ASSET_ROOT = STATIC_ROOT / "model_assets" / "r28m1"
SHARD_ROOT = ASSET_ROOT / "shards"
TOKENIZER_ROOT = ASSET_ROOT / "tokenizer"
ARTIFACT_ROOT = ROOT / "artifacts" / "r28m1"
REPORT_ROOT = ARTIFACT_ROOT / "reports"
APPROVAL_PATH = ROOT / "data" / "training_registry" / "r28m1_static_asset_commit_approval.json"
ASSET_MANIFEST_PATH = STATIC_ROOT / "asset_manifest.json"
RUNTIME_MODE_PATH = STATIC_ROOT / "runtime_mode.json"
STATIC_LLM_R28M1_MANIFEST = ROOT / "static_llm" / "manifests" / "r28m1_new_96m_q4.admitted.json"
MAX_TOTAL_STATIC_BYTES = 100_000_000
PREFERRED_MARGIN_BYTES = 10_000_000
PREFERRED_MAX_SHARD_BYTES = 25_000_000
WARNING_MAX_SHARD_BYTES = 50 * 1024 * 1024
HARD_MAX_SHARD_BYTES = 100 * 1024 * 1024
ALLOWED_MODEL_ROUTE = "r28m1_static_q4_engineering_candidate"
ALLOWED_SOURCE = "r27a12_new_96m"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def repo_rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def web_rel(path: Path) -> str:
    return path.relative_to(WEB_ROOT).as_posix()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_target_shard_mb(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-shard-mb", type=int, default=12)
    return parser.parse_args(argv).target_shard_mb


def _a12_worktree() -> Path:
    return Path(os.environ.get("R28M1_A12_WORKTREE", DEFAULT_A12_WORKTREE.as_posix()))


def _source_lineage(intake: dict[str, Any]) -> dict[str, Any]:
    checkpoint = Path(str(intake.get("best_checkpoint_path") or ""))
    try:
        checkpoint_rel = checkpoint.relative_to(_a12_worktree()).as_posix()
    except ValueError:
        checkpoint_rel = "artifacts/r27a12/model_lab/checkpoints/r27a12_budgetfit_product_path_training_v1_seg10_chinese_general.pt"
    return {
        "candidate_source": ALLOWED_SOURCE,
        "campaign_id": intake.get("campaign_id"),
        "handoff_relpath": "artifacts/r27a12/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json",
        "checkpoint_relpath": checkpoint_rel,
        "checkpoint_bytes": checkpoint.stat().st_size if checkpoint.exists() else 0,
        "selected_checkpoint": intake.get("selected_checkpoint"),
        "selected_model": intake.get("selected_model"),
        "safety_guard": intake.get("safety_guard"),
        "rag_honesty": intake.get("rag_honesty"),
        "dialogue_readiness": intake.get("dialogue_readiness"),
        "product_model_admission": False,
        "browser_admission": False,
        "release_checkpoint_admission": False,
        "phase_4": False,
    }


def check_asset_commit_approval(path: Path = APPROVAL_PATH) -> dict[str, Any]:
    failures: list[str] = []
    if not path.exists():
        return {"ok": False, "approval_detected": False, "failures": ["approval_metadata_missing"], "path": path.as_posix()}
    approval = read_json(path)
    if approval.get("approval_marker") != "R28M1_STATIC_MODEL_ASSET_COMMIT_ALLOWED":
        failures.append("approval_marker_mismatch")
    if approval.get("approved") is not True:
        failures.append("approval_not_true")
    scope = approval.get("scope") or {}
    required_scope = {
        "a12_new_96m_q4_static_shards",
        "runtime_tokenizer_asset",
        "model_config",
        "quantization_manifest",
        "shard_checksum_manifest",
        "asset_manifest_metadata",
        "tests_docs_scripts",
    }
    for key in required_scope:
        if scope.get(key) is not True:
            failures.append(f"scope_missing:{key}")
    forbidden_scope = {
        "raw_checkpoint",
        "unquantized_weights",
        "optimizer_state",
        "training_artifacts",
        "training_corpus",
        "future_models",
        "product_admission",
        "browser_admission",
        "release_checkpoint_admission",
        "phase_4",
    }
    for key in forbidden_scope:
        if scope.get(key) is not False:
            failures.append(f"forbidden_scope_not_false:{key}")
    exclusions = approval.get("exclusions") or {}
    for key in forbidden_scope:
        if exclusions.get(key) is not True:
            failures.append(f"exclusion_missing:{key}")
    return {
        "ok": not failures,
        "approval_detected": not failures,
        "path": path.as_posix(),
        "scope": scope,
        "approval": approval,
        "failures": failures,
    }


def discover_handoff() -> dict[str, Any]:
    intake = load_a12_handoff(root=ROOT, a12_worktree=_a12_worktree(), synthetic_if_missing=False)
    failures = list(intake.get("hard_blockers") or [])
    if intake.get("handoff_status") != "product_path_engineering_candidate":
        failures.append("handoff_not_product_path_engineering_candidate")
    if intake.get("selected_model") != "new_96m":
        failures.append("selected_model_not_new_96m")
    if intake.get("best_checkpoint_exists") is not True:
        failures.append("source_checkpoint_missing")
    if intake.get("safety_guard") != "clean":
        failures.append("safety_guard_not_clean")
    if intake.get("non_claims", {}).get("phase_4") is not False:
        failures.append("phase_4_not_false")
    report = {
        **intake,
        "ok": not failures,
        "candidate_source": ALLOWED_SOURCE,
        "approval_required_for_asset_commit": True,
        "failures": sorted(set(failures)),
        "non_claims": {
            "training": False,
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint_admission": False,
            "phase_4": False,
        },
    }
    write_json(REPORT_ROOT / "discover_handoff.json", report)
    return report


def _require_approval() -> dict[str, Any]:
    approval = check_asset_commit_approval()
    if not approval["ok"]:
        write_json(REPORT_ROOT / "asset_commit_approval.json", approval)
        raise RuntimeError("r28m1_asset_commit_approval_missing_or_invalid")
    write_json(REPORT_ROOT / "asset_commit_approval.json", approval)
    return approval


def export_candidate() -> dict[str, Any]:
    _require_approval()
    intake = discover_handoff()
    report = r28m0_dryrun.export_a12_candidate(intake=intake, artifact_root=ARTIFACT_ROOT)
    report["export_kind"] = "r28m1_checkpoint_inventory_no_weight_copy"
    report["approval_detected"] = True
    report["model_assets_committed"] = False
    write_json(REPORT_ROOT / "export_candidate.json", report)
    return report


def quantize_q4() -> dict[str, Any]:
    _require_approval()
    export_report = r28m0_dryrun.export_a12_candidate(intake=discover_handoff(), artifact_root=ARTIFACT_ROOT)
    report = r28m0_dryrun.quantize_q4(artifact_root=ARTIFACT_ROOT, export_report=export_report)
    report["quantization_stage"] = "r28m1_ignored_q4_generation"
    write_json(REPORT_ROOT / "quantize_q4.json", report)
    return report


def _clean_static_asset_root() -> None:
    if ASSET_ROOT.exists():
        shutil.rmtree(ASSET_ROOT)
    SHARD_ROOT.mkdir(parents=True, exist_ok=True)
    TOKENIZER_ROOT.mkdir(parents=True, exist_ok=True)


def _load_quant_manifest() -> dict[str, Any]:
    return read_json(ARTIFACT_ROOT / "quantized" / "q4_manifest.json")


def _load_shard_manifest() -> dict[str, Any]:
    return read_json(ARTIFACT_ROOT / "manifests" / "same_origin_shards.json")


def _model_config_from_quant(quant: dict[str, Any], intake: dict[str, Any]) -> dict[str, Any]:
    config = {}
    export_manifest = ARTIFACT_ROOT / "export" / "export_manifest.json"
    if export_manifest.exists():
        config = read_json(export_manifest).get("config") or {}
    first_tensor = next((item for item in quant.get("tensors", []) if item.get("name") == "token_emb.weight"), {})
    vocab_size = int((first_tensor.get("shape") or [0])[0] or 0)
    return {
        "schema_version": "r28m1.model_config.v1",
        "model_id": "r27a12_new_96m_q4_engineering_candidate",
        "model_route": ALLOWED_MODEL_ROUTE,
        "candidate_source": ALLOWED_SOURCE,
        "selected_model": "new_96m",
        "model_assets_admitted": True,
        "product_model_admission": False,
        "browser_admission": False,
        "release_checkpoint_admission": False,
        "backend_inference": False,
        "external_llm_api": False,
        "doubao": False,
        "hosted_vector_store": False,
        "quantization": "q4",
        "architecture": {
            "model_size": config.get("model_size"),
            "context_length": int(config.get("context_length", 0) or 0),
            "n_layer": int(config.get("n_layer", 0) or 0),
            "n_head": int(config.get("n_head", 0) or 0),
            "n_embd": int(config.get("n_embd", 0) or 0),
            "vocab_size": vocab_size,
        },
        "tensor_count": int(quant.get("tensor_count", 0) or 0),
        "tensors": quant.get("tensors", []),
        "source_lineage": _source_lineage(intake),
        "non_claims": {
            "not_product_model": True,
            "not_product_admission": True,
            "not_browser_admission": True,
            "not_release_checkpoint": True,
            "no_backend_inference": True,
            "no_external_llm_api": True,
            "no_doubao": True,
            "no_hosted_vector_store": True,
            "no_raw_checkpoint_committed": True,
            "no_training_corpus_committed": True,
        },
    }


def _write_checksums(extra_files: list[Path] | None = None) -> dict[str, Any]:
    paths = [
        ASSET_ROOT / "model.config.json",
        ASSET_ROOT / "quantization.manifest.json",
        *(sorted(SHARD_ROOT.glob("model-q4-*.bin"))),
        *(extra_files or []),
    ]
    entries = []
    for path in paths:
        if not path.exists():
            continue
        entries.append({"path": web_rel(path), "bytes": path.stat().st_size, "sha256": sha256_file(path)})
    payload = {
        "schema_version": "r28m1.checksums.v1",
        "same_origin_only": True,
        "files": entries,
        "file_count": len(entries),
        "total_bytes": sum(int(item["bytes"]) for item in entries),
    }
    write_json(ASSET_ROOT / "checksums.sha256.json", payload)
    return payload


def _asset_entry(path: Path, role: str, **extra: Any) -> dict[str, Any]:
    return {"path": web_rel(path), "role": role, "bytes": path.stat().st_size, "sha256": sha256_file(path), **extra}


def _refresh_manifest_entries(entries: list[Any]) -> list[Any]:
    refreshed = []
    for item in entries:
        if not isinstance(item, dict):
            refreshed.append(item)
            continue
        path = WEB_ROOT / str(item.get("path", ""))
        if path.exists() and path.is_file():
            refreshed.append({**item, "bytes": path.stat().st_size, "sha256": sha256_file(path)})
        else:
            refreshed.append(item)
    return refreshed


def write_static_shards(target_shard_mb: int = 12) -> dict[str, Any]:
    _require_approval()
    intake = discover_handoff()
    shard_report = r28m0_dryrun.write_shards(target_shard_mb=target_shard_mb, artifact_root=ARTIFACT_ROOT)
    if not shard_report.get("ok"):
        write_json(REPORT_ROOT / "write_static_shards.json", shard_report)
        return shard_report

    quant = _load_quant_manifest()
    _clean_static_asset_root()
    committed_shards = []
    for source in shard_report["shards"]:
        index = int(source["index"]) + 1
        destination = SHARD_ROOT / f"model-q4-{index:05d}.bin"
        shutil.copy2(source["artifact_path"], destination)
        committed_shards.append(
            {
                "index": index,
                "path": web_rel(destination),
                "bytes": destination.stat().st_size,
                "offset": int(source["offset"]),
                "sha256": sha256_file(destination),
            }
        )

    model_config = _model_config_from_quant(quant, intake)
    write_json(ASSET_ROOT / "model.config.json", model_config)
    quantization_manifest = {
        "schema_version": "r28m1.quantization_manifest.v1",
        "model_route": ALLOWED_MODEL_ROUTE,
        "candidate_source": ALLOWED_SOURCE,
        "selected_model": "new_96m",
        "quantization": "q4",
        "quantization_kind": "q4_symmetric_per_tensor_with_bool_bitpack",
        "quantized_bytes": int(quant.get("actual_quantized_bytes", 0) or 0),
        "quantized_sha256": quant.get("sha256"),
        "shard_count": len(committed_shards),
        "shard_total_bytes": sum(int(item["bytes"]) for item in committed_shards),
        "max_shard_bytes": max((int(item["bytes"]) for item in committed_shards), default=0),
        "same_origin_only": True,
        "shards": committed_shards,
        "source_lineage": _source_lineage(intake),
        "product_model_admission": False,
        "browser_admission": False,
        "release_checkpoint_admission": False,
        "backend_inference": False,
        "external_llm_api": False,
        "doubao": False,
        "hosted_vector_store": False,
    }
    write_json(ASSET_ROOT / "quantization.manifest.json", quantization_manifest)
    checksums = _write_checksums()
    report = {
        "ok": True,
        "model_assets_committed_to_worktree": True,
        "target_shard_mb": target_shard_mb,
        "shard_count": len(committed_shards),
        "total_model_asset_bytes": quantization_manifest["shard_total_bytes"],
        "max_shard_bytes": quantization_manifest["max_shard_bytes"],
        "quantized_sha256": quantization_manifest["quantized_sha256"],
        "static_asset_root": repo_rel(ASSET_ROOT),
        "committed_shards": committed_shards,
        "checksums": checksums,
        "non_claims": model_config["non_claims"],
    }
    write_json(REPORT_ROOT / "write_static_shards.json", report)
    return report


def _read_model_config() -> dict[str, Any]:
    return read_json(ASSET_ROOT / "model.config.json")


def _read_quantization_manifest() -> dict[str, Any]:
    return read_json(ASSET_ROOT / "quantization.manifest.json")


def prepare_tokenizer_asset() -> dict[str, Any]:
    _require_approval()
    model_config = _read_model_config()
    tokenizer = {
        "schema_version": "r28m1.runtime_tokenizer_metadata.v1",
        "tokenizer_kind": "runtime_lineage_metadata",
        "candidate_source": ALLOWED_SOURCE,
        "selected_model": "new_96m",
        "runtime_compatible": False,
        "browser_inference_ready": False,
        "reason": "A12 handoff did not include a commit-safe tokenizer.json; R28M1 commits lineage/runtime metadata only and blocks inference admission.",
        "vocab_size": int(model_config.get("architecture", {}).get("vocab_size", 0) or 0),
        "context_length": int(model_config.get("architecture", {}).get("context_length", 0) or 0),
        "tokenizer_lineage": {
            "family": "r27a4_or_r27a5_chinese_aware_bpe_16000_lineage",
            "training_artifact_committed": False,
            "tokenizer_training_artifact_committed": False,
            "raw_or_clean_corpus_committed": False,
        },
        "special_tokens": {
            "pad": "<pad>",
            "bos": "<bos>",
            "eos": "<eos>",
            "unk": "<unk>",
        },
        "non_claims": {
            "not_product_tokenizer": True,
            "not_browser_inference_admission": True,
            "no_tokenizer_training_artifact_committed": True,
        },
    }
    TOKENIZER_ROOT.mkdir(parents=True, exist_ok=True)
    tokenizer_path = TOKENIZER_ROOT / "tokenizer.json"
    write_json(tokenizer_path, tokenizer)
    runtime_mode = update_runtime_mode()
    checksums = _write_checksums([tokenizer_path])
    asset_manifest = update_asset_manifest()
    report = {
        "ok": True,
        "tokenizer_asset_path": web_rel(tokenizer_path),
        "tokenizer_asset_bytes": tokenizer_path.stat().st_size,
        "runtime_compatible": False,
        "checksums": checksums,
        "asset_manifest_total_declared_bytes": asset_manifest["total_declared_bytes"],
        "runtime_model_route": runtime_mode["model_route"],
        "inference_smoke_passed": False,
        "blocker": "real_browser_inference_not_verified",
    }
    write_json(REPORT_ROOT / "prepare_tokenizer_asset.json", report)
    return report


def _load_asset_files() -> dict[str, list[dict[str, Any]]]:
    quant = _read_quantization_manifest()
    model_assets = [
        _asset_entry(ASSET_ROOT / "model.config.json", "model_config"),
        _asset_entry(ASSET_ROOT / "quantization.manifest.json", "quantization_manifest"),
        _asset_entry(ASSET_ROOT / "checksums.sha256.json", "checksum_manifest"),
    ]
    model_assets.extend(_asset_entry(WEB_ROOT / item["path"], "q4_shard", index=item["index"]) for item in quant["shards"])
    tokenizer_assets = [_asset_entry(TOKENIZER_ROOT / "tokenizer.json", "runtime_tokenizer_metadata")]
    return {"model_assets": model_assets, "tokenizer_assets": tokenizer_assets}


def _deployable_web_files() -> list[Path]:
    return [path for path in WEB_ROOT.rglob("*") if path.is_file()]


def update_asset_manifest() -> dict[str, Any]:
    base = read_json(ASSET_MANIFEST_PATH)
    files = _load_asset_files()
    model_asset_bytes = sum(int(item["bytes"]) for item in files["model_assets"] if item["role"] == "q4_shard")
    tokenizer_asset_bytes = sum(int(item["bytes"]) for item in files["tokenizer_assets"])
    rag_assets = _refresh_manifest_entries(base.get("rag_assets", []))
    gate_assets = _refresh_manifest_entries(base.get("gate_assets", []))
    total_declared = sum(int(item["bytes"]) for item in files["model_assets"] + files["tokenizer_assets"] + rag_assets + gate_assets)
    full_bundle_estimate = sum(path.stat().st_size for path in _deployable_web_files())
    static_llm_manifest = write_static_llm_admission_manifest(files)
    manifest = {
        **base,
        "runtime_version": "r28m1-static-q4-assets-v1",
        "model_assets": files["model_assets"],
        "tokenizer_assets": files["tokenizer_assets"],
        "rag_assets": rag_assets,
        "gate_assets": gate_assets,
        "total_declared_bytes": total_declared,
        "model_assets_admitted": True,
        "product_model_admission": False,
        "browser_admission": False,
        "release_checkpoint_admission": False,
        "same_origin_only": True,
        "external_runtime_dependency": False,
        "backend_inference": False,
        "external_llm_api": False,
        "doubao": False,
        "hosted_vector_store": False,
        "model_route": ALLOWED_MODEL_ROUTE,
        "candidate_source": ALLOWED_SOURCE,
        "quantization": "q4",
        "model_asset_manifest": {
            "model_asset_manifest": static_llm_manifest.relative_to(ROOT).as_posix(),
            "sha256": sha256_file(static_llm_manifest),
            "quantization_manifest": web_rel(ASSET_ROOT / "quantization.manifest.json"),
            "tokenizer_manifest": web_rel(TOKENIZER_ROOT / "tokenizer.json"),
            "source_lineage_metadata": "source_lineage",
            "non_product": True,
            "product_admitted": False,
            "browser_admission": False,
            "release_checkpoint_admission": False,
        },
        "shard_count": len([item for item in files["model_assets"] if item["role"] == "q4_shard"]),
        "total_model_asset_bytes": model_asset_bytes,
        "tokenizer_asset_bytes": tokenizer_asset_bytes,
        "full_bundle_estimate_bytes": full_bundle_estimate,
        "max_total_static_bytes": MAX_TOTAL_STATIC_BYTES,
        "non_claims": {
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint_admission": False,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
            "raw_checkpoint_committed": False,
            "training_corpus_committed": False,
        },
    }
    write_json(ASSET_MANIFEST_PATH, manifest)
    return manifest


def write_static_llm_admission_manifest(files: dict[str, list[dict[str, Any]]]) -> Path:
    file_entries = []
    for item in files["model_assets"] + files["tokenizer_assets"]:
        role = "metadata"
        if item["role"] == "q4_shard":
            role = "weights"
        elif item["role"] == "runtime_tokenizer_metadata":
            role = "tokenizer"
        elif item["role"] == "model_config":
            role = "config"
        file_entries.append(
            {
                "path": f"web/{item['path']}",
                "role": role,
                "bytes": int(item["bytes"]),
                "sha256": item["sha256"],
                "required": True,
            }
        )
    payload = {
        "schema_version": 1,
        "model_id": "r28m1_new_96m_q4_engineering_candidate",
        "model_family": "another_brain_a12_new_96m",
        "architecture": "decoder_only",
        "parameter_count": 96_363_008,
        "quantization": "q4",
        "context_length": 256,
        "tokenizer": "runtime_lineage_metadata_not_browser_inference_ready",
        "runtime_backend": "webgpu",
        "license": "project-internal-engineering-candidate",
        "license_url": "local-non-release-asset",
        "source_url": "local-a12-handoff",
        "converted_by": "R28M1 local q4 quantization scripts",
        "conversion_tool": "src/browser_export/r28m1_asset_commit.py",
        "provenance": "reviewed_admitted for static asset commit only; product/browser/release admission remain false",
        "review_status": "reviewed_admitted",
        "admission_status": "admitted",
        "contains_private_data": False,
        "total_bytes": sum(int(item["bytes"]) for item in file_entries),
        "profile": "hobby_static_llm_lite",
        "files": file_entries,
        "shard_policy": {
            "target_file_bytes": 12_000_000,
            "max_file_bytes": 25_000_000,
            "shard_count": len(file_entries),
        },
        "same_origin_only": True,
        "external_urls_allowed": False,
        "backend_required": False,
        "product_model_admission": False,
        "browser_admission": False,
        "release_checkpoint_admission": False,
        "phase_4": False,
    }
    write_json(STATIC_LLM_R28M1_MANIFEST, payload)
    return STATIC_LLM_R28M1_MANIFEST


def update_runtime_mode() -> dict[str, Any]:
    runtime = read_json(RUNTIME_MODE_PATH)
    quant = _read_quantization_manifest()
    deployable_bytes = sum(path.stat().st_size for path in _deployable_web_files())
    runtime.update(
        {
            "prelaunch_stage": "r28m1",
            "model_mode": "static_q4_engineering_candidate",
            "model_assets_admitted": True,
            "product_model": False,
            "product_admission": False,
            "product_model_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "release_checkpoint_admission": False,
            "phase_4": False,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
            "candidate_route": "product_path_engineering_candidate",
            "model_route": ALLOWED_MODEL_ROUTE,
            "candidate_source": ALLOWED_SOURCE,
            "selected_model": "new_96m",
            "quantization": "q4",
            "shard_count": int(quant.get("shard_count", 0) or 0),
            "total_model_asset_bytes": int(quant.get("shard_total_bytes", 0) or 0),
            "max_shard_bytes": int(quant.get("max_shard_bytes", 0) or 0),
            "full_bundle_estimate_bytes": deployable_bytes,
            "remaining_bytes_under_100mb": MAX_TOTAL_STATIC_BYTES - deployable_bytes,
            "budget_status": "under_100mb_static_q4_candidate",
            "candidate_static_bundle": True,
            "candidate_warning": "R28M1 admits q4 same-origin static assets as engineering/pre-admission assets only; this is not a product model, browser admission, or release checkpoint.",
            "asset_cache_status": "same_origin_static_q4_assets_committed_checksum_required",
            "offline_static_readiness": "static_assets_present_loader_smoke_only",
            "release_blockers": [
                "product_model_admission_not_done",
                "browser_inference_not_admitted_until_r28rt0",
                "release_checkpoint_admission_not_done",
                "vercel_preview_not_checked",
                "phase_4_false",
            ],
            "non_product_warning": "R28M1 static q4 assets are engineering/pre-admission assets only; no product model exists.",
        }
    )
    write_json(RUNTIME_MODE_PATH, runtime)
    return runtime


def tracked_files() -> list[str]:
    result = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True)
    return result.stdout.splitlines()


def full_bundle_budget_gate() -> dict[str, Any]:
    manifest = read_json(ASSET_MANIFEST_PATH)
    deployable_files = _deployable_web_files()
    deployable_bytes = sum(path.stat().st_size for path in deployable_files)
    max_file_bytes = max((path.stat().st_size for path in deployable_files), default=0)
    failures: list[str] = []
    warnings: list[str] = []
    declared_model_bytes = 0
    for section in ("model_assets", "tokenizer_assets", "rag_assets", "gate_assets"):
        for item in manifest.get(section, []):
            asset_path = item.get("path") if isinstance(item, dict) else item
            candidate = WEB_ROOT / str(asset_path)
            if not candidate.exists():
                failures.append(f"missing_declared_asset:{asset_path}")
                continue
            actual = candidate.stat().st_size
            if isinstance(item, dict) and int(item.get("bytes", -1)) != actual:
                failures.append(f"declared_size_mismatch:{asset_path}")
            if section == "model_assets" and item.get("role") == "q4_shard":
                declared_model_bytes += actual
            if actual > PREFERRED_MAX_SHARD_BYTES:
                failures.append(f"file_over_25mb:{asset_path}")
            if actual > WARNING_MAX_SHARD_BYTES:
                failures.append(f"file_over_50mib:{asset_path}")
            if actual > HARD_MAX_SHARD_BYTES:
                failures.append(f"file_over_100mib:{asset_path}")
    if deployable_bytes > MAX_TOTAL_STATIC_BYTES:
        failures.append(f"deployable_static_bytes_over_100mb:{deployable_bytes}")
    margin = MAX_TOTAL_STATIC_BYTES - deployable_bytes
    if margin < PREFERRED_MARGIN_BYTES:
        warnings.append(f"bundle_margin_below_10mb:{margin}")
    if manifest.get("total_model_asset_bytes") != declared_model_bytes:
        failures.append("manifest_total_model_asset_bytes_mismatch")
    if any(path.startswith("artifacts/") and path != "artifacts/.gitkeep" for path in tracked_files()):
        failures.append("tracked_artifacts_path_present")
    report = {
        "ok": not failures,
        "deployable_static_bytes": deployable_bytes,
        "full_bundle_bytes": deployable_bytes,
        "max_total_static_bytes": MAX_TOTAL_STATIC_BYTES,
        "margin_bytes": margin,
        "preferred_margin_bytes": PREFERRED_MARGIN_BYTES,
        "preferred_margin_ok": margin >= PREFERRED_MARGIN_BYTES,
        "static_file_count": len(deployable_files),
        "max_file_bytes": max_file_bytes,
        "total_model_asset_bytes": int(manifest.get("total_model_asset_bytes", 0) or 0),
        "tokenizer_asset_bytes": int(manifest.get("tokenizer_asset_bytes", 0) or 0),
        "model_assets_declared": len(manifest.get("model_assets", [])),
        "tokenizer_assets_declared": len(manifest.get("tokenizer_assets", [])),
        "failures": failures,
        "warnings": warnings,
    }
    write_json(REPORT_ROOT / "full_bundle_budget_gate.json", report)
    return report


def loader_smoke() -> dict[str, Any]:
    failures: list[str] = []
    manifest = read_json(ASSET_MANIFEST_PATH)
    quant = _read_quantization_manifest()
    checksums = read_json(ASSET_ROOT / "checksums.sha256.json")
    tokenizer_path = TOKENIZER_ROOT / "tokenizer.json"
    if not tokenizer_path.exists():
        failures.append("tokenizer_missing")
    if quant.get("quantization") != "q4":
        failures.append("quantization_not_q4")
    if quant.get("same_origin_only") is not True:
        failures.append("quantization_manifest_not_same_origin")
    checksum_by_path = {item["path"]: item for item in checksums.get("files", [])}
    checked = []
    for shard in quant.get("shards", []):
        path = str(shard.get("path", ""))
        if not is_same_origin_path(path):
            failures.append(f"not_same_origin:{path}")
            continue
        candidate = WEB_ROOT / path
        if not candidate.exists():
            failures.append(f"missing_shard:{path}")
            continue
        if candidate.stat().st_size != int(shard.get("bytes", -1)):
            failures.append(f"shard_size_mismatch:{path}")
        actual_sha = sha256_file(candidate)
        if actual_sha != shard.get("sha256"):
            failures.append(f"shard_sha256_mismatch:{path}")
        checksum_entry = checksum_by_path.get(path)
        if not checksum_entry or checksum_entry.get("sha256") != actual_sha:
            failures.append(f"checksum_manifest_mismatch:{path}")
        checked.append(path)
    if len(checked) != int(quant.get("shard_count", -1)):
        failures.append("shard_count_mismatch")
    if manifest.get("same_origin_only") is not True:
        failures.append("asset_manifest_not_same_origin")
    report = {
        "ok": not failures,
        "loader_smoke_passed": not failures,
        "inference_smoke_passed": False,
        "blocker": "real_browser_inference_not_verified",
        "same_origin_paths": not any(item.startswith("not_same_origin:") for item in failures),
        "sha256_verified": not any("sha256" in item or "checksum" in item for item in failures),
        "shard_count": len(checked),
        "tokenizer_present": tokenizer_path.exists(),
        "quantization_manifest_present": (ASSET_ROOT / "quantization.manifest.json").exists(),
        "model_config_present": (ASSET_ROOT / "model.config.json").exists(),
        "failures": failures,
        "non_claims": {
            "product_model": False,
            "browser_admission": False,
            "release_checkpoint_admission": False,
            "backend_inference": False,
            "external_llm_api": False,
        },
    }
    write_json(REPORT_ROOT / "loader_smoke.json", report)
    return report
