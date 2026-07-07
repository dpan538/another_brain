#!/usr/bin/env python3
"""R28AD0 product/browser/release admission precheck.

This script does not approve product, browser, or release admission. It only
reports whether the current static q4 candidate is ready to request those
admission reviews.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
STATIC_ROOT = WEB_ROOT / "another_brain"
ASSET_ROOT = STATIC_ROOT / "model_assets" / "r28m1"
RUNTIME_MODE_PATH = STATIC_ROOT / "runtime_mode.json"
ASSET_MANIFEST_PATH = STATIC_ROOT / "asset_manifest.json"
MAX_TOTAL_STATIC_BYTES = 100_000_000

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r28qa1_run_qa_matrix import qa_matrix  # noqa: E402
from src.browser_export.r28m1_asset_commit import full_bundle_budget_gate, loader_smoke  # noqa: E402


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def check(name: str, ok: bool, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "ok": bool(ok),
        "status": "pass" if ok else "fail",
        "details": details or {},
    }


def scenario_status(matrix: dict[str, Any], names: set[str]) -> dict[str, Any]:
    scenarios = {item["name"]: item for item in matrix.get("scenarios", [])}
    selected = {name: scenarios.get(name, {"ok": False, "status": "missing"}) for name in names}
    return {
        "ok": all(item.get("ok") is True for item in selected.values()),
        "selected": selected,
    }


def admission_precheck(*, run_qa_readable_smoke: bool = False) -> dict[str, Any]:
    runtime = read_json(RUNTIME_MODE_PATH)
    manifest = read_json(ASSET_MANIFEST_PATH)
    budget = full_bundle_budget_gate()
    loader = loader_smoke()
    matrix = qa_matrix(run_readable_smoke=run_qa_readable_smoke)

    q4_assets = {
        "model_assets_admitted": manifest.get("model_assets_admitted") is True,
        "shard_count": int(manifest.get("shard_count") or 0),
        "total_model_asset_bytes": int(manifest.get("total_model_asset_bytes") or 0),
        "loader_smoke_passed": loader.get("loader_smoke_passed") is True,
        "checksum_passed": loader.get("sha256_verified") is True,
    }
    real_forward = {
        "inference_smoke_passed": runtime.get("inference_smoke_passed") is True,
        "runtime_capability_status": runtime.get("runtime_capability_status"),
        "generated_token_count": int(runtime.get("generated_token_count") or 0),
        "runtime_mode": runtime.get("model_mode"),
    }
    readable_decode = {
        "readable_generation_smoke_passed": runtime.get("readable_generation_smoke_passed") is True,
        "decoded_text_available": runtime.get("decoded_text_available") is True,
        "tokenizer_decode_status": runtime.get("tokenizer_decode_status"),
        "tokenizer_exact_decode": runtime.get("tokenizer_exact_decode") is True,
        "tokenizer_limitation": runtime.get("runtime_tokenizer_blocker"),
    }
    preview = {
        "vercel_preview_checked": False,
        "status": matrix.get("vercel_preview_checklist", {}).get("status") or "manual_pending",
        "blocker": "vercel_preview_not_checked",
    }
    backend_external = {
        "backend_inference": manifest.get("backend_inference") is False and runtime.get("backend_inference") is False,
        "external_llm_api": manifest.get("external_llm_api") is False and runtime.get("external_llm_api") is False,
        "doubao": manifest.get("doubao") is False and runtime.get("doubao") is False,
        "hosted_vector_store": manifest.get("hosted_vector_store") is False and runtime.get("hosted_vector_store") is False,
    }
    rag_honesty = scenario_status(
        matrix,
        {"RAG demo evidence", "insufficient evidence", "conflicting evidence"},
    )
    safety_guard = scenario_status(
        matrix,
        {"malicious evidence injection", "no backend request config", "no external LLM URL", "no Doubao", "no hosted vector store"},
    )
    release_blockers = runtime.get("release_blockers") or []
    manual_approval_requirements = {
        "product_admission_required": runtime.get("product_admission") is False,
        "browser_admission_required": runtime.get("browser_admission") is False,
        "release_checkpoint_admission_required": runtime.get("release_checkpoint_admission") is False,
        "phase_4_must_remain_false": runtime.get("phase_4") is False,
        "must_not_approve_in_ad0": True,
    }

    checks = [
        check("model assets committed", all(q4_assets.values()), q4_assets),
        check("real q4 forward", real_forward["inference_smoke_passed"] and real_forward["generated_token_count"] >= 1, real_forward),
        check("readable decode", readable_decode["readable_generation_smoke_passed"] and readable_decode["decoded_text_available"], readable_decode),
        check("QA matrix", matrix.get("ok") is True and matrix.get("fail_count") == 0, {
            "pass_count": matrix.get("pass_count"),
            "fail_count": matrix.get("fail_count"),
            "scenario_count": matrix.get("scenario_count"),
        }),
        check("Vercel preview", preview["vercel_preview_checked"] is True, preview),
        check("bundle <100MB", budget.get("ok") is True and int(budget.get("full_bundle_bytes") or 0) <= MAX_TOTAL_STATIC_BYTES, budget),
        check("no backend/external runtime", all(backend_external.values()), backend_external),
        check("RAG honesty", rag_honesty["ok"], rag_honesty),
        check("safety guard", safety_guard["ok"], safety_guard),
        check("release blockers", bool(release_blockers), {"release_blockers": release_blockers}),
        check("manual approval requirements", all(manual_approval_requirements.values()), manual_approval_requirements),
    ]

    quality_ready = runtime.get("quality_status") not in {"quality_not_ready", None, ""}
    labels: list[str] = []
    if not readable_decode["readable_generation_smoke_passed"] or not readable_decode["decoded_text_available"]:
        labels.append("not_ready_browser_decode_blocked")
    if not quality_ready:
        labels.append("not_ready_quality_blocked")
    if not preview["vercel_preview_checked"]:
        labels.append("not_ready_preview_blocked")
    if not (budget.get("ok") is True and int(budget.get("full_bundle_bytes") or 0) <= MAX_TOTAL_STATIC_BYTES):
        labels.append("not_ready_budget_blocked")

    hard_preconditions_ok = all(
        item["ok"]
        for item in checks
        if item["name"] not in {"Vercel preview", "release blockers", "manual approval requirements"}
    )
    if hard_preconditions_ok and quality_ready and preview["vercel_preview_checked"]:
        labels.append("ready_to_request_product_admission")

    blockers = sorted({label for label in labels if label.startswith("not_ready_")})
    return {
        "ok": True,
        "admission_approved": False,
        "browser_admission": False,
        "product_admission": False,
        "release_checkpoint_admission": False,
        "base": "origin/r28qa1-static-q4-manual-qa",
        "branch": "r28ad0-admission-precheck",
        "labels": labels,
        "ready_to_request_product_admission": "ready_to_request_product_admission" in labels,
        "checks": checks,
        "summary": {
            "hard_preconditions_ok": hard_preconditions_ok,
            "quality_ready": quality_ready,
            "vercel_preview_checked": preview["vercel_preview_checked"],
            "bundle_bytes": int(budget.get("full_bundle_bytes") or 0),
            "bundle_margin_bytes": int(budget.get("margin_bytes") or 0),
            "qa_pass_count": matrix.get("pass_count"),
            "qa_fail_count": matrix.get("fail_count"),
            "generated_token_count": real_forward["generated_token_count"],
            "readable_decode_status": readable_decode["tokenizer_decode_status"],
            "release_blockers": release_blockers,
            "blockers": blockers,
        },
        "manual_approval_requirements": {
            "product_admission": "requires explicit human approval in a later admission gate",
            "browser_admission": "requires explicit human approval in a later browser admission gate",
            "release_checkpoint_admission": "requires explicit human approval after preview and manual QA",
            "ad0_scope": "precheck only; no approval is granted",
        },
        "non_claims": {
            "training": False,
            "new_model_assets": False,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint_admission": False,
        },
    }


def main() -> int:
    report = admission_precheck(run_qa_readable_smoke=False)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
