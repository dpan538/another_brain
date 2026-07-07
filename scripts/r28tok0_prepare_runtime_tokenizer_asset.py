#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from r28tok0_discover_tokenizer import discover_tokenizer  # noqa: E402

WEB_ROOT = ROOT / "web"
ASSET_ROOT = WEB_ROOT / "another_brain/model_assets/r28m1"
TOKENIZER_ROOT = ASSET_ROOT / "tokenizer"
RUNTIME_TOKENIZER = TOKENIZER_ROOT / "runtime_tokenizer.json"
METADATA_TOKENIZER = TOKENIZER_ROOT / "tokenizer.json"
ASSET_MANIFEST = WEB_ROOT / "another_brain/asset_manifest.json"
RUNTIME_MODE = WEB_ROOT / "another_brain/runtime_mode.json"
CHECKSUMS = ASSET_ROOT / "checksums.sha256.json"
STATIC_LLM_MANIFEST = ROOT / "static_llm/manifests/r28m1_new_96m_q4.admitted.json"
MAX_TOTAL_STATIC_BYTES = 100_000_000


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_runtime_tokenizer_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True).replace("/", "\\/")
    path.write_text(text + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def web_rel(path: Path) -> str:
    return path.relative_to(WEB_ROOT).as_posix()


def asset_entry(path: Path, role: str, **extra: Any) -> dict[str, Any]:
    return {
        "path": web_rel(path),
        "role": role,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        **extra,
    }


def refresh_manifest_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refreshed = []
    for item in entries:
        if not isinstance(item, dict) or not item.get("path"):
            continue
        candidate = WEB_ROOT / str(item["path"])
        next_item = dict(item)
        if candidate.exists():
            next_item["bytes"] = candidate.stat().st_size
            next_item["sha256"] = sha256_file(candidate)
        refreshed.append(next_item)
    return refreshed


def strip_runtime_tokenizer(source: Path) -> dict[str, Any]:
    data = read_json(source)
    model = data.get("model") if isinstance(data.get("model"), dict) else {}
    vocab = data.get("vocab") if isinstance(data.get("vocab"), dict) else model.get("vocab")
    merges = data.get("merges") if isinstance(data.get("merges"), list) else model.get("merges")
    if not isinstance(vocab, dict) or len(vocab) != 16_000:
        raise RuntimeError("exact_tokenizer_vocab_invalid")
    if not isinstance(merges, list) or not merges:
        raise RuntimeError("exact_tokenizer_merges_missing")
    added_tokens = data.get("added_tokens") if isinstance(data.get("added_tokens"), list) else []
    return {
        "schema_version": "r28tok0.exact_runtime_tokenizer.v1",
        "tokenizer_kind": "exact_runtime_bpe",
        "exact_runtime_tokenizer": True,
        "runtime_compatible": True,
        "browser_runtime_ready": True,
        "browser_inference_ready": False,
        "product_model": False,
        "product_admission": False,
        "browser_admission": False,
        "release_checkpoint_admission": False,
        "phase_4": False,
        "candidate_source": "r27a12_new_96m",
        "source_lineage": {
            "source_path_kind": "ignored_artifact_read_only",
            "source_tokenizer": "r27a4_model_lab_bpe_16000",
            "training_artifact_committed": False,
            "tokenizer_training_artifact_committed": False,
            "raw_or_clean_corpus_committed": False,
        },
        "model": {
            "type": "BPE",
            "unk_token": model.get("unk_token") or data.get("unk_token") or "<unk>",
            "byte_fallback": bool(model.get("byte_fallback", False)),
        },
        "normalizer": data.get("normalizer") or {"type": "NFKC"},
        "pre_tokenizer": data.get("pre_tokenizer") or {
            "type": "Sequence",
            "pretokenizers": [
                {"type": "Split", "pattern": {"String": "([\\u4e00-\\u9fff])"}, "behavior": "Isolated"},
                {"type": "ByteLevel", "add_prefix_space": False, "trim_offsets": True, "use_regex": True},
            ],
        },
        "post_processor": data.get("post_processor") or {},
        "added_tokens": [
            {
                "id": int(item.get("id")),
                "content": str(item.get("content")),
                "special": bool(item.get("special", False)),
            }
            for item in added_tokens
            if isinstance(item, dict) and isinstance(item.get("id"), int) and isinstance(item.get("content"), str)
        ],
        "special_tokens": {
            "pad": "<pad>",
            "unk": "<unk>",
            "bos": "<bos>",
            "eos": "<eos>",
        },
        "unk_token": model.get("unk_token") or data.get("unk_token") or "<unk>",
        "vocab_size": 16_000,
        "vocab": vocab,
        "merges": merges,
        "non_claims": {
            "not_product_model": True,
            "not_product_admission": True,
            "not_browser_admission": True,
            "not_release_checkpoint": True,
            "no_training": True,
            "no_new_model_weights": True,
            "no_backend_inference": True,
            "no_external_llm_api": True,
            "no_doubao": True,
            "runtime_compatibility_only": True,
        },
    }


def deployable_web_bytes() -> int:
    return sum(path.stat().st_size for path in WEB_ROOT.rglob("*") if path.is_file())


def write_checksums() -> dict[str, Any]:
    quant = read_json(ASSET_ROOT / "quantization.manifest.json")
    files = [
        ASSET_ROOT / "model.config.json",
        ASSET_ROOT / "quantization.manifest.json",
        *(WEB_ROOT / item["path"] for item in quant.get("shards", [])),
        METADATA_TOKENIZER,
        RUNTIME_TOKENIZER,
    ]
    payload = {
        "schema_version": "r28tok0.checksums.v1",
        "same_origin_only": True,
        "file_count": len(files),
        "total_bytes": sum(path.stat().st_size for path in files),
        "files": [
            {
                "path": web_rel(path),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
            for path in files
        ],
    }
    write_json(CHECKSUMS, payload)
    return payload


def update_asset_manifest() -> dict[str, Any]:
    manifest = read_json(ASSET_MANIFEST)
    quant = read_json(ASSET_ROOT / "quantization.manifest.json")
    model_assets = [
        asset_entry(ASSET_ROOT / "model.config.json", "model_config"),
        asset_entry(ASSET_ROOT / "quantization.manifest.json", "quantization_manifest"),
        asset_entry(CHECKSUMS, "checksum_manifest"),
    ]
    model_assets.extend(
        asset_entry(WEB_ROOT / item["path"], "q4_shard", index=int(item["index"]))
        for item in quant.get("shards", [])
    )
    tokenizer_assets = [
        asset_entry(RUNTIME_TOKENIZER, "exact_runtime_tokenizer"),
        asset_entry(METADATA_TOKENIZER, "runtime_tokenizer_metadata"),
    ]
    rag_assets = refresh_manifest_entries(manifest.get("rag_assets", []))
    gate_assets = refresh_manifest_entries(manifest.get("gate_assets", []))
    total_declared = sum(int(item.get("bytes", 0)) for item in model_assets + tokenizer_assets + rag_assets + gate_assets)
    deployable = deployable_web_bytes()
    manifest.update(
        {
            "runtime_version": "r28tok0-exact-runtime-tokenizer-v1",
            "prelaunch_stage": "r28tok0",
            "model_assets": model_assets,
            "tokenizer_assets": tokenizer_assets,
            "rag_assets": rag_assets,
            "gate_assets": gate_assets,
            "tokenizer_asset_bytes": sum(int(item["bytes"]) for item in tokenizer_assets),
            "total_declared_bytes": total_declared,
            "full_bundle_estimate_bytes": deployable,
            "remaining_bytes_under_100mb": MAX_TOTAL_STATIC_BYTES - deployable,
            "tokenizer_decode_status": "exact_runtime_tokenizer",
            "tokenizer_exact_decode": True,
            "runtime_tokenizer_blocker": "",
            "model_assets_admitted": True,
            "product_model_admission": False,
            "browser_admission": False,
            "release_checkpoint_admission": False,
            "same_origin_only": True,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
        }
    )
    manifest.setdefault("model_asset_manifest", {})
    manifest["model_asset_manifest"].update(
        {
            "tokenizer_manifest": web_rel(RUNTIME_TOKENIZER),
            "tokenizer_metadata_manifest": web_rel(METADATA_TOKENIZER),
            "exact_runtime_tokenizer": True,
            "browser_admission": False,
            "release_checkpoint_admission": False,
        }
    )
    write_json(ASSET_MANIFEST, manifest)
    return manifest


def update_runtime_mode() -> dict[str, Any]:
    runtime = read_json(RUNTIME_MODE)
    deployable = deployable_web_bytes()
    runtime.update(
        {
            "prelaunch_stage": "r28tok0",
            "model_mode": "static_q4_experimental",
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
            "tokenizer": "exact_runtime_tokenizer",
            "tokenizer_decode_status": "exact_runtime_tokenizer",
            "tokenizer_exact_decode": True,
            "runtime_tokenizer_blocker": "",
            "runtime_capability_status": "q4_manifest_checksum_unpack_matmul_decoder_forward_exact_tokenizer_decode_passed",
            "candidate_warning": "R28TOK0 admits an exact runtime tokenizer for static q4 compatibility only; this is not product, browser, or release admission.",
            "non_product_warning": "R28TOK0 static q4 runtime uses an exact runtime tokenizer but remains experimental/non-product.",
            "offline_static_readiness": "static_q4_forward_exact_tokenizer_smoke_passed",
            "quality_status": "quality_not_ready",
            "full_bundle_estimate_bytes": deployable,
            "remaining_bytes_under_100mb": MAX_TOTAL_STATIC_BYTES - deployable,
            "release_blockers": [
                "product_model_admission_not_done",
                "browser_admission_not_done",
                "release_checkpoint_admission_not_done",
                "vercel_preview_not_checked",
                "quality_manual_qa_not_done",
                "phase_4_false",
            ],
        }
    )
    write_json(RUNTIME_MODE, runtime)
    return runtime


def update_static_llm_manifest() -> dict[str, Any]:
    payload = read_json(STATIC_LLM_MANIFEST)
    files = [item for item in payload.get("files", []) if item.get("path") != f"web/{web_rel(RUNTIME_TOKENIZER)}"]
    for item in files:
        if item.get("path") == f"web/{web_rel(METADATA_TOKENIZER)}":
            item["role"] = "metadata"
            item["required"] = False
        repo_path = ROOT / str(item.get("path", ""))
        if repo_path.exists():
            item["bytes"] = repo_path.stat().st_size
            item["sha256"] = sha256_file(repo_path)
    files.append(
        {
            "path": f"web/{web_rel(RUNTIME_TOKENIZER)}",
            "role": "tokenizer",
            "bytes": RUNTIME_TOKENIZER.stat().st_size,
            "sha256": sha256_file(RUNTIME_TOKENIZER),
            "required": True,
        }
    )
    payload.update(
        {
            "tokenizer": "exact_runtime_bpe_16000_runtime_compatibility_only",
            "total_bytes": sum(int(item.get("bytes", 0)) for item in files),
            "files": files,
            "browser_admission": False,
            "release_checkpoint_admission": False,
            "product_model_admission": False,
            "phase_4": False,
        }
    )
    payload.setdefault("shard_policy", {})
    payload["shard_policy"]["shard_count"] = len(files)
    write_json(STATIC_LLM_MANIFEST, payload)
    return payload


def finalize_bundle_estimates() -> dict[str, int]:
    deployable = deployable_web_bytes()
    manifest = read_json(ASSET_MANIFEST)
    manifest["full_bundle_estimate_bytes"] = deployable
    manifest["remaining_bytes_under_100mb"] = MAX_TOTAL_STATIC_BYTES - deployable
    write_json(ASSET_MANIFEST, manifest)
    runtime = read_json(RUNTIME_MODE)
    runtime["full_bundle_estimate_bytes"] = deployable
    runtime["remaining_bytes_under_100mb"] = MAX_TOTAL_STATIC_BYTES - deployable
    write_json(RUNTIME_MODE, runtime)
    return {"bundle_bytes": deployable, "margin_bytes": MAX_TOTAL_STATIC_BYTES - deployable}


def prepare_runtime_tokenizer_asset() -> dict[str, Any]:
    discovery = discover_tokenizer()
    if not discovery["ok"]:
        return {
            "ok": False,
            "exact_tokenizer_found": False,
            "blocker": discovery.get("blocker") or "exact_tokenizer_artifact_missing",
            "discovery": discovery,
        }
    source = Path(discovery["source_path"])
    if source == RUNTIME_TOKENIZER and RUNTIME_TOKENIZER.exists():
        runtime_tokenizer = read_json(RUNTIME_TOKENIZER)
    else:
        runtime_tokenizer = strip_runtime_tokenizer(source)
    write_runtime_tokenizer_json(RUNTIME_TOKENIZER, runtime_tokenizer)
    runtime_mode = update_runtime_mode()
    checksums = write_checksums()
    asset_manifest = update_asset_manifest()
    static_manifest = update_static_llm_manifest()
    final_budget = finalize_bundle_estimates()
    asset_manifest = update_asset_manifest()
    report = {
        "ok": True,
        "exact_tokenizer_found": True,
        "tokenizer_type": runtime_tokenizer["tokenizer_kind"],
        "vocab_size": runtime_tokenizer["vocab_size"],
        "merge_count": len(runtime_tokenizer["merges"]),
        "source_path": str(source),
        "runtime_tokenizer_asset": web_rel(RUNTIME_TOKENIZER),
        "runtime_tokenizer_asset_bytes": RUNTIME_TOKENIZER.stat().st_size,
        "runtime_tokenizer_sha256": sha256_file(RUNTIME_TOKENIZER),
        "bundle_bytes": final_budget["bundle_bytes"],
        "margin_bytes": final_budget["margin_bytes"],
        "asset_manifest_tokenizer_asset_bytes": asset_manifest["tokenizer_asset_bytes"],
        "checksums_file_count": checksums["file_count"],
        "static_manifest_total_bytes": static_manifest["total_bytes"],
        "runtime_mode": runtime_mode["model_mode"],
        "decode_status": runtime_mode["tokenizer_decode_status"],
        "non_claims": runtime_tokenizer["non_claims"],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return report


def main() -> int:
    report = prepare_runtime_tokenizer_asset()
    if not report.get("ok"):
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
