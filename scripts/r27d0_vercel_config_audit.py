#!/usr/bin/env python3
"""R27D0 Vercel deployment config and static delivery audit."""

from __future__ import annotations

import fnmatch
import json
import re
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"

EXPECTED_BUILD_COMMAND = "npm run build:vercel"
EXPECTED_OUTPUT_DIRECTORY = "web"
EXPECTED_FRAMEWORK = None

REQUIRED_STATIC_FILES = [
    "web/index.html",
    "web/app.js",
    "web/runtime_version.js",
    "web/knowledge_runtime.js",
    "web/knowledge_shards/manifest.json",
    "web/another_brain/asset_manifest.json",
    "web/another_brain/runtime_mode.json",
    "web/another_brain_chat/index.html",
    "web/another_brain_chat/app.js",
]

API_OR_FUNCTION_DIRS = [
    "api",
    "pages/api",
    "app/api",
    "functions",
    "vercel/functions",
]

TEXT_EXTENSIONS = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".mjs",
    ".ts",
    ".tsx",
    ".txt",
    ".webmanifest",
    ".xml",
}

MODEL_WEIGHT_EXTENSIONS = {
    ".bin",
    ".ckpt",
    ".gguf",
    ".mlmodel",
    ".mlpackage",
    ".onnx",
    ".pt",
    ".pth",
    ".safetensors",
}

FORBIDDEN_CHANGED_PATTERNS = [
    re.compile(r"^data/public_ingestion/"),
    re.compile(r"^data/training_registry/r27a[2-9]", re.I),
    re.compile(r"^docs/r27/R27A[2-9]", re.I),
    re.compile(r"^scripts/r27a[2-9]", re.I),
    re.compile(r"^src/training/"),
    re.compile(r"^tests/r27a[2-9]", re.I),
    re.compile(r"^training/from_scratch/APPROVE_R27A[2-9]", re.I),
    re.compile(r"^[^/]+\.(docx|pdf)$", re.I),
]

ALLOWED_TOKENIZER_ARTIFACTS = {
    "static_llm/fixtures/tiny_decoder_fixture/tokenizer.json",
}

TRAINING_COMMAND_RE = re.compile(
    r"("
    r"npm\s+run\s+[^\s;&|]*(?:train|training|tokenizer|campaign|teacher|distill)[^\s;&|]*"
    r"|(?:node|python3?)\s+scripts/[^\s;&|]*(?:train|training|tokenizer|campaign|teacher|distill)[^\s;&|]*"
    r"|--allow-[^\s;&|]*(?:training|phase-4|product-model|decoder)"
    r")",
    re.I,
)

EXTERNAL_MODEL_URL_OR_SDK_RE = re.compile(
    r"("
    r"https?://[^\s'\"`]*(?:api\.openai\.com|openai\.com/v1|anthropic\.com|cohere\.ai|replicate\.com|huggingface\.co|doubao|dashscope|volces)"
    r"|from\s+['\"](?:openai|@anthropic-ai|@huggingface|@ai-sdk)"
    r"|require\(['\"](?:openai|@anthropic-ai|@huggingface|@ai-sdk)"
    r"|\b(?:OPENAI|ANTHROPIC|DOUBAO|DASHSCOPE|HUGGINGFACE)_[A-Z0-9_]+\b"
    r")",
    re.I,
)

HOSTED_VECTOR_OR_STORAGE_WIRING_RE = re.compile(
    r"("
    r"https?://[^\s'\"`]*(?:pinecone|weaviate|qdrant\.cloud|upstash|neon|redis)"
    r"|from\s+['\"](?:@vercel/blob|@upstash/redis|@pinecone-database/pinecone|@qdrant/js-client-rest|weaviate-client)"
    r"|require\(['\"](?:@vercel/blob|@upstash/redis|@pinecone-database/pinecone|@qdrant/js-client-rest|weaviate-client)"
    r"|\b(?:BLOB_READ_WRITE_TOKEN|UPSTASH_REDIS_REST_URL|PINECONE_API_KEY|QDRANT_URL|DATABASE_URL|POSTGRES_URL|REDIS_URL)\b"
    r")",
    re.I,
)


def read_json(path: Path, failures: list[str]) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        failures.append(f"missing_json:{path.relative_to(ROOT).as_posix()}")
    except json.JSONDecodeError as error:
        failures.append(f"invalid_json:{path.relative_to(ROOT).as_posix()}:{error.msg}")
    return {}


def git_lines(args: list[str]) -> list[str]:
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        return []
    return [line for line in result.stdout.splitlines() if line]


def tracked_files() -> list[str]:
    return git_lines(["git", "ls-files"])


def changed_files_against_main() -> list[str]:
    changed: set[str] = set()
    for args in (
        ["git", "diff", "--name-only", "--cached"],
        ["git", "diff", "--name-only"],
        ["git", "diff", "--name-only", "origin/main...HEAD"],
    ):
        changed.update(git_lines(args))
    return sorted(changed)


def load_vercel_ignore() -> list[str]:
    path = ROOT / ".vercelignore"
    if not path.exists():
        return []
    entries = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and not line.startswith("!"):
            entries.append(line)
    return entries


def ignored_by_vercel(rel: str, entries: list[str]) -> bool:
    for entry in entries:
        normalized = entry.rstrip("/")
        if entry.endswith("/**"):
            prefix = normalized[:-3]
            if rel == prefix or rel.startswith(prefix + "/"):
                return True
        if fnmatch.fnmatch(rel, entry) or rel == normalized or rel.startswith(normalized + "/"):
            return True
    return False


def deployable_web_files() -> list[Path]:
    ignore_entries = load_vercel_ignore()
    if not WEB_ROOT.exists():
        return []
    files = []
    for path in WEB_ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        if ignored_by_vercel(rel, ignore_entries):
            continue
        files.append(path)
    return files


def should_scan_public_file_for_service_wiring(rel: str, suffix: str) -> bool:
    if suffix in {".js", ".mjs", ".ts", ".tsx", ".html", ".css", ".webmanifest", ".xml", ".txt"}:
        return True
    return rel in {
        "web/another_brain/asset_manifest.json",
        "web/another_brain/runtime_mode.json",
        "web/knowledge_shards/manifest.json",
        "web/site.webmanifest",
    }


def command_invokes_training(command: str) -> bool:
    return bool(TRAINING_COMMAND_RE.search(command or ""))


def audit_package_scripts(package_json: dict[str, Any], failures: list[str]) -> dict[str, Any]:
    scripts = package_json.get("scripts") or {}
    build = scripts.get("build", "")
    build_vercel = scripts.get("build:vercel", "")
    vercel_scripts = {name: command for name, command in scripts.items() if "vercel build" in command}

    if build != EXPECTED_BUILD_COMMAND:
        failures.append(f"package_build_must_be_static_vercel_path:{build or '<missing>'}")
    if not build_vercel:
        failures.append("missing_package_script:build:vercel")
    for name in ("build", "build:vercel", *vercel_scripts.keys()):
        command = scripts.get(name, "")
        if command_invokes_training(command):
            failures.append(f"package_script_invokes_training:{name}")
    if "check:no-training-in-routine-gates" not in scripts:
        failures.append("missing_package_script:check:no-training-in-routine-gates")
    if "check:training-approval-markers" not in scripts:
        failures.append("missing_package_script:check:training-approval-markers")

    return {
        "build": build,
        "build_vercel": build_vercel,
        "vercel_build_scripts": vercel_scripts,
        "routine_training_gate": scripts.get("check:no-training-in-routine-gates", ""),
        "training_approval_marker_gate": scripts.get("check:training-approval-markers", ""),
    }


def audit_vercel_json(vercel_json: dict[str, Any], failures: list[str]) -> dict[str, Any]:
    framework = vercel_json.get("framework")
    build_command = vercel_json.get("buildCommand", "")
    output_directory = vercel_json.get("outputDirectory", "")
    rewrites = vercel_json.get("rewrites", [])
    functions = vercel_json.get("functions")

    if framework is not EXPECTED_FRAMEWORK:
        failures.append(f"vercel_framework_must_be_null:{framework!r}")
    if build_command != EXPECTED_BUILD_COMMAND:
        failures.append(f"vercel_build_command_must_be_build_vercel:{build_command or '<missing>'}")
    if output_directory != EXPECTED_OUTPUT_DIRECTORY:
        failures.append(f"vercel_output_directory_must_be_web:{output_directory or '<missing>'}")
    if functions:
        failures.append("vercel_functions_must_not_be_configured")
    if "routes" in vercel_json:
        failures.append("vercel_routes_must_not_add_runtime_routing")
    for rewrite in rewrites if isinstance(rewrites, list) else []:
        target = " ".join(str(rewrite.get(key, "")) for key in ("source", "destination"))
        if re.search(r"(^|/)api(/|$)|functions|inference|llm|model", target, re.I):
            failures.append(f"vercel_rewrite_targets_runtime_inference:{target}")

    return {
        "framework": framework,
        "buildCommand": build_command,
        "outputDirectory": output_directory,
        "rewrites": rewrites,
        "functionsConfigured": bool(functions),
        "routesConfigured": "routes" in vercel_json,
    }


def audit_static_output(failures: list[str]) -> dict[str, Any]:
    missing = [path for path in REQUIRED_STATIC_FILES if not (ROOT / path).exists()]
    for path in missing:
        failures.append(f"missing_static_output_file:{path}")

    files = deployable_web_files()
    total_bytes = sum(path.stat().st_size for path in files)
    public_scan_failures: list[str] = []
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        suffix = path.suffix.lower()
        if suffix in {".docx", ".pdf"}:
            public_scan_failures.append(f"forbidden_public_document:{rel}")
        if suffix in MODEL_WEIGHT_EXTENSIONS or ".mlpackage/" in rel:
            public_scan_failures.append(f"forbidden_public_model_weight:{rel}")
        if suffix not in TEXT_EXTENSIONS or not should_scan_public_file_for_service_wiring(rel, suffix):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if EXTERNAL_MODEL_URL_OR_SDK_RE.search(text):
            public_scan_failures.append(f"external_model_or_llm_wiring:{rel}")
        if HOSTED_VECTOR_OR_STORAGE_WIRING_RE.search(text):
            public_scan_failures.append(f"hosted_vector_or_storage_wiring:{rel}")
    failures.extend(public_scan_failures)

    return {
        "path": EXPECTED_OUTPUT_DIRECTORY,
        "exists": WEB_ROOT.exists(),
        "requiredFilesMissing": missing,
        "deployableFileCount": len(files),
        "deployableBytes": total_bytes,
        "publicScanFailures": public_scan_failures,
    }


def audit_api_and_backend_surfaces(failures: list[str]) -> dict[str, Any]:
    surfaces: list[str] = []
    inference_surfaces: list[str] = []
    for rel_dir in API_OR_FUNCTION_DIRS:
        root = ROOT / rel_dir
        if not root.exists():
            continue
        surfaces.append(rel_dir)
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            if re.search(r"\b(inference|llm|completion|generate|model|embedding|vector)\b", text, re.I):
                inference_surfaces.append(path.relative_to(ROOT).as_posix())
    for rel in inference_surfaces:
        failures.append(f"api_or_function_inference_surface:{rel}")
    return {
        "apiOrFunctionDirsPresent": surfaces,
        "inferenceSurfaces": inference_surfaces,
    }


def audit_tracked_hygiene(failures: list[str]) -> dict[str, Any]:
    tracked = tracked_files()
    changed = changed_files_against_main()
    tracked_failures: list[str] = []
    changed_failures: list[str] = []

    for rel in tracked:
        path = Path(rel)
        suffix = path.suffix.lower()
        if suffix in MODEL_WEIGHT_EXTENSIONS or ".mlpackage/" in rel:
            tracked_failures.append(f"tracked_weight_or_export:{rel}")
        if rel.startswith("artifacts/") and rel != "artifacts/.gitkeep":
            tracked_failures.append(f"tracked_artifact:{rel}")
        if rel.startswith("data/public_ingestion/"):
            tracked_failures.append(f"tracked_public_ingestion:{rel}")
        if path.name in {"tokenizer.json", "tokenizer.model"} and rel not in ALLOWED_TOKENIZER_ARTIFACTS:
            tracked_failures.append(f"tracked_tokenizer_artifact:{rel}")

    for rel in changed:
        for pattern in FORBIDDEN_CHANGED_PATTERNS:
            if pattern.search(rel):
                changed_failures.append(f"forbidden_changed_path:{rel}")
                break

    failures.extend(tracked_failures)
    failures.extend(changed_failures)
    return {
        "trackedFailures": tracked_failures,
        "changedAgainstMainFailures": changed_failures,
        "changedAgainstMainCount": len(changed),
        "changedAgainstMain": changed,
    }


def audit() -> dict[str, Any]:
    failures: list[str] = []
    package_json = read_json(ROOT / "package.json", failures)
    vercel_json = read_json(ROOT / "vercel.json", failures)

    package_scripts = audit_package_scripts(package_json, failures)
    vercel = audit_vercel_json(vercel_json, failures)
    static_output = audit_static_output(failures)
    backend = audit_api_and_backend_surfaces(failures)
    tracked = audit_tracked_hygiene(failures)

    return {
        "ok": not failures,
        "failures": failures,
        "packageScripts": package_scripts,
        "vercel": vercel,
        "staticOutput": static_output,
        "backendInference": backend,
        "trackedHygiene": tracked,
        "claims": {
            "previewFailureCausedByUnmergedMain": "not_determined_by_local_config",
            "productModel": False,
            "phase4Approved": False,
            "backendInference": False,
            "externalLlmApi": False,
            "hostedVectorStore": False,
        },
    }


def main() -> int:
    report = audit()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
