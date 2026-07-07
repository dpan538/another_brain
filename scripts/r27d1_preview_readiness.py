#!/usr/bin/env python3
"""R27D1 preview deployment readiness gate."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27b1c_vercel_rehearsal import route_smoke
from scripts.r27b4_bundle_report import make_bundle_report
from scripts.r27d0_vercel_config_audit import (
    ROOT,
    audit as audit_r27d0,
    command_invokes_training,
)

WEB_ROOT = ROOT / "web"
ASSET_MANIFEST = WEB_ROOT / "another_brain" / "asset_manifest.json"
RUNTIME_MODE = WEB_ROOT / "another_brain" / "runtime_mode.json"
RAG_DEMO_ASSET = WEB_ROOT / "another_brain" / "static_rag" / "demo_memory.json"

FORBIDDEN_TOKENIZER_NAMES = {"tokenizer.json", "tokenizer.model"}
ALLOWED_TOKENIZER_ARTIFACTS = {"static_llm/fixtures/tiny_decoder_fixture/tokenizer.json"}
FORBIDDEN_PATH_PARTS = (
    "raw_public_samples",
    "clean_public_samples",
    "training_mix",
)
FORBIDDEN_SUFFIXES = (
    ".pt",
    ".pth",
    ".safetensors",
    ".ckpt",
    ".onnx",
    ".gguf",
    ".bin",
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def git_lines(args: list[str]) -> list[str]:
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=True)
    return [line for line in result.stdout.splitlines() if line]


def tracked_files() -> list[str]:
    return git_lines(["git", "ls-files"])


def package_status(failures: list[str]) -> dict[str, str]:
    package = read_json(ROOT / "package.json")
    scripts = package.get("scripts", {})
    build = scripts.get("build", "")
    build_vercel = scripts.get("build:vercel", "")
    if build != "npm run build:vercel":
        failures.append(f"package_build_not_static_vercel:{build or '<missing>'}")
    if build_vercel != "node scripts/prepare_vercel_static_build.mjs && npm run check:knowledge-runtime && npm run check:vercel-build":
        failures.append(f"package_build_vercel_unexpected:{build_vercel or '<missing>'}")
    for name, command in (("build", build), ("build:vercel", build_vercel)):
        if command_invokes_training(command):
            failures.append(f"build_path_invokes_training:{name}")
    return {"build": build, "build:vercel": build_vercel}


def vercel_status(failures: list[str]) -> dict[str, Any]:
    config = read_json(ROOT / "vercel.json")
    if config.get("framework") is not None:
        failures.append(f"vercel_framework_not_null:{config.get('framework')!r}")
    if config.get("buildCommand") != "npm run build:vercel":
        failures.append(f"vercel_build_command_unexpected:{config.get('buildCommand') or '<missing>'}")
    if config.get("outputDirectory") != "web":
        failures.append(f"vercel_output_directory_unexpected:{config.get('outputDirectory') or '<missing>'}")
    for key in ("functions", "routes"):
        if key in config:
            failures.append(f"vercel_runtime_config_present:{key}")
    return {
        "framework": config.get("framework"),
        "buildCommand": config.get("buildCommand", ""),
        "outputDirectory": config.get("outputDirectory", ""),
        "functionsConfigured": "functions" in config,
        "routesConfigured": "routes" in config,
        "rewrites": config.get("rewrites", []),
    }


def route_status(failures: list[str]) -> dict[str, Any]:
    smoke = route_smoke()
    if not smoke.get("ran") and smoke.get("unavailable_reason"):
        routes = []
        fallback_failures: list[str] = []
        for route, path, markers in (
            ("/", WEB_ROOT / "index.html", ("<!doctype",)),
            ("/another_brain_chat/", WEB_ROOT / "another_brain_chat" / "index.html", ("chat-form", "No backend inference", "./app.js")),
            (
                "/another_brain_chat/browser_runtime.js",
                WEB_ROOT / "another_brain_chat" / "browser_runtime.js",
                ("BrowserChatRuntime", "backend_inference: false"),
            ),
        ):
            if not path.exists():
                routes.append({"route": route, "status": 404, "missing_markers": list(markers), "source": path.relative_to(ROOT).as_posix()})
                fallback_failures.append(f"route_static_file_missing:{route}")
                continue
            body = path.read_text(encoding="utf-8", errors="ignore")
            missing = [marker for marker in markers if marker not in body]
            routes.append({"route": route, "status": 200, "missing_markers": missing, "source": path.relative_to(ROOT).as_posix()})
            if missing:
                fallback_failures.append(f"route_static_markers_missing:{route}")
        for failure in fallback_failures:
            failures.append(f"route:{failure}")
        return {
            **smoke,
            "ok": not fallback_failures,
            "fallback": "static_file_route_check",
            "fallback_failures": fallback_failures,
            "routes": routes,
        }
    for failure in smoke.get("failures", []):
        failures.append(f"route:{failure}")
    expected_routes = {"/", "/another_brain_chat/", "/another_brain_chat/browser_runtime.js"}
    seen_routes = {item.get("route") for item in smoke.get("routes", [])}
    for route in sorted(expected_routes - seen_routes):
        failures.append(f"route_not_checked:{route}")
    return smoke


def manifest_status(failures: list[str]) -> dict[str, Any]:
    manifest = read_json(ASSET_MANIFEST)
    runtime_mode = read_json(RUNTIME_MODE)
    rag_assets = manifest.get("rag_assets", [])
    model_assets = manifest.get("model_assets", [])
    tokenizer_assets = manifest.get("tokenizer_assets", [])
    gate_assets = manifest.get("gate_assets", [])
    rag_demo_bytes = RAG_DEMO_ASSET.stat().st_size

    if manifest.get("same_origin_only") is not True:
        failures.append("asset_manifest_same_origin_only_not_true")
    if manifest.get("external_runtime_dependency") is not False:
        failures.append("asset_manifest_external_runtime_dependency_not_false")
    if manifest.get("backend_inference") is not False:
        failures.append("asset_manifest_backend_inference_not_false")
    if runtime_mode.get("backend_inference") is not False:
        failures.append("runtime_mode_backend_inference_not_false")
    if runtime_mode.get("external_llm_api") is not False:
        failures.append("runtime_mode_external_llm_api_not_false")
    if runtime_mode.get("hosted_vector_store") is not False:
        failures.append("runtime_mode_hosted_vector_store_not_false")
    if runtime_mode.get("product_model") is not False:
        failures.append("runtime_mode_product_model_not_false")

    model_declared = sum(int(item.get("bytes", 0)) for item in model_assets if isinstance(item, dict))
    tokenizer_declared = sum(int(item.get("bytes", 0)) for item in tokenizer_assets if isinstance(item, dict))
    if model_declared != 0:
        failures.append(f"model_declared_bytes_nonzero_without_admitted_candidate:{model_declared}")
    if tokenizer_declared != 0:
        failures.append(f"tokenizer_declared_bytes_nonzero_without_admitted_candidate:{tokenizer_declared}")

    expected_rag = {
        "path": "another_brain/static_rag/demo_memory.json",
        "bytes": rag_demo_bytes,
        "demo_only": True,
        "answer_bank": False,
    }
    if expected_rag not in rag_assets:
        failures.append("rag_demo_asset_not_declared_correctly")
    total_declared = model_declared + tokenizer_declared
    total_declared += sum(int(item.get("bytes", 0)) for item in rag_assets if isinstance(item, dict))
    total_declared += sum(int(item.get("bytes", 0)) for item in gate_assets if isinstance(item, dict))
    if manifest.get("total_declared_bytes") != total_declared:
        failures.append(f"asset_manifest_total_declared_mismatch:{manifest.get('total_declared_bytes')}:{total_declared}")

    return {
        "sameOriginOnly": manifest.get("same_origin_only"),
        "backendInference": manifest.get("backend_inference"),
        "externalRuntimeDependency": manifest.get("external_runtime_dependency"),
        "modelDeclaredBytes": model_declared,
        "tokenizerDeclaredBytes": tokenizer_declared,
        "ragDemoBytes": rag_demo_bytes,
        "ragDemoDeclared": expected_rag in rag_assets,
        "runtimeMode": runtime_mode,
        "totalDeclaredBytes": manifest.get("total_declared_bytes"),
    }


def artifact_status(failures: list[str]) -> dict[str, Any]:
    bad: list[str] = []
    for rel in tracked_files():
        lowered = rel.lower()
        path = Path(rel)
        if lowered.startswith("artifacts/") and rel != "artifacts/.gitkeep":
            bad.append(rel)
        if lowered.startswith("data/public_ingestion/"):
            bad.append(rel)
        if any(part in lowered for part in FORBIDDEN_PATH_PARTS):
            bad.append(rel)
        if lowered.endswith(FORBIDDEN_SUFFIXES):
            bad.append(rel)
        if path.name in FORBIDDEN_TOKENIZER_NAMES and rel not in ALLOWED_TOKENIZER_ARTIFACTS:
            bad.append(rel)
        if len(path.parts) == 1 and lowered.endswith((".docx", ".pdf")):
            bad.append(rel)
    for rel in sorted(set(bad)):
        failures.append(f"forbidden_tracked_artifact:{rel}")
    return {"badTrackedFiles": sorted(set(bad))}


def audit() -> dict[str, Any]:
    failures: list[str] = []
    d0 = audit_r27d0()
    if not d0["ok"]:
        failures.extend(f"d0:{failure}" for failure in d0["failures"])
    package = package_status(failures)
    vercel = vercel_status(failures)
    bundle = make_bundle_report()
    failures.extend(f"bundle:{failure}" for failure in bundle["failures"])
    routes = route_status(failures)
    manifest = manifest_status(failures)
    artifacts = artifact_status(failures)

    return {
        "ok": not failures,
        "failures": failures,
        "packageScripts": package,
        "vercel": vercel,
        "bundle": bundle,
        "routes": routes,
        "assetManifest": manifest,
        "artifacts": artifacts,
        "d0AuditOk": d0["ok"],
        "repoBuildConfigCauseStillLikely": False if not failures else "unknown_until_vercel_build_log",
        "ghCliAvailable": bool(subprocess.run(["/bin/zsh", "-lc", "command -v gh"], text=True, capture_output=True).stdout.strip()),
        "vercelCliAvailable": bool(subprocess.run(["/bin/zsh", "-lc", "command -v vercel"], text=True, capture_output=True).stdout.strip()),
        "claims": {
            "productModel": False,
            "backendInference": False,
            "externalLlmApi": False,
            "doubao": False,
            "hostedVectorStore": False,
            "phase4Approved": False,
        },
    }


def main() -> int:
    report = audit()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
