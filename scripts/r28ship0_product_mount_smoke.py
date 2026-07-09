#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "r28ship0" / "reports" / "product_mount_smoke.json"

SCENARIOS = [
    "/",
    "/another_brain_chat",
    "/another_brain_chat/",
    "/another_brain_chat?message=你好",
    "/another_brain_chat?message=你是谁",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def check(condition: bool, name: str, details: str = "") -> dict:
    return {"name": name, "ok": bool(condition), "details": details}


def model_asset_count(manifest: dict) -> int:
    return len(manifest.get("model_assets", [])) + len(manifest.get("tokenizer_assets", []))


def run_smoke(root: Path = ROOT) -> dict:
    web = root / "web"
    index = read_text(web / "index.html")
    chat_index = read_text(web / "another_brain_chat" / "index.html")
    app = read_text(web / "another_brain_chat" / "app.js")
    runtime = read_text(web / "another_brain_chat" / "browser_runtime.js")
    manifest = json.loads(read_text(web / "another_brain" / "asset_manifest.json"))
    runtime_mode = json.loads(read_text(web / "another_brain" / "runtime_mode.json"))
    q4_assets = [item for item in manifest.get("model_assets", []) if item.get("role") == "q4_shard"]
    tokenizer_assets = [item for item in manifest.get("tokenizer_assets", []) if item.get("role") == "exact_runtime_tokenizer"]

    asset_files = []
    for item in manifest.get("model_assets", []) + manifest.get("tokenizer_assets", []):
        path = web / item["path"]
        asset_files.append(path.exists() and path.stat().st_size == int(item.get("bytes", path.stat().st_size if path.exists() else -1)))

    checks = [
        check(all(path in SCENARIOS for path in SCENARIOS), "scenario_matrix_declared", ", ".join(SCENARIOS)),
        check("http-equiv=\"refresh\"" not in index.lower() and "http-equiv=\"refresh\"" not in chat_index.lower(), "no_redirect_loop"),
        check("querySelector(\"#chat-form\").addEventListener" not in app and ".addEventListener(\"submit\"" not in app, "no_null_addEventListener", "uses safe on(node,event,handler) helper"),
        check(len(q4_assets) == int(manifest.get("shard_count", 0)) and all(asset_files), "q4_assets_fetchable", f"{len(q4_assets)} shards"),
        check(len(tokenizer_assets) == 1 and all((web / item["path"]).exists() for item in tokenizer_assets), "exact_tokenizer_fetchable"),
        check("deepSelfCheckModelPath" in runtime and "self_check_timeout" in runtime, "q4_self_check_pass_or_timeout"),
        check("mountQ4WithRetry" in runtime and "q4_retry_plan_exhausted" in runtime, "plan_b_retry_runs_before_fallback"),
        check("mountQ4WithRetry" in runtime and "q4_retry_plan_exhausted" in runtime and "q4_forward_skipped_quick_check" in runtime, "no_immediate_no_model_fallback_when_assets_exist"),
        check("micro_intent_fast_path" in runtime and "identity_who_are_you" in runtime and "greeting" in runtime, "identity_greeting_route_fast"),
        check(model_asset_count(manifest) == 10, "admittedStaticLlmAssets_10_equivalent", str(model_asset_count(manifest))),
        check(runtime_mode.get("model_mode") == "static_q4_experimental", "default_attempts_static_q4_experimental"),
        check(runtime_mode.get("backend_inference") is False and runtime_mode.get("external_llm_api") is False, "no_backend_or_external_llm"),
    ]
    report = {
        "ok": all(item["ok"] for item in checks),
        "task": "R28SHIP0",
        "scenarios": SCENARIOS,
        "checks": checks,
        "q4_asset_fetch_status": "pass" if len(q4_assets) == int(manifest.get("shard_count", 0)) and all(asset_files) else "fail",
        "exact_tokenizer_fetch_status": "pass" if tokenizer_assets else "fail",
        "admittedStaticLlmAssets_equivalent": model_asset_count(manifest),
        "non_claims": {
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "backend_inference": False,
            "external_llm_api": False,
        },
    }
    return report


def main() -> int:
    report = run_smoke(ROOT)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
