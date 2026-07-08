#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "web" / "another_brain" / "model_assets" / "r28m1"
REPORT = ROOT / "artifacts" / "r28hotfix3" / "reports" / "q4_asset_path_audit.json"


def git_ls_files(prefix):
    result = subprocess.run(
        ["git", "ls-files", prefix],
        cwd=ROOT,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def normalize_browser_asset_path(value, base_path=""):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("missing_asset_path")
    raw = value.strip().replace("\\", "/")
    if raw.startswith("//") or "://" in raw:
        raise ValueError("external_asset_url_rejected")
    path = raw
    if path.startswith("web/another_brain/"):
        path = path[len("web/") :]
    if path.startswith("./"):
        if not base_path:
            raise ValueError("relative_asset_base_missing")
        path = f"{base_path.rstrip('/')}/{path[2:]}"
    elif not path.startswith("/") and not path.startswith("another_brain/") and base_path:
        path = f"{base_path.rstrip('/')}/{path}"
    if path.startswith("another_brain/"):
        path = f"/{path}"
    while "//" in path:
        path = path.replace("//", "/")
    parts = [part for part in path.split("/") if part]
    if any(part in {".", ".."} for part in parts):
        raise ValueError("path_traversal_rejected")
    if not path.startswith("/another_brain/"):
        raise ValueError(f"asset_path_not_public_another_brain:{value}")
    if "/artifacts/" in path or "/data/public_ingestion/" in path:
        raise ValueError("forbidden_asset_path_rejected")
    return path


def public_path_to_file(path):
    normalized = normalize_browser_asset_path(path)
    return ROOT / "web" / normalized.lstrip("/")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    asset_manifest_path = ROOT / "web" / "another_brain" / "asset_manifest.json"
    quantization_path = MODEL_DIR / "quantization.manifest.json"
    checksum_path = MODEL_DIR / "checksums.sha256.json"
    tokenizer_path = MODEL_DIR / "tokenizer" / "runtime_tokenizer.json"
    model_config_path = MODEL_DIR / "model.config.json"
    browser_runtime = (ROOT / "web" / "another_brain_chat" / "browser_runtime.js").read_text(encoding="utf-8")
    vercelignore = (ROOT / ".vercelignore").read_text(encoding="utf-8")
    asset_manifest = read_json(asset_manifest_path)
    quantization = read_json(quantization_path)
    tracked = set(git_ls_files("web/another_brain/model_assets/r28m1/"))
    q4_assets = [item for item in asset_manifest.get("model_assets", []) if item.get("role") == "q4_shard"]
    normalized_assets = []
    failures = []

    for item in q4_assets:
        try:
            normalized = normalize_browser_asset_path(item["path"])
            file_path = public_path_to_file(normalized)
            normalized_assets.append({
                "source_path": item["path"],
                "normalized_path": normalized,
                "exists": file_path.exists(),
                "bytes": file_path.stat().st_size if file_path.exists() else 0,
                "tracked": str(file_path.relative_to(ROOT)) in tracked,
            })
        except Exception as error:
            failures.append(f"normalize_failed:{item.get('path')}:{error}")

    required_files = {
        "model_dir": MODEL_DIR,
        "quantization_manifest": quantization_path,
        "checksums_manifest": checksum_path,
        "runtime_tokenizer": tokenizer_path,
        "model_config": model_config_path,
    }
    tracked_required = {
        name: str(path.relative_to(ROOT)) in tracked or name == "model_dir"
        for name, path in required_files.items()
    }
    if "!web/another_brain/model_assets/r28m1/**" not in vercelignore:
        failures.append("vercelignore_missing_r28m1_reinclude")
    if "new URL(`../${path}`" in browser_runtime:
        failures.append("route_relative_probe_present")
    if "fetchJsonSameOrigin(`../${quantizationPath}`" in browser_runtime:
        failures.append("route_relative_quantization_fetch_present")
    if "fetchJsonSameOrigin(`../${tokenizerPath}`" in browser_runtime:
        failures.append("route_relative_tokenizer_fetch_present")

    report = {
        "ok": not failures and all(item["exists"] and item["bytes"] > 0 and item["tracked"] for item in normalized_assets),
        "model_dir_exists": MODEL_DIR.exists(),
        "required_files": {name: path.exists() for name, path in required_files.items()},
        "tracked_required": tracked_required,
        "tracked_asset_count": len(tracked),
        "vercelignore_reincludes_r28m1": "!web/another_brain/model_assets/r28m1/**" in vercelignore,
        "asset_manifest_shard_count": len(q4_assets),
        "quantization_manifest_shard_count": int(quantization.get("shard_count", 0)),
        "normalized_assets": normalized_assets,
        "runtime_uses_same_origin_normalizer": "sameOriginAssetUrl" in browser_runtime and "normalizeBrowserAssetPath" in browser_runtime,
        "missing_leading_slash_paths": [item["path"] for item in q4_assets if not item.get("path", "").startswith("/")],
        "normalized_examples": {
            "manifest_path": normalize_browser_asset_path(asset_manifest["model_asset_manifest"]["quantization_manifest"]),
            "first_shard": normalized_assets[0]["normalized_path"] if normalized_assets else "",
            "web_prefix": normalize_browser_asset_path("web/another_brain/model_assets/r28m1/shards/model-q4-00001.bin"),
        },
        "failures": failures,
        "non_claims": {
            "training": False,
            "new_model_assets": False,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
            "product_admission": False,
        },
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
