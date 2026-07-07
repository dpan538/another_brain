#!/usr/bin/env python3
"""R28QA2 post-tokenizer and post-GEN1 product-surface QA matrix.

QA only: no training, no model asset changes, no backend/external LLM runtime,
no hosted vector store, and no product/browser/release admission.
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

from src.browser_export.r28m1_asset_commit import full_bundle_budget_gate  # noqa: E402


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def run_json_command(command: list[str], timeout: int = 420) -> dict[str, Any]:
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
    return {"name": name, "ok": bool(ok), "status": "pass" if ok else "fail", "details": details or {}}


def scenario_from_node(node_report: dict[str, Any], name: str) -> dict[str, Any]:
    for item in node_report.get("scenarios", []):
        if item.get("name") == name:
            return item
    return scenario(name, False, {"missing": True})


def _label_report(
    *,
    tokenizer_ok: bool,
    runtime_ok: bool,
    budget_ok: bool,
    quality_blocker: bool,
    surface_ok: bool,
) -> tuple[str, list[str]]:
    labels: list[str] = []
    if not tokenizer_ok:
        labels.append("blocked_tokenizer")
    if not runtime_ok or not surface_ok:
        labels.append("blocked_runtime")
    if not budget_ok:
        labels.append("blocked_budget")
    if labels:
        return labels[0], labels
    if quality_blocker:
        return "preview_ready_with_quality_blocker", ["preview_ready_with_quality_blocker"]
    return "preview_ready", ["preview_ready"]


def product_surface_matrix(*, run_real_smoke: bool = True) -> dict[str, Any]:
    runtime = read_json(RUNTIME_MODE_PATH)
    manifest = read_json(ASSET_MANIFEST_PATH)
    html = read_text(CHAT_ROOT / "index.html")
    app_js = read_text(CHAT_ROOT / "app.js")
    styles_css = read_text(CHAT_ROOT / "styles.css")
    vercel_json = read_text(ROOT / "vercel.json")
    package_json = read_json(ROOT / "package.json")
    budget = full_bundle_budget_gate()

    node_command = ["node", "scripts/r28qa2_node_product_surface.mjs"]
    if not run_real_smoke:
        node_command.append("--metadata-only")
    node_report = run_json_command(node_command)

    tokenizer_status = {
        "tokenizer": runtime.get("tokenizer"),
        "decode_status": runtime.get("tokenizer_decode_status"),
        "exact_decode": runtime.get("tokenizer_exact_decode") is True,
        "runtime_tokenizer_blocker": runtime.get("runtime_tokenizer_blocker") or "",
        "asset_manifest_exact_runtime_tokenizer": manifest.get("tokenizer_exact_decode") is True
        or manifest.get("model_asset_manifest", {}).get("exact_runtime_tokenizer") is True,
    }
    tokenizer_ok = (
        tokenizer_status["decode_status"] == "exact_runtime_tokenizer"
        and tokenizer_status["exact_decode"] is True
        and tokenizer_status["runtime_tokenizer_blocker"] == ""
    )

    readable = scenario_from_node(node_report, "readable q4 generation")
    runtime_ok = (
        node_report.get("ok") is True
        and readable.get("ok") is True
        and (
            readable.get("details", {}).get("decoded_text_available") is True
            or readable.get("details", {}).get("metadata_only") is True
            or runtime.get("decoded_text_available") is True
        )
        and int(readable.get("details", {}).get("generated_token_count") or runtime.get("generated_token_count") or 0) >= 40
    )

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
        "release_checkpoint_admission": runtime.get("release_checkpoint_admission") is False
        and manifest.get("release_checkpoint_admission") is False,
        "non_product_warning": "non-product-warning" in html or "non-product" in app_js,
    }
    vercel_build_ready = {
        "build_script": package_json.get("scripts", {}).get("build:vercel") is not None,
        "output_directory": '"outputDirectory": "web"' in vercel_json or "web" in vercel_json,
        "chat_route_exists": (CHAT_ROOT / "index.html").exists(),
    }
    budget_ok = budget.get("ok") is True and int(budget.get("full_bundle_bytes") or 0) <= MAX_TOTAL_STATIC_BYTES

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
    scenarios.extend(
        [
            scenario("exact tokenizer status", tokenizer_ok, tokenizer_status),
            scenario("mobile/accessibility", all(mobile_accessibility.values()), mobile_accessibility),
            scenario("Vercel build config", all(vercel_build_ready.values()), vercel_build_ready),
            scenario("static-only no external runtime", all(no_external_runtime.values()), no_external_runtime),
            scenario("bundle under 100MB", budget_ok, {
                "full_bundle_bytes": int(budget.get("full_bundle_bytes") or 0),
                "margin_bytes": int(budget.get("margin_bytes") or 0),
                "max_total_static_bytes": MAX_TOTAL_STATIC_BYTES,
            }),
        ]
    )

    failures = [item for item in scenarios if not item["ok"]]
    quality_status = runtime.get("quality_status") or node_report.get("quality_observation", {}).get("runtime_quality_status")
    quality_blocker = quality_status in {"quality_not_ready", "", None}
    surface_ok = len(failures) == 0 and all(no_external_runtime.values()) and all(no_product_claim.values())
    output_label, labels = _label_report(
        tokenizer_ok=tokenizer_ok,
        runtime_ok=runtime_ok,
        budget_ok=budget_ok,
        quality_blocker=quality_blocker,
        surface_ok=surface_ok,
    )

    return {
        "ok": output_label in {"preview_ready", "preview_ready_with_quality_blocker"},
        "branch": "r28qa2-product-surface-qa",
        "base": "origin/r28gen1-deterministic-generation",
        "output_label": output_label,
        "labels": labels,
        "scenario_count": len(scenarios),
        "pass_count": len(scenarios) - len(failures),
        "fail_count": len(failures),
        "failures": [item["name"] for item in failures],
        "scenarios": scenarios,
        "node_report": node_report,
        "quality_summary": {
            "runtime_quality_status": quality_status,
            "quality_blocker": quality_blocker,
            "generated_token_count": int(readable.get("details", {}).get("generated_token_count") or runtime.get("generated_token_count") or 0),
            "tokenizer_decode_status": tokenizer_status["decode_status"],
            "exact_decode": tokenizer_ok,
            "readable_generation_smoke_passed": runtime.get("readable_generation_smoke_passed") is True,
        },
        "budget": {
            "full_bundle_bytes": int(budget.get("full_bundle_bytes") or 0),
            "margin_bytes": int(budget.get("margin_bytes") or 0),
            "ok": budget_ok,
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
