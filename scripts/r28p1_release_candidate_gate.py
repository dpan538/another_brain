#!/usr/bin/env python3
"""R28P1 release-candidate gate.

This gate intentionally validates the demo/static package only. It does not
perform product, browser, release-checkpoint, or model-asset admission.
"""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27b0_check_static_only import check_static_only
from scripts.r27b1c_vercel_rehearsal import route_smoke
from scripts.r27b4_bundle_report import make_bundle_report
from scripts.r27e0_acceptance_check import run_node_runtime_smoke
from src.product_prelaunch.r28p1_intake import (
    ARTIFACT_ROOT,
    MAX_STATIC_BYTES,
    REQUIRED_RELEASE_BLOCKERS,
    build_prelaunch_intake,
    classify_tracked_forbidden_assets,
    read_json,
    tracked_files,
    write_json,
)

RUNTIME_MODE_PATH = ROOT / "web" / "another_brain" / "runtime_mode.json"
ASSET_MANIFEST_PATH = ROOT / "web" / "another_brain" / "asset_manifest.json"
CHAT_INDEX_PATH = ROOT / "web" / "another_brain_chat" / "index.html"
CHAT_APP_PATH = ROOT / "web" / "another_brain_chat" / "app.js"
CHAT_RUNTIME_PATH = ROOT / "web" / "another_brain_chat" / "browser_runtime.js"
CONTEXT_BRIDGE_PATH = ROOT / "web" / "another_brain_chat" / "context_bridge.js"

GATE_CHECK_IDS = [
    "npm_run_build_passes",
    "npm_run_build_vercel_passes",
    "bundle_under_100mb",
    "static_only_pass",
    "no_backend_inference",
    "no_external_llm",
    "no_doubao",
    "no_hosted_vector_store",
    "no_model_assets_committed",
    "no_tokenizer_artifacts_committed",
    "no_exported_shards_committed",
    "no_product_model_claim",
    "no_browser_admission_claim",
    "no_release_checkpoint_claim",
    "chat_route_smoke",
    "rag_demo_smoke",
    "adapter_bridge_smoke",
    "asset_cache_smoke",
    "non_product_warning_visible",
    "candidate_status_visible",
    "release_blockers_visible",
]


@dataclass(frozen=True)
class GateResult:
    id: str
    passed: bool
    details: dict


def run_command(command: list[str]) -> dict:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "stdout_tail": result.stdout[-1800:],
        "stderr_tail": result.stderr[-1800:],
    }


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def runtime_context() -> dict:
    return {
        "runtime": read_json(RUNTIME_MODE_PATH),
        "manifest": read_json(ASSET_MANIFEST_PATH),
        "html": read_text(CHAT_INDEX_PATH),
        "app": read_text(CHAT_APP_PATH),
        "browser_runtime": read_text(CHAT_RUNTIME_PATH),
        "context_bridge": read_text(CONTEXT_BRIDGE_PATH),
    }


def run_adapter_bridge_smoke() -> dict:
    script = r"""
import { createLocalContextBridge } from './web/another_brain_chat/context_bridge.js';

const bridge = createLocalContextBridge();
const result = bridge.importText(JSON.stringify({
  packet_type: 'MemoryContextPacket',
  source_type: 'manual_json',
  source_label: 'R28P1 local QA packet',
  content: 'R28P1 adapter bridge smoke stays local-session only.',
  evidence: [],
  privacy_scope: 'local_session_only',
  allowed_for_training: false,
  created_at_client: '2026-07-07T00:00:00.000Z',
  provenance: { qa: 'r28p1' }
}));
console.log(JSON.stringify({
  ok: result.ok,
  failures: result.failures,
  summary: bridge.summary()
}));
"""
    result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        return {"ok": False, "returncode": result.returncode, "stderr_tail": result.stderr[-1200:]}
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        return {"ok": False, "error": f"invalid_json:{error}", "stdout_tail": result.stdout[-1200:]}
    return payload


def run_asset_cache_smoke() -> dict:
    script = r"""
import { BrowserChatRuntime } from './web/another_brain_chat/browser_runtime.js';

const runtime = new BrowserChatRuntime({
  mode: 'candidate_manifest_experimental',
  deliveryConfig: {
    delivery_mode: 'demo_static',
    rag_mode: 'static_demo',
    backend_inference: false,
    external_llm_api: false,
    product_model: false
  }
});
runtime.capabilities.worker_available = false;
const loaded = await runtime.load();
console.log(JSON.stringify({
  ok: loaded.product_model === false && loaded.asset_status.verification === 'no_model_assets',
  loaded
}));
"""
    result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        return {"ok": False, "returncode": result.returncode, "stderr_tail": result.stderr[-1200:]}
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        return {"ok": False, "error": f"invalid_json:{error}", "stdout_tail": result.stdout[-1200:]}
    return payload


def claim_checks(context: dict) -> dict:
    runtime = context["runtime"]
    return {
        "product_model_false": runtime.get("product_model") is False and runtime.get("product_admission") is False,
        "browser_admission_false": runtime.get("browser_admission") is False,
        "release_checkpoint_false": runtime.get("release_checkpoint") is False,
        "phase_4_false": runtime.get("phase_4") is False,
    }


def evaluate_release_candidate_gate() -> dict:
    intake = build_prelaunch_intake()
    context = runtime_context()
    bundle = make_bundle_report()
    static_failures = check_static_only()
    files = tracked_files()
    forbidden = classify_tracked_forbidden_assets(files)
    route = route_smoke()
    rag = run_node_runtime_smoke()
    adapter = run_adapter_bridge_smoke()
    asset_cache = run_asset_cache_smoke()
    claims = claim_checks(context)
    html_app_runtime = "\n".join([context["html"], context["app"], context["browser_runtime"], context["context_bridge"]]).lower()
    runtime = context["runtime"]
    manifest = context["manifest"]

    build = run_command(["npm", "run", "build"])
    build_vercel = run_command(["npm", "run", "build:vercel"])

    checks: dict[str, GateResult] = {
        "npm_run_build_passes": GateResult("npm_run_build_passes", build["ok"], build),
        "npm_run_build_vercel_passes": GateResult("npm_run_build_vercel_passes", build_vercel["ok"], build_vercel),
        "bundle_under_100mb": GateResult("bundle_under_100mb", bundle.get("ok") is True and int(bundle.get("margin_bytes", -1)) >= 0, bundle),
        "static_only_pass": GateResult("static_only_pass", not static_failures, {"failures": static_failures}),
        "no_backend_inference": GateResult(
            "no_backend_inference",
            runtime.get("backend_inference") is False and manifest.get("backend_inference") is False and not static_failures,
            {"runtime_backend_inference": runtime.get("backend_inference"), "manifest_backend_inference": manifest.get("backend_inference"), "static_failures": static_failures},
        ),
        "no_external_llm": GateResult("no_external_llm", runtime.get("external_llm_api") is False and "api.openai.com" not in html_app_runtime, {"external_llm_api": runtime.get("external_llm_api")}),
        "no_doubao": GateResult("no_doubao", "doubao" not in html_app_runtime, {"scanned": "chat_shell_runtime_surfaces"}),
        "no_hosted_vector_store": GateResult("no_hosted_vector_store", runtime.get("hosted_vector_store") is False and manifest.get("external_runtime_dependency") is False, {"hosted_vector_store": runtime.get("hosted_vector_store"), "external_runtime_dependency": manifest.get("external_runtime_dependency")}),
        "no_model_assets_committed": GateResult("no_model_assets_committed", not forbidden["model_assets"], {"model_assets": forbidden["model_assets"]}),
        "no_tokenizer_artifacts_committed": GateResult("no_tokenizer_artifacts_committed", not forbidden["tokenizer_artifacts"], {"tokenizer_artifacts": forbidden["tokenizer_artifacts"], "allowed_legacy_fixtures": forbidden["allowed_legacy_fixtures"]}),
        "no_exported_shards_committed": GateResult("no_exported_shards_committed", not forbidden["exported_or_sharded_assets"], {"exported_or_sharded_assets": forbidden["exported_or_sharded_assets"]}),
        "no_product_model_claim": GateResult("no_product_model_claim", claims["product_model_false"], claims),
        "no_browser_admission_claim": GateResult("no_browser_admission_claim", claims["browser_admission_false"], claims),
        "no_release_checkpoint_claim": GateResult("no_release_checkpoint_claim", claims["release_checkpoint_false"], claims),
        "chat_route_smoke": GateResult("chat_route_smoke", route.get("ok") is True, route),
        "rag_demo_smoke": GateResult("rag_demo_smoke", rag.get("ok") is True and rag.get("chinese", {}).get("evidence_status") == "sufficient", rag),
        "adapter_bridge_smoke": GateResult("adapter_bridge_smoke", adapter.get("ok") is True and adapter.get("summary", {}).get("packet_count") == 1, adapter),
        "asset_cache_smoke": GateResult("asset_cache_smoke", asset_cache.get("ok") is True, asset_cache),
        "non_product_warning_visible": GateResult("non_product_warning_visible", "non-product-warning" in context["html"] and "non_product_warning" in runtime, {"html_marker": "non-product-warning" in context["html"], "runtime_warning": runtime.get("non_product_warning")}),
        "candidate_status_visible": GateResult("candidate_status_visible", "candidate-route-status" in context["html"] and runtime.get("candidate_route") == "product_path_engineering_candidate" and intake.get("metadata_binding_present") is True, {"candidate_route": runtime.get("candidate_route"), "metadata_binding_present": intake.get("metadata_binding_present")}),
        "release_blockers_visible": GateResult("release_blockers_visible", "release-blocker-status" in context["html"] and all(blocker in runtime.get("release_blockers", []) for blocker in REQUIRED_RELEASE_BLOCKERS), {"release_blockers": runtime.get("release_blockers", [])}),
    }
    missing_ids = [check_id for check_id in GATE_CHECK_IDS if check_id not in checks]
    results = [checks[check_id] for check_id in GATE_CHECK_IDS if check_id in checks]
    failed = [result.id for result in results if not result.passed] + [f"missing_check:{check_id}" for check_id in missing_ids]

    report = {
        "ok": not failed,
        "failed": failed,
        "checks": {
            result.id: {
                "passed": result.passed,
                "details": result.details,
            }
            for result in results
        },
        "check_count": len(results),
        "expected_check_count": len(GATE_CHECK_IDS),
        "candidate_status": intake.get("a12_candidate_route"),
        "release_candidate_mode": intake.get("release_candidate_mode"),
        "bundle_bytes": bundle.get("build_output_bytes"),
        "estimated_full_bundle_bytes": intake.get("estimated_full_bundle_bytes"),
        "budget_margin_bytes": intake.get("budget_margin_bytes"),
        "model_assets_committed": intake.get("model_assets_committed"),
        "release_blockers": intake.get("release_blockers"),
        "non_claims": intake.get("non_claims"),
    }
    return report


def main() -> int:
    report = evaluate_release_candidate_gate()
    write_json(ARTIFACT_ROOT / "reports" / "release_candidate_gate.json", report)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
