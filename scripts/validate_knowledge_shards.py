#!/usr/bin/env python3
"""Validate generated knowledge shards against the monolithic build source."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from build_knowledge_shards import DEFAULT_OUT_DIR, DEFAULT_SOURCE, DEFAULT_SOURCE_OF_TRUTH, parse_source, sha256_text


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(source: Path, shard_dir: Path, max_bytes: int) -> dict:
    source = source.resolve()
    shard_dir = shard_dir.resolve()
    stats, source_rows = parse_source(source)
    manifest_path = shard_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"missing shard manifest: {manifest_path}")
    manifest = read_json(manifest_path)
    if manifest.get("schema_version") != 1:
        raise SystemExit("unexpected shard manifest schema_version")

    source_text = source.read_text(encoding="utf-8")
    source_meta = manifest.get("source", {})
    expected_source_path = source.relative_to(Path(__file__).resolve().parents[1]).as_posix()
    if source_meta.get("path") != expected_source_path:
        raise SystemExit(
            f"knowledge shard manifest source path mismatch: {source_meta.get('path')} != {expected_source_path}"
        )
    if source_meta.get("sha256") != sha256_text(source_text):
        raise SystemExit("knowledge shard manifest source sha256 does not match source")
    if manifest.get("stats") != stats:
        raise SystemExit("knowledge shard stats do not match source stats")
    if DEFAULT_SOURCE_OF_TRUTH.exists():
        source_of_truth = manifest.get("source_of_truth", {})
        if source_of_truth.get("path") != DEFAULT_SOURCE_OF_TRUTH.relative_to(Path(__file__).resolve().parents[1]).as_posix():
            raise SystemExit("knowledge shard source_of_truth path mismatch")

    loaded_rows = []
    max_observed_bytes = 0
    for shard in manifest.get("shards", []):
        path = shard_dir / shard["file"]
        if not path.exists():
            raise SystemExit(f"missing shard file: {path}")
        observed_bytes = path.stat().st_size
        max_observed_bytes = max(max_observed_bytes, observed_bytes)
        if observed_bytes != shard["bytes"]:
            raise SystemExit(f"shard byte count mismatch: {path}")
        if file_sha256(path) != shard["sha256"]:
            raise SystemExit(f"shard sha256 mismatch: {path}")
        if observed_bytes > max_bytes:
            raise SystemExit(f"shard exceeds max bytes: {path} ({observed_bytes})")
        payload = read_json(path)
        if payload.get("schema_version") != 1:
            raise SystemExit(f"unexpected shard schema_version: {path}")
        loaded_rows.extend(payload.get("cards", []))

    if loaded_rows != source_rows:
        raise SystemExit("knowledge shard cards do not round-trip to source rows")
    if manifest.get("total_cards") != len(source_rows):
        raise SystemExit("knowledge shard total_cards mismatch")
    if manifest.get("shard_count") != len(manifest.get("shards", [])):
        raise SystemExit("knowledge shard_count mismatch")

    routing_path = shard_dir / "routing.json"
    if not routing_path.exists():
        raise SystemExit(f"missing knowledge routing index: {routing_path}")
    routing = read_json(routing_path)
    if routing.get("schema_version") != 1:
        raise SystemExit("unexpected knowledge routing schema_version")
    if routing.get("source_sha256") != source_meta.get("sha256"):
        raise SystemExit("knowledge routing source sha256 mismatch")
    if routing.get("source_path") != expected_source_path:
        raise SystemExit("knowledge routing source path mismatch")
    if DEFAULT_SOURCE_OF_TRUTH.exists() and routing.get("source_of_truth", {}).get("path") != source_of_truth.get("path"):
        raise SystemExit("knowledge routing source_of_truth mismatch")
    if routing.get("shard_count") != manifest.get("shard_count"):
        raise SystemExit("knowledge routing shard_count mismatch")
    routing_shards = routing.get("shards", [])
    if len(routing_shards) != manifest.get("shard_count"):
        raise SystemExit("knowledge routing shards length mismatch")
    valid_indexes = {shard["index"] for shard in manifest.get("shards", [])}
    manifest_files = {shard["index"]: shard["file"] for shard in manifest.get("shards", [])}
    for shard in routing_shards:
        index = shard.get("index")
        if index not in valid_indexes:
            raise SystemExit(f"knowledge routing shard index invalid: {index}")
        if shard.get("file") != manifest_files[index]:
            raise SystemExit(f"knowledge routing shard file mismatch: {index}")
        for forbidden in ("cards", "answers", "what", "how", "use", "why"):
            if forbidden in shard:
                raise SystemExit(f"knowledge routing shard includes answer field: {forbidden}")
    for entry in routing.get("entries", []):
        if not (isinstance(entry, list) and len(entry) == 2 and isinstance(entry[0], str) and isinstance(entry[1], list)):
            raise SystemExit("knowledge routing entry shape invalid")
        if any(index not in valid_indexes for index in entry[1]):
            raise SystemExit(f"knowledge routing entry points to invalid shard: {entry[0]}")

    return {
        "ok": True,
        "total_cards": len(source_rows),
        "shard_count": manifest["shard_count"],
        "max_shard_bytes": max_observed_bytes,
        "routing_entries": len(routing.get("entries", [])),
        "routing_bytes": routing_path.stat().st_size,
        "source_bytes": source.stat().st_size,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate static knowledge shards.")
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--shard-dir", default=DEFAULT_OUT_DIR)
    parser.add_argument("--max-bytes", type=int, default=180_000)
    args = parser.parse_args()

    result = validate(Path(args.source), Path(args.shard_dir), args.max_bytes)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
