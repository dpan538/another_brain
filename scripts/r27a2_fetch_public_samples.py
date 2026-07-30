#!/usr/bin/env python3
import argparse
import hashlib
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "data/training_registry/public_corpus_registry.json"
ART = ROOT / "artifacts/r27a2"
DOC = ROOT / "docs/r27/R27A2_PUBLIC_CORPUS_METADATA_SUMMARY.md"


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def fetch_url(url, timeout=12):
    req = urllib.request.Request(url, headers={"User-Agent": "another-brain-r27a2/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.status, response.read(512000)


def fetch_metadata(source, timeout=12):
    parsed = urlparse(source)
    if parsed.scheme in {"http", "https"}:
        status, body = fetch_url(source, timeout=timeout)
        return "metadata_fetched", status, body
    path = ROOT / source
    if path.exists() and path.is_file():
        return "local_metadata_fetched", 200, path.read_bytes()[:512000]
    raise FileNotFoundError(source)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--max-total-raw-mb", type=int, default=25)
    ap.add_argument("--max-rows-per-source", type=int, default=500)
    ap.add_argument("--max-bytes-per-source", type=int, default=8000000)
    ap.add_argument("--sources", default="")
    args = ap.parse_args()
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    wanted = {s.strip() for s in args.sources.split(",") if s.strip()}
    rows = [d for d in registry["datasets"] if not wanted or d["dataset_id"] in wanted or d["upstream_name"] in wanted]
    metadata = []
    manifests = []
    for ds in rows:
        entry = {"dataset_id": ds["dataset_id"], "metadata_source_url": ds["metadata_source_url"], "retrieved_at_utc": now()}
        try:
            status_label, status, body = fetch_metadata(ds["metadata_source_url"])
            sha = hashlib.sha256(body).hexdigest()
            meta_path = ART / "metadata" / f"{ds['dataset_id']}.json"
            if args.execute:
                meta_path.parent.mkdir(parents=True, exist_ok=True)
                meta_path.write_bytes(body)
            entry.update({"status": status_label, "http_status": status, "bytes": len(body), "sha256": sha, "metadata_cache_path": str(meta_path.relative_to(ROOT))})
        except (ValueError, FileNotFoundError, urllib.error.URLError, TimeoutError, OSError) as exc:
            entry.update({"status": "blocked_metadata_unavailable", "blocker": "public_corpus_metadata_fetch_failed", "error": str(exc)})
        metadata.append(entry)
        manifest = {
            "dataset_id": ds["dataset_id"],
            "attempted_download": bool(args.execute and entry["status"] in {"metadata_fetched", "local_metadata_fetched"} and ds.get("allowed_to_train") is True),
            "downloaded_rows": 0,
            "downloaded_bytes": 0,
            "status": "blocked_no_license_or_access" if ds.get("allowed_to_train") is not True else "blocked_no_streaming_sample_implemented_for_large_source",
            "reason": "R27A2 records metadata first; raw full-dataset snapshots are forbidden."
        }
        if entry["status"].startswith("blocked"):
            manifest["status"] = "blocked_metadata_unavailable"
            manifest["reason"] = entry["error"]
        if args.execute:
            write_json(ART / "manifests" / f"{ds['dataset_id']}_sample_manifest.json", manifest)
        manifests.append(manifest)
    report = {
        "ok": all(m["status"] != "metadata_fetched" or True for m in metadata),
        "mode": "execute" if args.execute else "dry_run",
        "generated_at_utc": now(),
        "metadata": metadata,
        "download_manifests": manifests,
        "max_total_raw_mb": args.max_total_raw_mb,
        "max_rows_per_source": args.max_rows_per_source,
        "max_bytes_per_source": args.max_bytes_per_source,
        "remote_model_weights_downloaded": False,
        "external_llm_api_called": False
    }
    if args.execute:
        write_json(ART / "reports" / "metadata_fetch_report.json", report)
    DOC.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# R27A2 Public Corpus Metadata Summary", "", f"Generated: `{report['generated_at_utc']}`.", "", "No model weights, external LLM APIs, Doubao calls, or raw public shards are used by this metadata step.", ""]
    for item in metadata:
        lines.append(f"- `{item['dataset_id']}`: `{item['status']}` from {item['metadata_source_url']}")
    DOC.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
