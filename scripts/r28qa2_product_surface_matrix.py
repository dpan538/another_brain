#!/usr/bin/env python3
"""R28QA2 post-tokenizer product-surface QA matrix.

This is a QA surface only. It does not train, change model assets, approve
product/browser/release admission, or create an answer bank.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
CHAT_ROOT = WEB_ROOT / "another_brain_chat"
STATIC_ROOT = WEB_ROOT / "another_brain"
RUNTIME_MODE_PATH = STATIC_ROOT / "runtime_mode.json"
ASSET_MANIFEST_PATH = STATIC_ROOT / "asset_manifest.json"
MAX_TOTAL_STATIC_BYTES = 100_000_000

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r28qa1_run_qa_matrix import qa_matrix  # noqa: E402
from src.browser_export.r28m1_asset_commit import full_bundle_budget_gate  # noqa: E402


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def run_json_command(command: list[str], timeout: int = 360) -> dict[str, Any]:
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


def scenario(name: str, ok: bool, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "ok": bool(ok),
        "status": "pass" if ok else "fail",
        "details": details or {},
    }


def scenario_from_node(node_report: dict[str, Any], name: str) -> dict[str, Any]:
    for item in node_report.get("scenarios", []):
        if item.get("name") == name:
            return item
    return scenario(name, False, {"missing": True})


def product_surface_matrix(*, run_real_smoke: bool = True) -> dict[str, Any]:
    runtime = read_json(RUNTIME_MODE_PATH)
    manifest = read_json(ASSET_MANIFEST_PATH)
    html = read_text(CHAT_ROOT / "index.html")
    app_js = read_text(CHAT_ROOT / "app.js")
    styles_css = read_text(CHAT_ROOT / "styles.css")
    vercel_json = read_text(ROOT / "vercel.json")
    package_json = read_json(ROOT / "package.json")
    budget = full_bundle_budget_gate()
    qa1 = qa_matrix(run_readable_smoke=False)
    node_command = ["node", "scripts/r28qa2_node_product_surface.mjs"]
    if not run_real_smoke:
        node_command.append("--metadata-only")
    node_report = run_json_command(node_command, timeout=420)

    mobile_accessibility = {
        "mobile_css": "@media (max-width: 720px)" in styles_css and ".composer" in styles_css,
        "aria_live": 'aria-live="polite"' in html,
        "messages_label": 'aria-label="messages"' in html,
        "clear_button": "clear-chat-button" in html,
        "abort_button": "abort-button" in html,
    }
    no_external_runtime = {
        "backend_inference": manifest.get("backend_inference") is False and runtime.get("backend_inference") is False,
        "external_llm_api": manifest.get("external_llm_api") is False and runtime.get("external_llm_api") is False,
        "doubao": manifest.get("doubao") is False and runtime.get("doubao") is False,
        "hosted_vector_store": manifest.get("hosted_vector_store") is False and runtime.get("hosted_vector_store") is False,
    }
    no_product_claim = {
        "product_model": runtime.get("product_model") is False,
        "product_admission": runtime.get("product_admission") is False and manifest.get("product_model_admission") is False,
        "browser_admission": runtime.get("browser_admission") is False and manifest.get("browser_admission") is False,
        "release_checkpoint_admission": runtime.get("release_checkpoint_admission") is False and manifest.get("release_checkpoint_admission") is False,
        "non_product_warning": "non-product-warning" in html or "non-product" in app_js,
    }
    vercel_build_ready = {
        "build_script": package_json.get("scripts", {}).get("build:vercel") is not None,
        "output_directory": '"outputDirectory": "web"' in vercel_json or "web" in vercel_json,
        "chat_route_exists": (CHAT_ROOT / "index.html").exists(),
        "static_budget_ok": budget.get("ok") is True and int(budget.get("full_bundle_bytes") or 0) <= MAX_TOTAL_STATIC_BYTES,
    }

    scenario_names = [
        "readable q4 generation",
        "Chinese-first prompts",
        "RAG sufficient",
        "RAG insufficient",
        "RAG conflict",
        "malicious evidence",
        "adapter local context",
        "fallback quality",
        "no product claim",
    ]
    scenarios = [scenario_from_node(node_report, name) for name in scenario_names]
    scenarios.extend([
        scenario("mobile/accessibility", all(mobile_accessibility.values()), mobile_accessibility),
        scenario("Vercel build config", all(vercel_build_ready.values()), vercel_build_ready),
        scenario("static-only no external runtime", all(no_external_runtime.values()), no_external_runtime),
        scenario("QA1 baseline scenarios remain green", qa1.get("fail_count") == 0 and int(qa1.get("pass_count") or 0) >= 24, {
            "pass_count": qa1.get("pass_count"),
            "fail_count": qa1.get("fail_count"),
            "qa1_report_ok": qa1.get("ok"),
            "note": "QA2 reuses QA1 surface scenarios; older D5 audit coupling is not a QA2 hard blocker.",
        }),
    ])

    failures = [item for item in scenarios if not item["ok"]]
    hard_ok = not failures and bool(node_report.get("ok"))
    readable = scenario_from_node(node_report, "readable q4 generation")
    readable_ok = readable.get("ok") is True
    generated_token_count = int(readable.get("details", {}).get("generated_token_count") or runtime.get("generated_token_count") or 0)
    quality_status = runtime.get("quality_status") or node_report.get("quality_observation", {}).get("runtime_quality_status")
    exact_decode = node_report.get("quality_observation", {}).get("exact_decode") is True or runtime.get("tokenizer_exact_decode") is True

    quality_blocked = not hard_ok or not readable_ok or not exact_decode
    quality_pass = hard_ok and readable_ok and exact_decode and quality_status not in {"quality_not_ready", "", None}
    quality_weak = hard_ok and readable_ok and exact_decode and not quality_pass
    preview_ready = hard_ok and all(vercel_build_ready.values()) and all(no_external_runtime.values())
    admission_not_ready = (
        quality_weak
        or not preview_ready
        or runtime.get("product_admission") is False
        or runtime.get("browser_admission") is False
        or runtime.get("release_checkpoint_admission") is False
    )
    labels = []
    if quality_pass:
        labels.append("quality_pass")
    if quality_weak:
        labels.append("quality_weak")
    if quality_blocked:
        labels.append("quality_blocked")
    if preview_ready:
        labels.append("preview_ready")
    if admission_not_ready:
        labels.append("admission_not_ready")

    return {
        "ok": not quality_blocked,
        "branch": "r28qa2-product-surface-qa",
        "base": "origin/r28gen0-deterministic-generation-policy",
        "quality_pass": quality_pass,
        "quality_weak": quality_weak,
        "quality_blocked": quality_blocked,
        "preview_ready": preview_ready,
        "admission_not_ready": admission_not_ready,
        "labels": labels,
        "scenario_count": len(scenarios),
        "pass_count": len(scenarios) - len(failures),
        "fail_count": len(failures),
        "failures": [item["name"] for item in failures],
        "scenarios": scenarios,
        "node_report": node_report,
        "quality_summary": {
            "runtime_quality_status": quality_status,
            "generated_token_count": generated_token_count,
            "tokenizer_decode_status": runtime.get("tokenizer_decode_status"),
            "exact_decode": exact_decode,
            "readable_generation_smoke_passed": runtime.get("readable_generation_smoke_passed") is True,
            "reason": "quality_not_ready_runtime_marker" if quality_weak else "hard_failure" if quality_blocked else "quality_marker_ready",
        },
        "budget": {
            "full_bundle_bytes": int(budget.get("full_bundle_bytes") or 0),
            "margin_bytes": int(budget.get("margin_bytes") or 0),
            "ok": budget.get("ok") is True,
        },
        "release_blockers": runtime.get("release_blockers") or [],
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
    report = product_surface_matrix(run_real_smoke=True)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
