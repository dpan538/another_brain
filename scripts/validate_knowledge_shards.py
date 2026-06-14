#!/usr/bin/env python3
"""Validate generated knowledge shards against the monolithic public artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from build_knowledge_shards import DEFAULT_OUT_DIR, DEFAULT_SOURCE, parse_source, sha256_text


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(source: Path, shard_dir: Path, max_bytes: int) -> dict:
    stats, source_rows = parse_source(source)
    manifest_path = shard_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"missing shard manifest: {manifest_path}")
    manifest = read_json(manifest_path)
    if manifest.get("schema_version") != 1:
        raise SystemExit("unexpected shard manifest schema_version")

    source_text = source.read_text(encoding="utf-8")
    source_meta = manifest.get("source", {})
    if source_meta.get("sha256") != sha256_text(source_text):
        raise SystemExit("knowledge shard manifest source sha256 does not match source")
    if manifest.get("stats") != stats:
        raise SystemExit("knowledge shard stats do not match source stats")

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

    return {
        "ok": True,
        "total_cards": len(source_rows),
        "shard_count": manifest["shard_count"],
        "max_shard_bytes": max_observed_bytes,
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
