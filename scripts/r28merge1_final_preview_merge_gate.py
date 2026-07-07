#!/usr/bin/env python3
"""R28MERGE1 final preview and merge gate.

Static/pre-merge only. This script does not train, modify model assets, call a
backend, call external LLM APIs, call Doubao, or approve product/browser/release
admission.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
STATIC_ROOT = WEB / "another_brain"
CHAT_ROOT = WEB / "another_brain_chat"
REPORT_PATH = ROOT / "artifacts" / "r28merge1" / "final_preview_merge_gate.json"
MAX_TOTAL_STATIC_BYTES = 100_000_000
OUTPUT_ENUM = (
    "merge_ready",
    "preview_ready_not_merge_ready",
    "blocked_runtime",
    "blocked_ui",
    "blocked_budget",
)
SELECTED_BASE = "origin/r28ux5-chat-dashboard-split"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r28stab0_runtime_soak import inspect_q4_assets, run_route_latency_probe, source_health_checks  # noqa: E402
from scripts.r28stab0_static_route_matrix import build_static_route_matrix  # noqa: E402
from src.browser_export.r28m1_asset_commit import full_bundle_budget_gate  # noqa: E402


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def git_changed_paths() -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{SELECTED_BASE}...HEAD"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    committed = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    status = subprocess.run(
        ["git", "status", "--porcelain=v1"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    worktree: list[str] = []
    if status.returncode == 0:
        for line in status.stdout.splitlines():
            if not line.strip():
                continue
            path = line[3:].strip()
            if " -> " in path:
                path = path.split(" -> ", 1)[1].strip()
            if path:
                worktree.append(path)
    return sorted(set(committed + worktree))


def runtime_soak_snapshot() -> dict[str, Any] | None:
    path = ROOT / "artifacts" / "r28stab0" / "reports" / "runtime_soak_report.json"
    if not path.exists():
        return None
    try:
        return read_json(path)
    except json.JSONDecodeError:
        return None


def forbidden_changed_paths(paths: list[str]) -> list[str]:
    forbidden_substrings = (
        "data/public_ingestion/",
        "training/llm_corpus/",
        "training/current/",
        "training/from_scratch/",
        "model_assets/r28m1/shards/",
        ".docx",
        ".pdf",
        ".safetensors",
        ".ckpt",
        ".pth",
        ".pt",
    )
    return [path for path in paths if any(marker in path for marker in forbidden_substrings)]


def q4_forward_status(runtime: dict[str, Any], soak: dict[str, Any] | None) -> dict[str, Any]:
    if soak:
        return {
            "ok": soak.get("q4_forward_pass") is True,
            "source": "r28stab0_runtime_soak_report",
            "tokens_generated": int(soak.get("tokens_generated_min") or 0),
            "details": soak.get("q4_forward") or {},
        }
    tokens = int(runtime.get("generated_token_count") or 0)
    ok = runtime.get("inference_smoke_passed") is True and runtime.get("readable_generation_smoke_passed") is True and tokens >= 1
    return {
        "ok": ok,
        "source": "runtime_mode_static_smoke_metadata",
        "tokens_generated": tokens,
        "details": {
            "inference_smoke_passed": runtime.get("inference_smoke_passed") is True,
            "readable_generation_smoke_passed": runtime.get("readable_generation_smoke_passed") is True,
            "generated_token_count": tokens,
        },
    }


def build_final_preview_merge_gate() -> dict[str, Any]:
    runtime = read_json(STATIC_ROOT / "runtime_mode.json")
    manifest = read_json(STATIC_ROOT / "asset_manifest.json")
    html = read_text(CHAT_ROOT / "index.html")
    app = read_text(CHAT_ROOT / "app.js")
    styles = read_text(CHAT_ROOT / "styles.css")
    package_json = read_json(ROOT / "package.json")

    budget = full_bundle_budget_gate()
    route_matrix = build_static_route_matrix(write=False)
    q4_assets = inspect_q4_assets()
    source_health = source_health_checks()
    latency = run_route_latency_probe()
    soak = runtime_soak_snapshot()
    q4_forward = q4_forward_status(runtime, soak)
    changed_paths = git_changed_paths()

    exact_tokenizer = (
        runtime.get("tokenizer_decode_status") == "exact_runtime_tokenizer"
        and runtime.get("tokenizer_exact_decode") is True
        and manifest.get("tokenizer_exact_decode") is True
    )
    identity_fast = latency.get("identity", {}).get("max_ms", 999) < 100
    greeting_fast = latency.get("greeting", {}).get("max_ms", 999) < 100
    ui_mobile_desktop = all(
        [
            'data-ui-mode="chat"' in html,
            'id="dashboard-mode-button"' in html,
            "process-panel dashboard-only" in html or 'dashboard-only" id="process-panel' in html,
            "@media (max-width: 720px)" in styles,
            "model-loading-panel" in html,
            "loading-cancel-button" in html,
            "setUiMode(\"dashboard\")" in app,
        ]
    )
    no_product_claim = all(
        [
            "not product" in html,
            runtime.get("product_model") is False,
            runtime.get("product_admission") is False,
            runtime.get("browser_admission") is False,
            runtime.get("release_checkpoint_admission") is False,
            manifest.get("product_model_admission") is False,
            manifest.get("browser_admission") is False,
            manifest.get("release_checkpoint_admission") is False,
        ]
    )
    release_blockers = runtime.get("release_blockers") if isinstance(runtime.get("release_blockers"), list) else []
    release_blockers_visible = "Release Blockers" in html and len(release_blockers) >= 1
    no_external_runtime = all(
        [
            runtime.get("backend_inference") is False,
            runtime.get("external_llm_api") is False,
            runtime.get("doubao") is False,
            runtime.get("hosted_vector_store") is False,
            manifest.get("backend_inference") is False,
            manifest.get("external_llm_api") is False,
            manifest.get("doubao") is False,
            manifest.get("hosted_vector_store") is False,
        ]
    )
    no_training_surface = not forbidden_changed_paths(changed_paths)

    check_results = {
        "build": "run_separately",
        "build_vercel": "run_separately",
        "static_budget": budget.get("ok") is True and int(budget.get("full_bundle_bytes") or 0) < MAX_TOTAL_STATIC_BYTES,
        "static_only": "run_separately",
        "no_training_gates": "run_separately",
        "no_training_surface_changed": no_training_surface,
        "q4_assets_admitted": manifest.get("model_assets_admitted") is True and q4_assets.get("ok") is True,
        "q4_forward_status": q4_forward["ok"],
        "exact_tokenizer": exact_tokenizer,
        "self_check_nonblocking": source_health.get("self_check_nonblocking") is True
        and source_health.get("self_check_timeout_recovery") is True,
        "identity_route_fast": identity_fast,
        "greeting_route_fast": greeting_fast,
        "ui_mobile_desktop_smoke": ui_mobile_desktop and route_matrix.get("ok") is True,
        "no_product_claim": no_product_claim,
        "release_blockers_visible": release_blockers_visible,
        "no_backend_external_runtime": no_external_runtime,
    }

    runtime_blockers = [
        name
        for name in [
            "q4_assets_admitted",
            "q4_forward_status",
            "exact_tokenizer",
            "self_check_nonblocking",
            "identity_route_fast",
            "greeting_route_fast",
            "no_backend_external_runtime",
        ]
        if check_results[name] is not True
    ]
    ui_blockers = [
        name for name in ["ui_mobile_desktop_smoke", "no_product_claim", "release_blockers_visible"] if check_results[name] is not True
    ]
    budget_blockers = [] if check_results["static_budget"] is True else ["static_budget"]
    safety_blockers = [] if no_training_surface else ["forbidden_training_or_model_path_changed"]
    merge_blockers = list(release_blockers)
    if runtime.get("quality_status") != "quality_ready":
        merge_blockers.append(f"quality_status:{runtime.get('quality_status') or 'missing'}")
    if runtime.get("product_admission") is not True:
        merge_blockers.append("product_admission_not_done")
    if runtime.get("browser_admission") is not True:
        merge_blockers.append("browser_admission_not_done")
    if runtime.get("release_checkpoint_admission") is not True:
        merge_blockers.append("release_checkpoint_admission_not_done")
    merge_blockers = sorted(set(merge_blockers))

    if budget_blockers:
        output = "blocked_budget"
    elif runtime_blockers or safety_blockers:
        output = "blocked_runtime"
    elif ui_blockers:
        output = "blocked_ui"
    elif merge_blockers:
        output = "preview_ready_not_merge_ready"
    else:
        output = "merge_ready"

    return {
        "task": "R28MERGE1",
        "selected_base": SELECTED_BASE,
        "output": output,
        "merge_ready": output == "merge_ready",
        "preview_ready": output in {"merge_ready", "preview_ready_not_merge_ready"},
        "auto_merge": False,
        "checks": check_results,
        "blockers": {
            "runtime": runtime_blockers,
            "ui": ui_blockers,
            "budget": budget_blockers,
            "safety": safety_blockers,
            "merge": merge_blockers,
        },
        "bundle": {
            "full_bundle_bytes": int(budget.get("full_bundle_bytes") or manifest.get("full_bundle_estimate_bytes") or 0),
            "remaining_bytes_under_100mb": int(budget.get("margin_bytes") or manifest.get("remaining_bytes_under_100mb") or 0),
            "max_total_static_bytes": MAX_TOTAL_STATIC_BYTES,
        },
        "q4": {
            "assets": {
                "ok": q4_assets.get("ok") is True,
                "q4_shard_count": q4_assets.get("q4_shard_count"),
                "total_model_asset_bytes": q4_assets.get("total_model_asset_bytes"),
            },
            "forward": q4_forward,
            "exact_tokenizer": exact_tokenizer,
        },
        "latency": {
            "identity_route_max_ms": latency.get("identity", {}).get("max_ms"),
            "greeting_route_max_ms": latency.get("greeting", {}).get("max_ms"),
        },
        "ui": {
            "chat_mode_default": 'data-ui-mode="chat"' in html,
            "dashboard_toggle_visible": 'id="dashboard-mode-button"' in html,
            "mobile_css": "@media (max-width: 720px)" in styles,
            "loading_cancel_visible": "loading-cancel-button" in html,
            "release_blockers_visible": release_blockers_visible,
        },
        "runtime": {
            "ui_version": runtime.get("ui_version"),
            "prelaunch_stage": runtime.get("prelaunch_stage"),
            "quality_status": runtime.get("quality_status"),
            "release_blockers": release_blockers,
            "non_claims": manifest.get("non_claims") or {},
        },
        "changed_path_count": len(changed_paths),
        "forbidden_changed_paths": forbidden_changed_paths(changed_paths),
        "expected_validation_commands": [
            "npm run test:r28merge1",
            "npm run test:r28ux5",
            "npm run test:r28stab0",
            "python3 scripts/r28stab0_static_route_matrix.py",
            "python3 scripts/r28stab0_runtime_soak.py",
            "python3 scripts/r28d8_assert_static_llm_assets_admitted.py",
            "npm run test:r28d8",
            "npm run build",
            "npm run build:vercel",
            "npm run check:r27b0-static-budget",
            "npm run check:r27b0-static-only",
            "npm run check:no-training-in-routine-gates",
            "npm run check:training-approval-markers",
            "git diff --check",
            "git diff --cached --check",
            "git show --check HEAD",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="write JSON report to artifacts/r28merge1")
    args = parser.parse_args()
    report = build_final_preview_merge_gate()
    if args.write:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["output"] in OUTPUT_ENUM else 2


if __name__ == "__main__":
    raise SystemExit(main())
