#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "r28merge3" / "reports" / "premerge_gate.json"

LABELS = {
    "merge_ready",
    "preview_ready_not_merge_ready",
    "blocked_q4_mount",
    "blocked_ui",
    "blocked_quality",
    "blocked_budget",
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def read_json(path: Path) -> dict:
    return json.loads(read_text(path))


def check(ok: bool, name: str, details: str = "") -> dict:
    return {"name": name, "ok": bool(ok), "details": details}


def admitted_asset_count(manifest: dict) -> int:
    return len(manifest.get("model_assets", [])) + len(manifest.get("tokenizer_assets", []))


def file_exists_for_asset(web: Path, item: dict) -> bool:
    path = web / item.get("path", "")
    return path.exists() and path.stat().st_size == int(item.get("bytes", path.stat().st_size))


def run_gate(root: Path = ROOT) -> dict:
    web = root / "web"
    index = read_text(web / "another_brain_chat" / "index.html")
    root_index = read_text(web / "index.html") if (web / "index.html").exists() else index
    styles = read_text(web / "another_brain_chat" / "styles.css")
    loading_css = read_text(web / "another_brain_chat" / "loading_screen.css")
    loading_js = read_text(web / "another_brain_chat" / "loading_screen.js")
    app = read_text(web / "another_brain_chat" / "app.js")
    runtime = read_text(web / "another_brain_chat" / "browser_runtime.js")
    manifest = read_json(web / "another_brain" / "asset_manifest.json")
    runtime_mode = read_json(web / "another_brain" / "runtime_mode.json")
    style_profile = read_json(root / "data" / "training_registry" / "r28surf4_style_profile.json")

    model_assets = manifest.get("model_assets", [])
    tokenizer_assets = manifest.get("tokenizer_assets", [])
    q4_shards = [item for item in model_assets if item.get("role") == "q4_shard"]
    asset_files_ok = all(file_exists_for_asset(web, item) for item in model_assets + tokenizer_assets)
    q4_admitted = (
        manifest.get("model_assets_admitted") is True
        and manifest.get("same_origin_only") is True
        and admitted_asset_count(manifest) == 10
        and len(q4_shards) == int(manifest.get("shard_count", 0))
        and asset_files_ok
    )
    q4_mount = all(marker in runtime + app for marker in [
        "mountQ4WithRetry",
        "quickSelfCheckModelPath",
        "Plan B",
        "q4_retry_plan_exhausted",
        "q4 forward:",
    ])
    q4_forward_or_fallback = (
        "q4_forward_ran" in runtime
        and "fallbackReasonStatus" in app
        and "fallback reason" in app
        and "q4_forward_not_confirmed" in runtime
    )
    ui_ok = all(marker in index + styles + loading_css + loading_js + app for marker in [
        'data-ui-mode="chat"',
        'id="chat-mode-button"',
        'id="dashboard-mode-button"',
        'id="process-panel"',
        "data-loading-screen",
        "loading-mascot",
        "R28MERGE3LoadingScreen",
        "@media (max-width: 720px)",
        "overflow-x: hidden",
        "gentle-breathe",
    ])
    quality_ok = (
        "你好，我在。" in runtime
        and "我是鳄鱼，另一个大脑界面。" in runtime
        and "r28surf4-natural-daily-surfaces-v1" in runtime
        and "我是这个本地网页里的另一个大脑界面" not in runtime
        and style_profile.get("excluded_eval") is True
        and style_profile.get("excluded_old_pack_51_100") is True
        and style_profile.get("private_raw_data_used") is False
    )
    budget_ok = (
        int(manifest.get("total_declared_bytes", 0)) < int(manifest.get("max_total_static_bytes", 100000000))
        and int(manifest.get("remaining_bytes_under_100mb", 0)) > 0
    )
    no_product_claim = (
        manifest.get("product_model_admission") is False
        and manifest.get("release_checkpoint_admission") is False
        and runtime_mode.get("product_model") is False
        and "not product model" in runtime
        and "预览工程候选" in index
    )
    release_blockers_visible = "release-blocker-status" in index and "release_blockers" in app
    self_check_nonblocking = (
        "jsonTimeoutMs: 900" in app
        and "self_check_worker.js" in runtime
        and "self_check_timeout" in runtime
        and "activeSelfCheckController" in app
    )

    checks = [
        check(budget_ok, "static_budget", str(manifest.get("remaining_bytes_under_100mb", ""))),
        check(q4_admitted, "q4_assets_admitted", str(admitted_asset_count(manifest))),
        check(runtime_mode.get("model_mode") == "static_q4_experimental", "default_static_q4_attempt"),
        check(q4_mount, "q4_runtime_mount"),
        check(q4_forward_or_fallback, "q4_forward_or_explicit_fallback"),
        check(self_check_nonblocking, "self_check_nonblocking"),
        check(ui_ok, "loading_chat_dashboard_mobile_ui"),
        check(quality_ok, "short_natural_identity_greeting"),
        check(no_product_claim, "no_product_claim"),
        check(release_blockers_visible, "release_blockers_visible"),
        check(
            "/another_brain_chat/app.js?v=r28merge3-final-premerge-gate" in index
            or "/another_brain_chat/app.js?v=r28merge3-final-premerge-gate" in root_index
            or "/another_brain_chat/app.js?v=r28p0-q4-mount-timeout-fix" in index
            or "/another_brain_chat/app.js?v=r28p0-q4-mount-timeout-fix" in root_index,
            "merge3_versioned_app",
        ),
    ]
    failures = [item["name"] for item in checks if not item["ok"]]
    if not budget_ok:
        label = "blocked_budget"
    elif not q4_admitted or not q4_mount or not q4_forward_or_fallback:
        label = "blocked_q4_mount"
    elif not ui_ok or not self_check_nonblocking:
        label = "blocked_ui"
    elif not quality_ok or not no_product_claim:
        label = "blocked_quality"
    else:
        label = "preview_ready_not_merge_ready"
    merge_ready = label == "merge_ready"
    report = {
        "ok": not failures,
        "label": label,
        "merge_ready": merge_ready,
        "preview_ready": label == "preview_ready_not_merge_ready" or merge_ready,
        "base_priority_used": "r28surf4-natural-daily-surfaces_with_ship0_runtime_and_ux7_surface",
        "checks": checks,
        "failures": failures,
        "q4_asset_fetch_status": "pass" if q4_admitted else "fail",
        "q4_runtime_mount_status": "pass" if q4_mount else "fail",
        "q4_forward_status": "forward_or_explicit_fallback",
        "bundle_total_declared_bytes": manifest.get("total_declared_bytes"),
        "remaining_bytes_under_100mb": manifest.get("remaining_bytes_under_100mb"),
        "admittedStaticLlmAssets": admitted_asset_count(manifest),
        "non_claims": {
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "training": False,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
        },
    }
    assert report["label"] in LABELS
    return report


def main() -> int:
    report = run_gate(ROOT)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["preview_ready"] and report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
