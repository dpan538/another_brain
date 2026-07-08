#!/usr/bin/env python3
"""R28MERGE2 final pre-merge gate.

This gate is intentionally local-only. It does not train, does not mutate model
assets, does not call a backend, and does not merge anything.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
STATIC_ROOT = WEB_ROOT / "another_brain"
CHAT_ROOT = WEB_ROOT / "another_brain_chat"
RUNTIME_MODE_PATH = STATIC_ROOT / "runtime_mode.json"
ASSET_MANIFEST_PATH = STATIC_ROOT / "asset_manifest.json"
PACKAGE_PATH = ROOT / "package.json"
MAX_TOTAL_STATIC_BYTES = 100_000_000
MAX_Q4_SHARD_BYTES = 25_000_000

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27b0_check_static_only import check_static_only  # noqa: E402
from src.browser_export.r28m1_asset_commit import full_bundle_budget_gate  # noqa: E402

BASE_PRIORITY = [
    "r28rag3-lightweight-profile-rag",
    "r28surf3-anchor-natural-surfaces",
    "r28ux6-minimal-chat-dashboard",
    "r28load0-model-loading-state-machine",
    "r28hotfix2-nonblocking-selfcheck",
]

OUTPUT_LABELS = [
    "merge_ready",
    "preview_ready_not_merge_ready",
    "blocked_runtime",
    "blocked_ui",
    "blocked_budget",
    "blocked_quality",
]


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def run(command: list[str], timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=timeout)


def git_value(args: list[str], fallback: str = "") -> str:
    result = run(["git", *args], timeout=30)
    return result.stdout.strip() if result.returncode == 0 else fallback


def git_ref_exists(ref: str) -> bool:
    result = run(["git", "rev-parse", "--verify", "--quiet", ref], timeout=30)
    return result.returncode == 0


def select_base() -> dict[str, Any]:
    for branch in BASE_PRIORITY:
        remote = f"origin/{branch}"
        if git_ref_exists(remote):
            return {
                "selected": remote,
                "branch": branch,
                "commit": git_value(["rev-parse", remote]),
                "priority": BASE_PRIORITY,
            }
        if git_ref_exists(branch):
            return {
                "selected": branch,
                "branch": branch,
                "commit": git_value(["rev-parse", branch]),
                "priority": BASE_PRIORITY,
            }
    return {"selected": "", "branch": "", "commit": "", "priority": BASE_PRIORITY}


def ok_section(**values: Any) -> dict[str, Any]:
    failures = [key for key, value in values.items() if value is not True]
    return {"ok": not failures, "failures": failures, **values}


def verify_q4_assets(manifest: dict[str, Any]) -> dict[str, Any]:
    q4_shards = [item for item in manifest.get("model_assets", []) if item.get("role") == "q4_shard"]
    failures: list[str] = []
    if manifest.get("model_assets_admitted") is not True:
        failures.append("model_assets_not_admitted")
    if manifest.get("quantization") != "q4":
        failures.append("quantization_not_q4")
    if len(q4_shards) != int(manifest.get("shard_count") or 0):
        failures.append("q4_shard_count_mismatch")
    if len(q4_shards) != 5:
        failures.append("q4_shard_count_not_5")
    for shard in q4_shards:
        path = WEB_ROOT / str(shard.get("path", ""))
        if not path.exists():
            failures.append(f"missing_q4_shard:{shard.get('path')}")
            continue
        if path.stat().st_size != int(shard.get("bytes") or -1):
            failures.append(f"q4_shard_size_mismatch:{shard.get('path')}")
        if path.stat().st_size >= MAX_Q4_SHARD_BYTES:
            failures.append(f"q4_shard_over_25mb:{shard.get('path')}")
    return {
        "ok": not failures,
        "failures": failures,
        "model_assets_admitted": manifest.get("model_assets_admitted") is True,
        "quantization": manifest.get("quantization"),
        "shard_count": len(q4_shards),
        "max_shard_bytes": max((int(item.get("bytes") or 0) for item in q4_shards), default=0),
    }


def verify_q4_forward(runtime: dict[str, Any], *, run_smoke: bool) -> dict[str, Any]:
    declared = ok_section(
        static_q4_mode=runtime.get("model_mode") == "static_q4_experimental",
        inference_smoke_passed=runtime.get("inference_smoke_passed") is True,
        readable_generation_smoke_passed=runtime.get("readable_generation_smoke_passed") is True,
        decoded_text_available=runtime.get("decoded_text_available") is True,
        generated_token_count=int(runtime.get("generated_token_count") or 0) >= 1,
    )
    declared.update(
        {
            "runtime_mode": runtime.get("model_mode"),
            "declared_generated_token_count": int(runtime.get("generated_token_count") or 0),
            "smoke_executed": False,
        }
    )
    if not run_smoke:
        return declared
    result = run(["node", "scripts/r28tok1_node_q4_readable_smoke.mjs"], timeout=420)
    try:
        payload = json.loads(result.stdout) if result.stdout.strip() else {}
    except json.JSONDecodeError as exc:
        payload = {"ok": False, "error": f"json_parse_failed:{exc}", "stdout": result.stdout, "stderr": result.stderr}
    smoke_ok = result.returncode == 0 and payload.get("ok") is True
    declared["smoke_executed"] = True
    declared["smoke_ok"] = smoke_ok
    declared["smoke"] = payload
    if not smoke_ok:
        declared["ok"] = False
        declared.setdefault("failures", []).append("q4_readable_smoke_failed")
    return declared


def verify_exact_tokenizer(runtime: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    tokenizer_assets = manifest.get("tokenizer_assets") or []
    return ok_section(
        runtime_exact=runtime.get("tokenizer_decode_status") == "exact_runtime_tokenizer",
        runtime_exact_decode=runtime.get("tokenizer_exact_decode") is True,
        manifest_exact=manifest.get("tokenizer_exact_decode") is True
        or manifest.get("model_asset_manifest", {}).get("exact_runtime_tokenizer") is True,
        tokenizer_assets_present=len(tokenizer_assets) >= 2,
        tokenizer_blocker_empty=(runtime.get("runtime_tokenizer_blocker") or "") == "",
    )


def verify_self_check_nonblocking() -> dict[str, Any]:
    browser_runtime = read_text(CHAT_ROOT / "browser_runtime.js")
    controller = read_text(ROOT / "src/browser_runtime/loading/model_loading_controller.ts")
    app = read_text(CHAT_ROOT / "app.js")
    return ok_section(
        quick_timeout_1000="R28LOAD0_QUICK_CHECK_TIMEOUT_MS = 1000" in browser_runtime
        and "R28LOAD0_QUICK_CHECK_TIMEOUT_MS = 1000" in controller,
        deep_timeout_8000="R28LOAD0_DEEP_CHECK_TIMEOUT_MS = 8000" in browser_runtime
        and "R28LOAD0_DEEP_CHECK_TIMEOUT_MS = 8000" in controller,
        max_timeout_15000="R28LOAD0_DEEP_CHECK_MAX_TIMEOUT_MS = 15000" in browser_runtime
        and "R28LOAD0_DEEP_CHECK_MAX_TIMEOUT_MS = 15000" in controller,
        worker_path="self_check_worker.js" in browser_runtime,
        cancel_path="cancelSelfCheck" in browser_runtime and "renderCancelledLoading" in app,
        repeated_check_guard="self_check_replaced" in browser_runtime,
        fallback_remains_available="fallback_ready" in browser_runtime and "self_check_cancelled" in app,
    )


def verify_fast_routes() -> dict[str, Any]:
    route_classifier = read_text(ROOT / "src/browser_runtime/router/route_classifier.ts")
    surf3 = read_text(ROOT / "src/browser_runtime/router/r28surf3_surface_composer.ts")
    browser_runtime = read_text(CHAT_ROOT / "browser_runtime.js")
    return ok_section(
        micro_intent_surface="micro_intent_surface" in route_classifier and "micro_intent_surface" in browser_runtime,
        fast_daily_question="fast_daily_question" in route_classifier and "fast_daily_question" in surf3,
        greeting_short="你好，我在。" in surf3 and "你好，我在。" in browser_runtime,
        identity_short="你可以叫我鳄鱼。" in surf3 and "你可以叫我鳄鱼。" in browser_runtime,
        no_model_for_micro="use_model_draft: false" in surf3 and "micro_intent_route_no_model" in browser_runtime,
    )


def verify_ui_surfaces() -> dict[str, Any]:
    html = read_text(CHAT_ROOT / "index.html")
    app = read_text(CHAT_ROOT / "app.js")
    css = read_text(CHAT_ROOT / "styles.css")
    loading_js = read_text(CHAT_ROOT / "loading_screen.js")
    loading_css = read_text(CHAT_ROOT / "loading_screen.css")
    return ok_section(
        loading_screen="model-loading-panel" in html and "正在启动本地小模型" in html,
        loading_steps=all(marker in html for marker in ["checking_manifest", "checking_shards", "checking_tokenizer", "warming_q4", "fallback_ready"]),
        loading_animation="loading-breathe" in loading_css and "loading-brain" in html,
        loading_cancel="loading-cancel-button" in html and "onCancel" in loading_js,
        chat_default='data-ui-mode="chat"' in html and 'class="conversation-pane chat-surface"' in html,
        chat_minimal="chat-form" in html and "message-list" in html and "chat-status-strip" in html,
        dashboard_toggle="mode-dashboard-button" in html and 'setUIMode("dashboard")' in app,
        dashboard_mode="Dashboard Mode 过程摘要" in html and "release-blocker-status" in html,
        mobile_smoke="@media (max-width: 720px)" in css and "@media (max-width: 720px)" in loading_css and "overflow-x: hidden" in css,
        breathing_indicator="ux6-breathing" in css,
        non_product_warning="non-product-warning" in html,
    )


def verify_release_blockers(runtime: dict[str, Any]) -> dict[str, Any]:
    html = read_text(CHAT_ROOT / "index.html")
    app = read_text(CHAT_ROOT / "app.js")
    blockers = runtime.get("release_blockers") or []
    return {
        "ok": bool(blockers) and "release-blocker-status" in html and "release_blockers" in app,
        "failures": [] if blockers and "release-blocker-status" in html and "release_blockers" in app else ["release_blockers_not_visible"],
        "blockers": blockers,
        "visible_in_dashboard": "release-blocker-status" in html and "release_blockers" in app,
    }


def verify_non_claims(runtime: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    expected_false = {
        "runtime_product_model": runtime.get("product_model"),
        "runtime_product_admission": runtime.get("product_admission"),
        "runtime_browser_admission": runtime.get("browser_admission"),
        "runtime_release_checkpoint_admission": runtime.get("release_checkpoint_admission"),
        "runtime_backend_inference": runtime.get("backend_inference"),
        "runtime_external_llm_api": runtime.get("external_llm_api"),
        "runtime_doubao": runtime.get("doubao"),
        "runtime_hosted_vector_store": runtime.get("hosted_vector_store"),
        "runtime_phase_4": runtime.get("phase_4"),
        "manifest_product_model_admission": manifest.get("product_model_admission"),
        "manifest_browser_admission": manifest.get("browser_admission"),
        "manifest_release_checkpoint_admission": manifest.get("release_checkpoint_admission"),
        "manifest_backend_inference": manifest.get("backend_inference"),
        "manifest_external_llm_api": manifest.get("external_llm_api"),
        "manifest_doubao": manifest.get("doubao"),
        "manifest_hosted_vector_store": manifest.get("hosted_vector_store"),
    }
    failures = [key for key, value in expected_false.items() if value is not False]
    html = read_text(CHAT_ROOT / "index.html")
    if "not product model" not in html and "预览工程候选" not in html:
        failures.append("non_product_warning_missing")
    return {"ok": not failures, "failures": failures, "checked_false": expected_false}


def verify_training_gates(*, run_commands: bool) -> dict[str, Any]:
    package = read_json(PACKAGE_PATH)
    scripts = package.get("scripts", {})
    required = ["check:no-training-in-routine-gates", "check:training-approval-markers"]
    missing = [name for name in required if name not in scripts]
    command_results: dict[str, Any] = {}
    if run_commands and not missing:
        for name in required:
            result = run(["npm", "run", name], timeout=180)
            command_results[name] = {
                "ok": result.returncode == 0,
                "returncode": result.returncode,
                "stdout_tail": result.stdout[-1200:],
                "stderr_tail": result.stderr[-1200:],
            }
    command_failures = [name for name, result in command_results.items() if not result["ok"]]
    return {
        "ok": not missing and not command_failures,
        "failures": [f"missing_script:{name}" for name in missing] + [f"command_failed:{name}" for name in command_failures],
        "required_scripts": required,
        "commands_executed": run_commands,
        "command_results": command_results,
    }


def verify_budget() -> dict[str, Any]:
    budget = full_bundle_budget_gate()
    manifest = read_json(ASSET_MANIFEST_PATH)
    failures = list(budget.get("failures") or [])
    if int(manifest.get("full_bundle_estimate_bytes") or 0) > MAX_TOTAL_STATIC_BYTES:
        failures.append("manifest_full_bundle_estimate_over_100mb")
    if int(manifest.get("total_declared_bytes") or 0) > MAX_TOTAL_STATIC_BYTES:
        failures.append("manifest_total_declared_over_100mb")
    return {
        **budget,
        "ok": bool(budget.get("ok")) and not failures,
        "failures": failures,
        "manifest_full_bundle_estimate_bytes": int(manifest.get("full_bundle_estimate_bytes") or 0),
        "manifest_total_declared_bytes": int(manifest.get("total_declared_bytes") or 0),
        "manifest_remaining_bytes_under_100mb": int(manifest.get("remaining_bytes_under_100mb") or 0),
    }


def compute_label(report: dict[str, Any]) -> str:
    if not report["budget"]["ok"] or not report["static_only"]["ok"]:
        return "blocked_budget" if not report["budget"]["ok"] else "blocked_runtime"
    runtime_sections = [
        "q4_assets_admitted",
        "q4_forward_status",
        "exact_tokenizer",
        "self_check_nonblocking",
        "identity_greeting_fast_route",
    ]
    if any(not report[name]["ok"] for name in runtime_sections):
        return "blocked_runtime"
    if not report["ui_surfaces"]["ok"]:
        return "blocked_ui"
    if not report["no_product_claim"]["ok"] or not report["training_gates"]["ok"]:
        return "blocked_quality"
    runtime = report["runtime_summary"]
    has_release_blockers = bool(report["release_blockers_visible"]["blockers"])
    quality_not_ready = runtime.get("quality_status") in {"quality_not_ready", "", None}
    if has_release_blockers or quality_not_ready:
        return "preview_ready_not_merge_ready"
    return "merge_ready"


def final_premerge_gate(*, run_q4_smoke: bool = False, run_training_commands: bool = False) -> dict[str, Any]:
    runtime = read_json(RUNTIME_MODE_PATH)
    manifest = read_json(ASSET_MANIFEST_PATH)
    static_only_failures = check_static_only()
    report: dict[str, Any] = {
        "task": "R28MERGE2",
        "branch_candidate": "r28merge2-final-premerge-gate",
        "auto_merge": False,
        "output_labels": OUTPUT_LABELS,
        "selected_base": select_base(),
        "current_branch": git_value(["branch", "--show-current"]),
        "current_commit": git_value(["rev-parse", "HEAD"]),
        "runtime_summary": {
            "model_mode": runtime.get("model_mode"),
            "quality_status": runtime.get("quality_status"),
            "tokenizer_decode_status": runtime.get("tokenizer_decode_status"),
            "generated_token_count": int(runtime.get("generated_token_count") or 0),
            "release_blockers": runtime.get("release_blockers") or [],
        },
        "asset_summary": {
            "ui_version": manifest.get("ui_version"),
            "ui_build_marker": manifest.get("ui_build_marker"),
            "full_bundle_estimate_bytes": manifest.get("full_bundle_estimate_bytes"),
            "total_declared_bytes": manifest.get("total_declared_bytes"),
            "remaining_bytes_under_100mb": manifest.get("remaining_bytes_under_100mb"),
            "rag_assets": len(manifest.get("rag_assets") or []),
        },
        "budget": verify_budget(),
        "static_only": {"ok": not static_only_failures, "failures": static_only_failures},
        "q4_assets_admitted": verify_q4_assets(manifest),
        "q4_forward_status": verify_q4_forward(runtime, run_smoke=run_q4_smoke),
        "exact_tokenizer": verify_exact_tokenizer(runtime, manifest),
        "self_check_nonblocking": verify_self_check_nonblocking(),
        "identity_greeting_fast_route": verify_fast_routes(),
        "ui_surfaces": verify_ui_surfaces(),
        "release_blockers_visible": verify_release_blockers(runtime),
        "no_product_claim": verify_non_claims(runtime, manifest),
        "training_gates": verify_training_gates(run_commands=run_training_commands),
        "commands_required_for_final_evidence": [
            "npm run build",
            "npm run build:vercel",
            "npm run check:r27b0-static-budget",
            "npm run check:r27b0-static-only",
            "npm run check:no-training-in-routine-gates",
            "npm run check:training-approval-markers",
            "node scripts/r28tok1_node_q4_readable_smoke.mjs",
            "npm run test:r28load0",
            "npm run test:r28ux6",
            "npm run test:r28surf3",
            "npm run test:r28rag3",
            "npm run test:r28merge2",
        ],
        "manual_pr": {
            "base": "main",
            "head": "r28merge2-final-premerge-gate",
            "url": "https://github.com/dpan538/another_brain/pull/new/r28merge2-final-premerge-gate",
        },
    }
    label = compute_label(report)
    report["output_label"] = label
    report["can_preview"] = label in {"merge_ready", "preview_ready_not_merge_ready"}
    report["can_merge"] = label == "merge_ready"
    report["merge_decision"] = "do_not_merge" if not report["can_merge"] else "manual_merge_allowed_after_review"
    report["failures"] = sorted(
        {
            f"{section}:{failure}"
            for section in [
                "budget",
                "static_only",
                "q4_assets_admitted",
                "q4_forward_status",
                "exact_tokenizer",
                "self_check_nonblocking",
                "identity_greeting_fast_route",
                "ui_surfaces",
                "release_blockers_visible",
                "no_product_claim",
                "training_gates",
            ]
            for failure in report[section].get("failures", [])
        }
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-q4-smoke", action="store_true", help="Execute q4 readable generation smoke.")
    parser.add_argument("--run-training-gates", action="store_true", help="Execute no-training command gates.")
    args = parser.parse_args()
    report = final_premerge_gate(run_q4_smoke=args.run_q4_smoke, run_training_commands=args.run_training_gates)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["output_label"] in {"merge_ready", "preview_ready_not_merge_ready"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
