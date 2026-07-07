#!/usr/bin/env python3
"""R28QA1 static q4 manual/browser QA matrix."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
CHAT_ROOT = WEB_ROOT / "another_brain_chat"
STATIC_ROOT = WEB_ROOT / "another_brain"
ASSET_ROOT = STATIC_ROOT / "model_assets" / "r28m1"
RUNTIME_MODE_PATH = STATIC_ROOT / "runtime_mode.json"
ASSET_MANIFEST_PATH = STATIC_ROOT / "asset_manifest.json"
CHECKSUMS_PATH = ASSET_ROOT / "checksums.sha256.json"
MAX_TOTAL_STATIC_BYTES = 100_000_000

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r28d5_final_prelaunch_audit import final_prelaunch_audit  # noqa: E402
from src.browser_export.r28m1_asset_commit import full_bundle_budget_gate  # noqa: E402


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_json_command(command: list[str], timeout: int = 240) -> dict[str, Any]:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=timeout)
    if result.returncode != 0:
        return {
            "ok": False,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
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


def scenario(scenario_id: int | str, name: str, ok: bool, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "id": scenario_id,
        "name": name,
        "status": "pass" if ok else "fail",
        "ok": bool(ok),
        "details": details or {},
    }


def verify_q4_checksums(checksums: dict[str, Any]) -> dict[str, Any]:
    failures: list[str] = []
    checked = 0
    max_shard_bytes = 0
    for entry in checksums.get("files") or []:
        rel = str(entry.get("path") or "")
        if "/shards/" not in rel:
            continue
        checked += 1
        path = WEB_ROOT / rel
        if not path.exists():
            failures.append(f"missing:{rel}")
            continue
        max_shard_bytes = max(max_shard_bytes, path.stat().st_size)
        if path.stat().st_size != int(entry.get("bytes", -1)):
            failures.append(f"size_mismatch:{rel}")
        if sha256_file(path) != entry.get("sha256"):
            failures.append(f"sha256_mismatch:{rel}")
    return {
        "ok": not failures and checked == 5,
        "checked_shards": checked,
        "max_shard_bytes": max_shard_bytes,
        "failures": failures,
    }


def readable_generation_status(runtime: dict[str, Any], *, run_readable_smoke: bool) -> dict[str, Any]:
    if runtime.get("readable_generation_smoke_passed") is not True:
        return {
            "ok": False,
            "status": "real_readable_inference_blocked",
            "blocker": runtime.get("runtime_tokenizer_blocker") or "readable_generation_not_declared",
            "generated_token_count": int(runtime.get("generated_token_count") or 0),
            "smoke_executed": False,
        }
    if not run_readable_smoke:
        return {
            "ok": True,
            "status": "metadata_declares_rt2_readable_smoke_passed",
            "generated_token_count": int(runtime.get("generated_token_count") or 0),
            "runtime_mode": runtime.get("model_mode"),
            "decode_status": runtime.get("tokenizer_decode_status"),
            "quality_status": runtime.get("quality_status"),
            "smoke_executed": False,
        }
    smoke = run_json_command(["python3", "scripts/r28rt2_readable_generation_smoke.py"], timeout=300)
    smoke_payload = smoke.get("smoke") if isinstance(smoke, dict) else {}
    return {
        "ok": bool(smoke.get("ok") and smoke_payload.get("readable_generation_passed")),
        "status": "rt2_readable_smoke_executed",
        "generated_token_count": int(smoke_payload.get("generated_token_count") or 0),
        "runtime_mode": smoke_payload.get("runtime_mode"),
        "decode_status": smoke_payload.get("tokenizer_decode_status"),
        "quality_status": smoke_payload.get("quality_status"),
        "decoded_text_available": smoke_payload.get("decoded_text_available"),
        "smoke_executed": True,
        "smoke": smoke,
    }


def preview_checklist(runtime: dict[str, Any], budget: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "manual_pending",
        "branch": "r28qa1-static-q4-manual-qa",
        "build_command": "npm run build:vercel",
        "output_directory": "web",
        "checks": [
            "confirm preview uses this branch SHA",
            "open /another_brain_chat/",
            "confirm Local only and No backend inference badges",
            "confirm runtime mode static_q4_experimental",
            "confirm release blockers remain visible",
            "confirm network panel has no backend/external LLM/Doubao/vector-store calls",
            "confirm bundle remains under 100MB",
        ],
        "vercel_preview_checked": False,
        "bundle_bytes": int(budget.get("full_bundle_bytes") or runtime.get("full_bundle_estimate_bytes") or 0),
    }


def qa_matrix(*, run_readable_smoke: bool = True) -> dict[str, Any]:
    runtime = read_json(RUNTIME_MODE_PATH)
    manifest = read_json(ASSET_MANIFEST_PATH)
    checksums = read_json(CHECKSUMS_PATH)
    html = read_text(CHAT_ROOT / "index.html")
    app_js = read_text(CHAT_ROOT / "app.js")
    browser_runtime_js = read_text(CHAT_ROOT / "browser_runtime.js")
    runtime_worker_js = read_text(CHAT_ROOT / "runtime_worker.js")
    static_retriever_js = read_text(CHAT_ROOT / "static_retriever.js")
    context_bridge_js = read_text(CHAT_ROOT / "context_bridge.js")
    styles_css = read_text(CHAT_ROOT / "styles.css")
    asset_checksums = verify_q4_checksums(checksums)
    d5_audit = final_prelaunch_audit(run_rt1_smoke=False)
    budget = full_bundle_budget_gate()
    node_static = run_json_command(["node", "scripts/r28qa1_node_static_scenarios.mjs"], timeout=60)
    readable = readable_generation_status(runtime, run_readable_smoke=run_readable_smoke)

    scenarios = [
        scenario(1, "open chat route", (CHAT_ROOT / "index.html").exists() and "./app.js" in html),
        scenario(2, "model asset manifest visible", ASSET_MANIFEST_PATH.exists() and manifest.get("model_assets_admitted") is True),
        scenario(3, "q4 asset checksums", asset_checksums["ok"], asset_checksums),
        scenario(4, "runtime mode shown", "runtime-mode-status" in html and runtime.get("model_mode") == "static_q4_experimental"),
        scenario(5, "local-only badge", "Local only" in html and "No backend inference" in html),
        scenario(6, "adapter import plain text", bool(node_static.get("adapter_plain_text", {}).get("ok")), node_static.get("adapter_plain_text")),
        scenario(7, "adapter import JSON", bool(node_static.get("adapter_json", {}).get("ok")), node_static.get("adapter_json")),
        scenario(8, "RAG demo evidence", bool(node_static.get("rag_demo_evidence", {}).get("ok")), node_static.get("rag_demo_evidence")),
        scenario(9, "insufficient evidence", bool(node_static.get("insufficient_evidence", {}).get("ok")), node_static.get("insufficient_evidence")),
        scenario(10, "malicious evidence injection", bool(node_static.get("malicious_evidence_injection", {}).get("ok")), node_static.get("malicious_evidence_injection")),
        scenario(11, "conflicting evidence", bool(node_static.get("conflicting_evidence", {}).get("ok")), node_static.get("conflicting_evidence")),
        scenario(12, "fallback reason", "fallback-reason-status" in html and bool(node_static.get("fallback_reason", {}).get("ok")), node_static.get("fallback_reason")),
        scenario(13, "clear chat", "clear-chat-button" in html and "clearConversation" in app_js),
        scenario(14, "abort generation", "abort-button" in html and "generation_aborted" in browser_runtime_js and "runtime.abort" in app_js),
        scenario(15, "mobile layout", "@media (max-width: 720px)" in styles_css and ".composer" in styles_css),
        scenario(16, "accessibility markers", "aria-live=\"polite\"" in html and "aria-label=\"messages\"" in html),
        scenario(17, "no backend request config", manifest.get("backend_inference") is False and runtime.get("backend_inference") is False),
        scenario(18, "no external LLM URL", manifest.get("external_llm_api") is False and runtime.get("external_llm_api") is False),
        scenario(19, "no Doubao", manifest.get("doubao") is False and runtime.get("doubao") is False),
        scenario(20, "no hosted vector store", manifest.get("hosted_vector_store") is False and runtime.get("hosted_vector_store") is False and "hosted_vector_store: false" in static_retriever_js),
        scenario(21, "bundle under 100MB", budget.get("ok") is True and int(budget.get("full_bundle_bytes") or 0) <= MAX_TOTAL_STATIC_BYTES, budget),
        scenario(22, "no product admission text", manifest.get("product_model_admission") is False and runtime.get("product_admission") is False and "product_model: false" in app_js),
        scenario(23, "release blockers visible", "release-blocker-status" in html and bool(runtime.get("release_blockers"))),
        scenario("rt2-readable", "readable generation smoke", readable["ok"], readable),
    ]

    failures = [item for item in scenarios if not item["ok"]]
    pass_count = len(scenarios) - len(failures)
    return {
        "ok": not failures and d5_audit.get("ok") is True,
        "branch": "r28qa1-static-q4-manual-qa",
        "base": "origin/r28rt2-readable-q4-runtime",
        "scenario_count": len(scenarios),
        "pass_count": pass_count,
        "fail_count": len(failures),
        "scenarios": scenarios,
        "readable_inference_status": readable,
        "d5_audit_ok": d5_audit.get("ok"),
        "budget": budget,
        "release_blockers": runtime.get("release_blockers") or [],
        "vercel_preview_checklist": preview_checklist(runtime, budget),
        "non_claims": {
            "training": False,
            "new_model_assets": False,
            "backend_inference": manifest.get("backend_inference"),
            "external_llm_api": manifest.get("external_llm_api"),
            "doubao": manifest.get("doubao"),
            "hosted_vector_store": manifest.get("hosted_vector_store"),
            "product_admission": runtime.get("product_admission"),
            "browser_admission": runtime.get("browser_admission"),
            "release_checkpoint_admission": runtime.get("release_checkpoint_admission"),
        },
        "failures": [item["name"] for item in failures],
    }


def main() -> int:
    report = qa_matrix(run_readable_smoke=True)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
