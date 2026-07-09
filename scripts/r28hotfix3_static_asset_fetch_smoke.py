#!/usr/bin/env python3
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def normalize_browser_asset_path(value, base_path=""):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("missing_asset_path")
    path = value.strip().replace("\\", "/")
    if path.startswith("//") or "://" in path:
        raise ValueError("external_asset_url_rejected")
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


def main():
    route = "/another_brain_chat?message=你是谁"
    manifest = json.loads((ROOT / "web" / "another_brain" / "asset_manifest.json").read_text(encoding="utf-8"))
    quantization_path = normalize_browser_asset_path(manifest["model_asset_manifest"]["quantization_manifest"])
    quantization_file = public_path_to_file(quantization_path)
    quantization = json.loads(quantization_file.read_text(encoding="utf-8"))
    tokenizer_path = normalize_browser_asset_path(manifest["model_asset_manifest"]["tokenizer_manifest"])
    tokenizer_file = public_path_to_file(tokenizer_path)
    shards = quantization.get("shards", [])
    checked = []
    failures = []
    for shard in shards:
      try:
        normalized = normalize_browser_asset_path(shard["path"])
        file_path = public_path_to_file(normalized)
        size = file_path.stat().st_size if file_path.exists() else 0
        if size <= 0:
            failures.append(f"empty_or_missing_shard:{normalized}")
        if size != int(shard.get("bytes", 0)):
            failures.append(f"shard_size_mismatch:{normalized}:{size}:{shard.get('bytes')}")
        checked.append({"path": normalized, "bytes": size})
      except Exception as error:
        failures.append(f"shard_resolve_failed:{shard.get('path')}:{error}")

    runtime = (ROOT / "web" / "another_brain_chat" / "browser_runtime.js").read_text(encoding="utf-8")
    if "new URL(`../${path}`" in runtime:
        failures.append("route_relative_probe_present")
    if "asset_probe_failed:${path}" in runtime:
        failures.append("un_normalized_asset_probe_error_present")
    if not tokenizer_file.exists():
        failures.append(f"tokenizer_missing:{tokenizer_path}")
    if len(checked) != 5:
        failures.append(f"unexpected_shard_count:{len(checked)}")

    report = {
        "ok": not failures,
        "route": route,
        "manifest_public_path": "/another_brain/asset_manifest.json",
        "quantization_public_path": quantization_path,
        "tokenizer_public_path": tokenizer_path,
        "checked_shards": checked,
        "max_shard_size": max([item["bytes"] for item in checked], default=0),
        "expected_max_shard_size": 12000000,
        "q4_self_check_can_move_beyond_quick_check": not failures and len(checked) == 5,
        "asset_probe_failed": False,
        "failures": failures,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
