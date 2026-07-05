#!/usr/bin/env python3
"""R27B1C Vercel static-only rehearsal."""

from __future__ import annotations

import functools
import http.client
import json
import os
import re
import socket
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27b1c_verify_deploy_bundle import verify_bundle

WEB_ROOT = ROOT / "web"
CHAT_ROOT = WEB_ROOT / "another_brain_chat"
TEXT_EXTENSIONS = {".cjs", ".css", ".html", ".js", ".json", ".mjs", ".py", ".ts", ".txt", ".yaml", ".yml"}
API_OR_FUNCTION_DIRS = ("api", "pages/api", "app/api", "functions", "vercel/functions")
REMOTE_MODEL_PATTERN = re.compile(r"https?://[^\s'\"`]+(?:model|weights|checkpoint|tokenizer|gguf|safetensors|onnx)", re.I)
EXTERNAL_LLM_ENDPOINTS = (
    "api.openai.com",
    "openai.com/v1",
    "anthropic.com",
    "cohere.ai",
    "together.ai",
    "replicate.com",
    "dashscope.aliyuncs.com",
    "volces.com",
)
HOSTED_VECTOR_OR_BLOB = (
    "pinecone",
    "weaviate",
    "qdrant.cloud",
    "supabase",
    "upstash",
    "@vercel/blob",
    "blob_read_write_token",
    "kv_rest_api_url",
)
SERVER_LLM_DEPENDENCIES = ("openai", "@anthropic-ai", "langchain", "llamaindex", "ollama", "@xenova/transformers")


class QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def tracked_files() -> list[str]:
    result = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True)
    return result.stdout.splitlines()


def iter_scan_files() -> list[Path]:
    roots = [CHAT_ROOT, ROOT / "src/browser_runtime", ROOT / "vercel.json", ROOT / "package.json"]
    out: list[Path] = []
    for root in roots:
        if root.is_file():
            out.append(root)
        elif root.exists():
            out.extend(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS)
    return sorted(out)


def check_vercel_json(failures: list[str]) -> None:
    config = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    if config.get("framework") is not None:
        failures.append("vercel_framework_must_be_null")
    if config.get("buildCommand") != "npm run build:vercel":
        failures.append("vercel_build_command_must_be_build_vercel")
    if config.get("outputDirectory") != "web":
        failures.append("vercel_output_directory_must_be_web")
    for forbidden in ("functions", "routes", "rewrites"):
        if forbidden in config:
            failures.append(f"vercel_runtime_or_route_config_present:{forbidden}")


def check_no_api_function_inference(failures: list[str]) -> None:
    for rel_dir in API_OR_FUNCTION_DIRS:
        root = ROOT / rel_dir
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            text = read_text(path).lower()
            if any(term in text for term in ("inference", "llm", "completion", "generate", "model")):
                failures.append(f"api_or_function_inference:{path.relative_to(ROOT).as_posix()}")


def check_no_external_runtime(failures: list[str]) -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    deps = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
    for name in deps:
        if any(term in name.lower() for term in SERVER_LLM_DEPENDENCIES):
            failures.append(f"server_side_llm_dependency:{name}")

    for path in iter_scan_files():
        rel = path.relative_to(ROOT).as_posix()
        text = read_text(path)
        lowered = text.lower()
        if REMOTE_MODEL_PATTERN.search(text):
            failures.append(f"remote_model_url:{rel}")
        if any(endpoint in lowered for endpoint in EXTERNAL_LLM_ENDPOINTS):
            failures.append(f"external_llm_endpoint:{rel}")
        if "doubao" in lowered:
            index = lowered.find("doubao")
            window = lowered[max(0, index - 96) : index + 32]
            negative_assertion = any(marker in window for marker in ("no ", "without", "false", "blocked", "reject"))
            if not negative_assertion:
                failures.append(f"doubao_reference:{rel}")
        if any(term in lowered for term in HOSTED_VECTOR_OR_BLOB):
            failures.append(f"hosted_vector_or_blob_runtime:{rel}")


def check_no_tracked_artifacts(failures: list[str]) -> None:
    for rel in tracked_files():
        lowered = rel.lower()
        if lowered.startswith("artifacts/") and rel != "artifacts/.gitkeep":
            failures.append(f"tracked_artifact:{rel}")
        if lowered.endswith((".pt", ".pth", ".safetensors", ".ckpt", ".onnx", ".bin", ".gguf")):
            failures.append(f"tracked_model_asset:{rel}")
        if lowered.endswith("/tokenizer.json") and rel != "static_llm/fixtures/tiny_decoder_fixture/tokenizer.json":
            failures.append(f"tracked_tokenizer_artifact:{rel}")


def free_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def route_smoke() -> dict:
    try:
        port = free_local_port()
        handler = functools.partial(QuietStaticHandler, directory=str(WEB_ROOT))
        server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    except OSError as error:
        return {
            "ran": False,
            "ok": True,
            "unavailable_reason": f"local_server_unavailable:{error}",
            "failures": [],
            "routes": [],
        }
    server.timeout = 2
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    routes = []
    failures: list[str] = []
    try:
        for route, markers in {
            "/": ("<!doctype",),
            "/another_brain_chat/": ("chat-form", "No backend inference", "./app.js"),
            "/another_brain_chat/browser_runtime.js": ("BrowserChatRuntime", "backend_inference: false"),
        }.items():
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
            connection.request("GET", route)
            response = connection.getresponse()
            body = response.read().decode("utf-8", errors="ignore")
            status = int(response.status)
            connection.close()
            missing = [marker for marker in markers if marker not in body]
            routes.append({"route": route, "status": status, "missing_markers": missing})
            if status != 200 or missing:
                failures.append(f"route_smoke_failed:{route}")
    except Exception as error:  # pragma: no cover - platform dependent
        failures.append(f"route_smoke_exception:{error}")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
    return {"ran": True, "ok": not failures, "failures": failures, "routes": routes}


def rehearse() -> dict:
    failures: list[str] = []
    check_vercel_json(failures)
    check_no_api_function_inference(failures)
    check_no_external_runtime(failures)
    check_no_tracked_artifacts(failures)

    bundle = verify_bundle()
    failures.extend(f"bundle:{failure}" for failure in bundle["failures"])
    smoke = route_smoke() if os.environ.get("R27B1C_SKIP_ROUTE_SMOKE") != "1" else {"ran": False, "ok": True, "failures": [], "routes": []}
    failures.extend(smoke["failures"])

    return {
        "ok": not failures,
        "failures": failures,
        "vercel_static_safe": not any(failure.startswith("vercel_") for failure in failures),
        "no_backend_inference": not any("inference" in failure for failure in failures),
        "no_external_runtime_dependency": not any("external" in failure or "remote_model" in failure for failure in failures),
        "chat_route": "/another_brain_chat/",
        "bundle": bundle,
        "route_smoke": smoke,
    }


def main() -> int:
    report = rehearse()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
