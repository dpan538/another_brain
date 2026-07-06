#!/usr/bin/env python3
"""R27D3 unified static delivery integration audit."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27b4_bundle_report import make_bundle_report
from scripts.r27d0_vercel_config_audit import command_invokes_training
from scripts.r27d1_preview_readiness import audit as audit_r27d1
from scripts.r27d2_main_merge_guard import audit as audit_r27d2
from scripts.r27e0_acceptance_check import build_acceptance_report

CHAT_ROOT = ROOT / "web" / "another_brain_chat"
STATIC_ROOT = ROOT / "web" / "another_brain"
REQUIRED_BRANCH_FILES = {
    "d2": [
        "scripts/r27d2_pr_status.py",
        "scripts/r27d2_main_merge_guard.py",
        "docs/r27/R27D2_PR_PREVIEW_FOLLOWUP.md",
    ],
    "c0": [
        "src/browser_runtime/context_adapter.ts",
        "web/another_brain_chat/context_bridge.js",
        "docs/r27/R27C0_ADAPTER_PACKET_CONTRACTS.md",
        "tests/r27c0/test_context_adapter_contracts.ts",
    ],
    "b8": [
        "src/browser_runtime/assets/asset_cache.ts",
        "src/browser_runtime/assets/shard_loader.ts",
        "docs/r27/R27B8_BROWSER_ASSET_CACHE.md",
        "tests/r27b8/test_cache_fallback.ts",
    ],
    "e0": [
        "scripts/r27e0_acceptance_check.py",
        "docs/r27/R27E0_ACCEPTANCE_CRITERIA.md",
        "tests/r27e0/test_acceptance_docs.py",
    ],
    "b5": [
        "web/another_brain_chat/browser_runtime.js",
        "web/another_brain_chat/static_retriever.js",
        "web/another_brain/static_rag/demo_memory.json",
        "scripts/r27b5_full_bundle_budget_gate.py",
        "tests/r27b5/test_full_bundle_budget_gate.py",
    ],
}


def read_text(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8", errors="ignore")


def read_json(rel: str) -> dict[str, Any]:
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def git_lines(args: list[str]) -> list[str]:
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=False)
    return [line for line in result.stdout.splitlines() if line]


def tracked_files() -> list[str]:
    return git_lines(["git", "ls-files"])


def changed_files() -> set[str]:
    changed: set[str] = set()
    for args in (
        ["git", "diff", "--name-only", "--cached"],
        ["git", "diff", "--name-only"],
        ["git", "diff", "--name-only", "origin/r27d2-pr-preview-followup...HEAD"],
    ):
        changed.update(git_lines(args))
    return changed


def package_status(failures: list[str]) -> dict[str, Any]:
    package = read_json("package.json")
    scripts = package.get("scripts", {})
    required_scripts = [
        "test:r27d2",
        "test:r27c0",
        "test:r27b8",
        "test:r27e0",
        "test:r27d3",
        "build",
        "build:vercel",
    ]
    missing = [name for name in required_scripts if name not in scripts]
    for name in missing:
        failures.append(f"missing_package_script:{name}")
    if scripts.get("build") != "npm run build:vercel":
        failures.append(f"build_script_not_vercel:{scripts.get('build')}")
    for name in ("build", "build:vercel"):
        if command_invokes_training(scripts.get(name, "")):
            failures.append(f"build_invokes_training:{name}")
    return {name: scripts.get(name, "") for name in required_scripts}


def branch_file_status(failures: list[str]) -> dict[str, Any]:
    status: dict[str, Any] = {}
    for branch, files in REQUIRED_BRANCH_FILES.items():
        missing = [rel for rel in files if not (ROOT / rel).exists()]
        status[branch] = {"required": files, "missing": missing, "ok": not missing}
        for rel in missing:
            failures.append(f"missing_{branch}_file:{rel}")
    return status


def artifact_status(failures: list[str]) -> dict[str, Any]:
    bad: list[str] = []
    changed = changed_files()
    allowed_tokenizers = {"static_llm/fixtures/tiny_decoder_fixture/tokenizer.json"}
    for rel in tracked_files():
        lowered = rel.lower()
        path = Path(rel)
        if lowered.startswith("artifacts/") and rel != "artifacts/.gitkeep":
            bad.append(rel)
        if lowered.startswith("data/public_ingestion/"):
            bad.append(rel)
        if any(part in lowered for part in ("raw_public_samples", "clean_public_samples", "training_mix")):
            bad.append(rel)
        if lowered.endswith((".pt", ".pth", ".safetensors", ".ckpt", ".onnx", ".gguf", ".bin")):
            bad.append(rel)
        if path.name in {"tokenizer.json", "tokenizer.model"} and rel not in allowed_tokenizers:
            bad.append(rel)
        if len(path.parts) == 1 and lowered.endswith((".docx", ".pdf")):
            bad.append(rel)
    for rel in changed:
        if rel.lower().startswith("training/current/"):
            bad.append(rel)
    for rel in sorted(set(bad)):
        failures.append(f"forbidden_tracked_file:{rel}")
    return {"badTrackedFiles": sorted(set(bad)), "changedFilesChecked": sorted(changed)}


def ui_status(failures: list[str]) -> dict[str, Any]:
    html = read_text("web/another_brain_chat/index.html")
    app = read_text("web/another_brain_chat/app.js")
    runtime = read_text("web/another_brain_chat/browser_runtime.js")
    css = read_text("web/another_brain_chat/styles.css")
    markers = {
        "localOnlyBadge": "Local only" in html and 'id="local-indicator"' in html,
        "modelMode": 'id="configured-model-mode"' in html,
        "ragMode": 'id="configured-rag-mode"' in html,
        "assetCacheStatus": 'id="asset-cache-status"' in html and "renderAssetStatus" in app,
        "adapterStatus": "not saved / not training data" in html and "createLocalContextBridge" in app,
        "budgetStatus": 'id="budget-status"' in html,
        "nonProductWarning": 'id="non-product-warning"' in html,
        "fallbackReason": 'id="fallback-status"' in html,
        "evidenceDrawer": "Evidence drawer" in html and "debug-output" in html,
        "contextImportPanel": 'id="context-import"' in html and "context_bridge.js" in app,
        "mobileLayout": "@media (max-width: 720px)" in css and "grid-template-columns: 1fr" in css,
        "assetRuntime": "cache_storage_available" in runtime and "offline_static_cache_supported" in runtime,
    }
    for name, ok in markers.items():
        if not ok:
            failures.append(f"missing_ui_marker:{name}")
    return markers


def run_node_smoke(script: str) -> dict[str, Any]:
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return {"ok": False, "returncode": result.returncode, "stdout": result.stdout[-1000:], "stderr": result.stderr[-1000:]}
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        return {"ok": False, "error": f"invalid_json:{error}", "stdout": result.stdout[-1000:]}
    payload["ok"] = True
    return payload


def adapter_smoke(failures: list[str]) -> dict[str, Any]:
    script = r"""
import { createLocalContextBridge, createStateAdapterPacket } from './web/another_brain_chat/context_bridge.js';
const bridge = createLocalContextBridge();
const imported = bridge.importText('manual local context evidence', { sourceLabel: 'D3 smoke' });
const exported = createStateAdapterPacket({ runtime_version: 'r27d3', local_only: true, backend_inference: false });
console.log(JSON.stringify({
  imported_ok: imported.ok,
  packet_count: bridge.summary().packet_count,
  evidence_count: bridge.summary().evidence_record_count,
  export_type: exported.packet_type,
  export_training: exported.allowed_for_training
}));
"""
    report = run_node_smoke(script)
    if not report.get("ok") or not report.get("imported_ok") or report.get("export_type") != "StatePacket" or report.get("export_training") is not False:
        failures.append("adapter_import_export_smoke_failed")
    return report


def asset_cache_smoke(failures: list[str]) -> dict[str, Any]:
    script = r"""
import { BrowserAssetCache } from './src/browser_runtime/assets/asset_cache.ts';
import { probeAssetCacheCapabilities } from './src/browser_runtime/assets/cache_capability.ts';
const env = { indexedDB: {}, navigator: { onLine: false } };
const capabilities = probeAssetCacheCapabilities(env);
const cache = new BrowserAssetCache({ manifestVersion: 'd3', env });
await cache.put('https://example.test/static/shard.bin', new Uint8Array([1, 2, 3]));
const cached = await cache.get('https://example.test/static/shard.bin');
console.log(JSON.stringify({
  cache_mode: cache.mode(),
  hit: cached.hit,
  bytes: Array.from(cached.bytes || []),
  offline_static_cache_supported: capabilities.offline_static_cache_supported
}));
"""
    report = run_node_smoke(script)
    if not report.get("ok") or not report.get("hit") or report.get("cache_mode") != "memory_fallback":
        failures.append("asset_cache_smoke_failed")
    return report


def static_rag_smoke(failures: list[str]) -> dict[str, Any]:
    script = r"""
import { buildEvidencePacket, loadStaticMemoryRecords } from './web/another_brain_chat/static_retriever.js';
const records = await loadStaticMemoryRecords();
const packet = buildEvidencePacket('another_brain browser memory surface', { local_only: true }, records);
console.log(JSON.stringify({
  record_count: records.length,
  evidence_count: packet.retrieved_evidence.length,
  local_only: packet.local_only,
  same_origin_only: packet.same_origin_only,
  backend_retrieval: packet.backend_retrieval
}));
"""
    report = run_node_smoke(script)
    if not report.get("ok") or int(report.get("record_count", 0)) <= 0 or report.get("backend_retrieval") is not False:
        failures.append("static_rag_smoke_failed")
    return report


def acceptance_smoke(failures: list[str]) -> dict[str, Any]:
    report = build_acceptance_report(skip_route_smoke=True)
    if not report.get("ok"):
        failures.append("acceptance_smoke_failed")
    return {
        "ok": report.get("ok"),
        "scenario_count": report.get("scenario_count"),
        "passed": report.get("passed"),
        "failed": report.get("failed"),
    }


def audit(*, run_commands: bool = False) -> dict[str, Any]:
    failures: list[str] = []
    d1 = audit_r27d1()
    d2 = audit_r27d2(run_commands=run_commands)
    bundle = make_bundle_report()

    if not d1["ok"]:
        failures.extend(f"d1:{failure}" for failure in d1["failures"])
    if not d2["ok"]:
        failures.extend(f"d2:{failure}" for failure in d2["failures"])
    if not bundle["ok"]:
        failures.extend(f"bundle:{failure}" for failure in bundle["failures"])
    if int(bundle["build_output_bytes"]) >= int(bundle["max_total_static_bytes"]):
        failures.append("bundle_not_under_100mb")

    package = package_status(failures)
    branch_files = branch_file_status(failures)
    artifacts = artifact_status(failures)
    ui = ui_status(failures)
    adapter = adapter_smoke(failures)
    asset_cache = asset_cache_smoke(failures)
    static_rag = static_rag_smoke(failures)
    acceptance = acceptance_smoke(failures)

    return {
        "ok": not failures,
        "failures": failures,
        "runCommands": run_commands,
        "packageScripts": package,
        "branchFiles": branch_files,
        "bundle": bundle,
        "routes": d1["routes"],
        "d2MergeGuard": {"ok": d2["ok"], "failures": d2["failures"]},
        "artifacts": artifacts,
        "ui": ui,
        "adapterSmoke": adapter,
        "assetCacheSmoke": asset_cache,
        "staticRagSmoke": static_rag,
        "acceptanceSmoke": acceptance,
        "nonClaims": {
            "productModel": False,
            "productAdmission": False,
            "browserAdmission": False,
            "releaseCheckpoint": False,
            "backendInference": False,
            "externalLlmApi": False,
            "doubao": False,
            "hostedVectorStore": False,
            "phase4Approved": False,
        },
    }


def main() -> int:
    report = audit(run_commands=False)
    print(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
