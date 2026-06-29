#!/usr/bin/env python3
"""Extract reviewed JSONL knowledge source chunks from the generated build source."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from build_knowledge_shards import DEFAULT_SOURCE, parse_source


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = ROOT / "knowledge_sources"
DEFAULT_CHUNK_ROWS = 1500
SOURCE_TYPE = "repo_derived"
REVIEW_STATUS = "mechanically_extracted_r24g"
LICENSE = "project repository derived generated knowledge"
NOTES = "Mechanical R24G extraction from the R24F generated build source; no factual edits."
GENERATED_AT = "2026-06-28T00:00:00+00:00"


def compact_json(payload: object) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def source_row(order: int, row: list, source_path: str, source_sha256: str) -> dict:
    domain, label, aliases, answers = row
    return {
        "source_id": f"r24g_card_{order:06d}",
        "order": order,
        "domain": domain,
        "label": label,
        "aliases": aliases if isinstance(aliases, list) else [],
        "answers": answers if isinstance(answers, dict) else {},
        "source_type": SOURCE_TYPE,
        "provenance": {
            "source_type": SOURCE_TYPE,
            "source_path": source_path,
            "source_sha256": source_sha256,
            "method": "mechanical_extract_from_r24f_build_source",
        },
        "review_status": REVIEW_STATUS,
        "contains_private_data": False,
        "license_or_permission": LICENSE,
        "notes": NOTES,
    }


def write_chunk(path: Path, rows: list[dict]) -> dict:
    text = "".join(compact_json(row) + "\n" for row in rows)
    path.write_text(text, encoding="utf-8")
    domains = sorted({str(row["domain"]) for row in rows})
    return {
        "path": path.relative_to(path.parents[1]).as_posix(),
        "index": int(path.stem.split("_")[-1]),
        "rows": len(rows),
        "order_start": rows[0]["order"] if rows else None,
        "order_end": rows[-1]["order"] if rows else None,
        "bytes": len(text.encode("utf-8")),
        "sha256": sha256_text(text),
        "domains": domains,
        "source_type": SOURCE_TYPE,
        "provenance": {
            "source_type": SOURCE_TYPE,
            "method": "mechanical_extract_from_r24f_build_source",
        },
        "review_status": REVIEW_STATUS,
        "contains_private_data": False,
        "license_or_permission": LICENSE,
        "notes": NOTES,
    }


def extract(source: Path, out_dir: Path, chunk_rows: int) -> dict:
    source = source.resolve()
    out_dir = out_dir.resolve()
    source_rel = source.relative_to(ROOT).as_posix() if source.is_relative_to(ROOT) else source.as_posix()
    source_text = source.read_text(encoding="utf-8")
    source_sha = sha256_text(source_text)
    stats, rows = parse_source(source)

    cards_dir = out_dir / "cards"
    cards_dir.mkdir(parents=True, exist_ok=True)
    for stale in cards_dir.glob("cards_*.jsonl"):
        stale.unlink()

    chunk_entries = []
    for chunk_index, start in enumerate(range(0, len(rows), chunk_rows)):
        chunk = [
            source_row(order, row, source_rel, source_sha)
            for order, row in enumerate(rows[start : start + chunk_rows], start=start)
        ]
        chunk_entries.append(write_chunk(cards_dir / f"cards_{chunk_index:03d}.jsonl", chunk))

    domains_manifest = {
        "schema_version": 1,
        "domains": sorted({str(row[0]) for row in rows}),
        "domain_counts": {
            domain: sum(1 for row in rows if row[0] == domain)
            for domain in sorted({str(row[0]) for row in rows})
        },
    }
    (cards_dir / "domains_manifest.json").write_text(
        json.dumps(domains_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    registry = {
        "schema_version": 1,
        "source_set_id": "r24g_knowledge_sources",
        "generated_at": GENERATED_AT,
        "description": "Mechanically extracted reviewed source chunks for the generated knowledge build source.",
        "generated_from": {
            "path": source_rel,
            "sha256": source_sha,
            "bytes": source.stat().st_size,
            "stats": stats,
        },
        "row_count": len(rows),
        "chunk_rows": chunk_rows,
        "default_metadata": {
            "source_type": SOURCE_TYPE,
            "provenance": {
                "source_type": SOURCE_TYPE,
                "source_path": source_rel,
                "source_sha256": source_sha,
                "method": "mechanical_extract_from_r24f_build_source",
            },
            "review_status": REVIEW_STATUS,
            "contains_private_data": False,
            "license_or_permission": LICENSE,
            "notes": NOTES,
        },
        "sources": chunk_entries,
    }
    registry_path = out_dir / "registry.json"
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    return {
        "ok": True,
        "source": source_rel,
        "source_sha256": source_sha,
        "cards": len(rows),
        "chunks": len(chunk_entries),
        "largest_chunk_bytes": max(entry["bytes"] for entry in chunk_entries),
        "registry_sha256": sha256_bytes(registry_path.read_bytes()),
        "out_dir": out_dir.relative_to(ROOT).as_posix() if out_dir.is_relative_to(ROOT) else out_dir.as_posix(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract knowledge source JSONL chunks from the build source.")
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    parser.add_argument("--chunk-rows", type=int, default=DEFAULT_CHUNK_ROWS)
    args = parser.parse_args()

    result = extract(Path(args.source), Path(args.out_dir), args.chunk_rows)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
