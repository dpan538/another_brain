#!/usr/bin/env python3
"""R28D5 final prelaunch PR audit."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
STATIC_ROOT = WEB_ROOT / "another_brain"
CHAT_ROOT = WEB_ROOT / "another_brain_chat"
ASSET_ROOT = STATIC_ROOT / "model_assets" / "r28m1"
RUNTIME_MODE_PATH = STATIC_ROOT / "runtime_mode.json"
ASSET_MANIFEST_PATH = STATIC_ROOT / "asset_manifest.json"
CHECKSUMS_PATH = ASSET_ROOT / "checksums.sha256.json"
MAX_TOTAL_STATIC_BYTES = 100_000_000
MAX_SHARD_BYTES = 25_000_000

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27b0_check_static_only import check_static_only  # noqa: E402
from src.browser_export.r28m1_asset_commit import full_bundle_budget_gate  # noqa: E402


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def web_path(path: str) -> Path:
    return WEB_ROOT / path


def repo_rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def is_same_origin_relative(path: str) -> bool:
    candidate = Path(path)
    return not (
        path.startswith(("http://", "https://", "//"))
        or candidate.is_absolute()
        or ".." in candidate.parts
    )


def run_json_command(command: list[str], timeout: int = 180) -> dict[str, Any]:
    result = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        return {"ok": False, "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        return {
            "ok": False,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "error": f"json_parse_failed:{exc}",
        }


def tracked_artifact_safety() -> dict[str, Any]:
    result = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, text=True, capture_output=True, check=True)
    tracked = [item for item in result.stdout.split("\0") if item]
    forbidden: list[str] = []
    allowed_bin_prefix = "web/another_brain/model_assets/r28m1/shards/"
    allowed_tokenizer = "web/another_brain/model_assets/r28m1/tokenizer/tokenizer.json"
    allowed_tokenizer_fixtures = {
        allowed_tokenizer,
        "static_llm/fixtures/tiny_decoder_fixture/tokenizer.json",
    }
    raw_weight_exts = (".pt", ".pth", ".safetensors", ".ckpt", ".onnx", ".gguf")
    for path in tracked:
        suffix = Path(path).suffix.lower()
        if path.startswith("artifacts/") and path != "artifacts/.gitkeep":
            forbidden.append(path)
        if path.startswith(("data/public_ingestion/", "raw_public_samples/", "clean_public_samples/", "training_mix/")):
            forbidden.append(path)
        if "/" not in path and suffix in {".docx", ".pdf"}:
            forbidden.append(path)
        if suffix in raw_weight_exts:
            forbidden.append(path)
        if suffix == ".bin" and not path.startswith(allowed_bin_prefix):
            forbidden.append(path)
        if path.endswith("tokenizer.json") and path not in allowed_tokenizer_fixtures:
            forbidden.append(path)
    return {"ok": not forbidden, "forbidden_tracked": sorted(set(forbidden))}


def verify_assets(manifest: dict[str, Any], checksums: dict[str, Any]) -> dict[str, Any]:
    failures: list[str] = []
    checked_files: list[str] = []
    checksum_entries = checksums.get("files") or []
    shard_entries = [entry for entry in checksum_entries if "/shards/" in str(entry.get("path", ""))]

    for required in [
        ASSET_ROOT / "model.config.json",
        ASSET_ROOT / "quantization.manifest.json",
        CHECKSUMS_PATH,
        ASSET_ROOT / "tokenizer" / "tokenizer.json",
    ]:
        if not required.exists():
            failures.append(f"missing_asset:{repo_rel(required)}")

    for entry in checksum_entries:
        rel = str(entry.get("path") or "")
        if not rel:
            failures.append("checksum_entry_missing_path")
            continue
        if not is_same_origin_relative(rel):
            failures.append(f"checksum_path_not_same_origin:{rel}")
            continue
        path = web_path(rel)
        if not path.exists():
            failures.append(f"checksum_file_missing:{rel}")
            continue
        checked_files.append(rel)
        if path.stat().st_size != int(entry.get("bytes", -1)):
            failures.append(f"checksum_size_mismatch:{rel}")
        if sha256_file(path) != entry.get("sha256"):
            failures.append(f"checksum_sha_mismatch:{rel}")

    if manifest.get("shard_count") != len(shard_entries):
        failures.append("manifest_shard_count_mismatch")
    if len(shard_entries) != 5:
        failures.append("unexpected_q4_shard_count")
    for shard in shard_entries:
        if int(shard.get("bytes", 0)) >= MAX_SHARD_BYTES:
            failures.append(f"shard_over_25mb:{shard.get('path')}")

    for group in ("model_assets", "tokenizer_assets", "rag_assets", "gate_assets"):
        for entry in manifest.get(group) or []:
            rel = str(entry.get("path") or "")
            if not rel or not is_same_origin_relative(rel):
                failures.append(f"manifest_path_not_same_origin:{group}:{rel}")

    return {
        "ok": not failures,
        "failures": failures,
        "checked_files": checked_files,
        "shard_count": len(shard_entries),
        "max_shard_bytes": max((int(entry.get("bytes", 0)) for entry in shard_entries), default=0),
    }


def verify_routes_and_features(runtime: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    failures: list[str] = []
    route_status = {
        "chat_route": (CHAT_ROOT / "index.html").exists() and (CHAT_ROOT / "app.js").exists(),
        "rag_route": (STATIC_ROOT / "static_rag" / "demo_memory.json").exists() and (CHAT_ROOT / "static_retriever.js").exists(),
        "adapter_bridge": (ROOT / "src" / "browser_runtime" / "context_adapter.ts").exists()
        and (CHAT_ROOT / "context_bridge.js").exists(),
        "asset_cache": (ROOT / "src" / "browser_runtime" / "assets" / "asset_cache.ts").exists(),
        "runtime_worker": (ROOT / "src" / "browser_runtime" / "runtime_worker.ts").exists(),
        "fallback_path": runtime.get("runtime_fallback_reason") == "fallback_available",
        "release_blockers_visible": isinstance(runtime.get("release_blockers"), list) and bool(runtime.get("release_blockers")),
    }
    for key, value in route_status.items():
        if not value:
            failures.append(f"{key}_missing")
    if runtime.get("model_mode") not in {"static_q4_experimental", "synthetic_tiny"}:
        failures.append("runtime_mode_invalid")
    if manifest.get("rag_assets", [{}])[0].get("answer_bank") is not False:
        failures.append("rag_asset_must_not_be_answer_bank")
    if runtime.get("adapter_status") != "local_session_import_export_ready":
        failures.append("adapter_status_not_ready")
    return {"ok": not failures, "failures": failures, **route_status}


def verify_non_claims(runtime: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    failures: list[str] = []
    expected_false = {
        "product_model_admission": manifest.get("product_model_admission"),
        "browser_admission": manifest.get("browser_admission"),
        "release_checkpoint_admission": manifest.get("release_checkpoint_admission"),
        "backend_inference": manifest.get("backend_inference"),
        "external_llm_api": manifest.get("external_llm_api"),
        "doubao": manifest.get("doubao"),
        "hosted_vector_store": manifest.get("hosted_vector_store"),
        "runtime_product_model": runtime.get("product_model"),
        "runtime_browser_admission": runtime.get("browser_admission"),
        "runtime_release_checkpoint_admission": runtime.get("release_checkpoint_admission"),
        "runtime_phase_4": runtime.get("phase_4"),
    }
    for key, value in expected_false.items():
        if value is not False:
            failures.append(f"{key}_must_be_false")
    if manifest.get("model_assets_admitted") is not True:
        failures.append("q4_model_assets_must_remain_admitted")
    if manifest.get("same_origin_only") is not True:
        failures.append("same_origin_only_must_be_true")
    return {"ok": not failures, "failures": failures, "checked": expected_false}


def rt1_forward_status(runtime: dict[str, Any], run_smoke: bool) -> dict[str, Any]:
    declared = {
        "rt1_files_present": (ROOT / "scripts" / "r28rt1_node_real_forward_smoke.mjs").exists()
        and (ROOT / "src" / "browser_runtime" / "q4_runtime" / "static_q4_runtime.ts").exists(),
        "runtime_mode": runtime.get("model_mode"),
        "declared_inference_smoke_passed": runtime.get("inference_smoke_passed") is True,
        "declared_generated_token_count": int(runtime.get("generated_token_count") or 0),
        "decoded_text_available": runtime.get("decoded_text_available") is True,
        "tokenizer_blocker": runtime.get("runtime_tokenizer_blocker"),
    }
    if not run_smoke:
        declared["ok"] = bool(
            declared["rt1_files_present"]
            and declared["runtime_mode"] == "static_q4_experimental"
            and declared["declared_inference_smoke_passed"]
            and declared["declared_generated_token_count"] >= 1
        )
        declared["smoke_executed"] = False
        return declared

    smoke = run_json_command(["node", "scripts/r28rt1_node_real_forward_smoke.mjs"])
    smoke_payload = smoke.get("smoke", {}) if isinstance(smoke, dict) else {}
    declared.update(
        {
            "ok": bool(
                smoke.get("ok")
                and smoke_payload.get("real_forward_passed")
                and smoke_payload.get("real_inference_smoke_passed")
                and int(smoke_payload.get("generated_token_count") or 0) >= 1
            ),
            "smoke_executed": True,
            "smoke": smoke,
        }
    )
    return declared


def final_prelaunch_audit(*, run_rt1_smoke: bool = True) -> dict[str, Any]:
    failures: list[str] = []
    runtime = read_json(RUNTIME_MODE_PATH)
    manifest = read_json(ASSET_MANIFEST_PATH)
    checksums = read_json(CHECKSUMS_PATH)

    assets = verify_assets(manifest, checksums)
    budget = full_bundle_budget_gate()
    static_only_failures = check_static_only()
    routes = verify_routes_and_features(runtime, manifest)
    non_claims = verify_non_claims(runtime, manifest)
    artifacts = tracked_artifact_safety()
    real_forward = rt1_forward_status(runtime, run_smoke=run_rt1_smoke)

    if not assets["ok"]:
        failures.extend(assets["failures"])
    if not budget.get("ok"):
        failures.extend(budget.get("failures") or ["bundle_budget_gate_failed"])
    if int(budget.get("full_bundle_bytes") or 0) > MAX_TOTAL_STATIC_BYTES:
        failures.append("bundle_over_100mb")
    if int(budget.get("max_file_bytes") or 0) >= MAX_SHARD_BYTES:
        failures.append("max_file_over_25mb")
    failures.extend(f"static_only:{item}" for item in static_only_failures)
    if not routes["ok"]:
        failures.extend(routes["failures"])
    if not non_claims["ok"]:
        failures.extend(non_claims["failures"])
    if not artifacts["ok"]:
        failures.extend(f"forbidden_tracked:{item}" for item in artifacts["forbidden_tracked"])
    if not real_forward["ok"]:
        failures.append("real_q4_forward_not_passed")

    return {
        "ok": not failures,
        "branch_candidate": "r28d5-final-prelaunch-pr",
        "base_priority_selected": "origin/r28rt1-real-q4-forward",
        "q4_assets": assets,
        "budget": budget,
        "static_only": {"ok": not static_only_failures, "failures": static_only_failures},
        "routes": routes,
        "real_q4_forward": real_forward,
        "artifact_safety": artifacts,
        "release_blockers": runtime.get("release_blockers") or [],
        "non_claims": non_claims,
        "manual_pr": {
            "base": "main",
            "head": "r28d5-final-prelaunch-pr",
            "url": "https://github.com/dpan538/another_brain/pull/new/r28d5-final-prelaunch-pr",
        },
        "failures": sorted(set(failures)),
    }


def main() -> int:
    report = final_prelaunch_audit(run_rt1_smoke=True)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
