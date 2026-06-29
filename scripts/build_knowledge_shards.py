#!/usr/bin/env python3
"""Build static knowledge shards from the checked-in generated JS build source."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "build_sources" / "knowledge" / "knowledge_base.generated.js"
DEFAULT_OUT_DIR = ROOT / "web" / "knowledge_shards"
DEFAULT_MAX_BYTES = 180_000
DEFAULT_SOURCE_OF_TRUTH = ROOT / "knowledge_sources" / "registry.json"
NORMALIZE_RE = re.compile(r"[\s\-＿_—–~～`\"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』]")

STATS_RE = re.compile(
    r"export const GENERATED_KNOWLEDGE_STATS = (.*?);\n\n"
    r"export const GENERATED_KNOWLEDGE_CARDS = ",
    re.S,
)
ROWS_RE = re.compile(
    r"export const GENERATED_KNOWLEDGE_CARDS = (.*)"
    r"\.map\(\(\[domain, label, aliases, answers\]\)",
    re.S,
)


def parse_source(path: Path) -> tuple[dict, list[list]]:
    text = path.read_text(encoding="utf-8")
    stats_match = STATS_RE.search(text)
    rows_match = ROWS_RE.search(text)
    if not stats_match or not rows_match:
        raise SystemExit(f"could not parse generated knowledge source: {path}")
    stats = json.loads(stats_match.group(1))
    rows = json.loads(rows_match.group(1))
    return stats, rows


def compact_json(payload: object) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalize_term(text: object) -> str:
    return NORMALIZE_RE.sub("", str(text or "").lower()).strip()


def pack_shards(rows: list[list], max_bytes: int) -> list[list[list]]:
    shards: list[list[list]] = []
    current: list[list] = []

    def encoded_size(index: int, items: list[list]) -> int:
        payload = {"schema_version": 1, "index": index, "cards": items}
        return len((compact_json(payload) + "\n").encode("utf-8"))

    for row in rows:
        candidate = [*current, row]
        if current and encoded_size(len(shards), candidate) > max_bytes:
            shards.append(current)
            current = [row]
        else:
            current = candidate
    if current:
        shards.append(current)
    return shards


def build_routing(manifest: dict, shards: list[list[list]], source_sha: str) -> dict:
    entry_map: dict[str, set[int]] = {}

    for index, cards in enumerate(shards):
        for row in cards:
            if len(row) < 3:
                continue
            terms = [row[1], *(row[2] if isinstance(row[2], list) else [])]
            for term in terms:
                normalized = normalize_term(term)
                if not normalized:
                    continue
                entry_map.setdefault(normalized, set()).add(index)

    entries = [[term, sorted(indexes)] for term, indexes in sorted(entry_map.items(), key=lambda item: item[0])]
    routing = {
        "schema_version": 1,
        "source_sha256": source_sha,
        "source_path": manifest["source"]["path"],
        "shard_count": manifest["shard_count"],
        "shards": [
            {
                "index": shard["index"],
                "file": shard["file"],
                "bytes": shard["bytes"],
                "domains": shard.get("domains", []),
                "first_label": shard.get("first_label", ""),
                "last_label": shard.get("last_label", ""),
            }
            for shard in manifest["shards"]
        ],
        "entries": entries,
    }
    if "source_of_truth" in manifest:
        routing["source_of_truth"] = manifest["source_of_truth"]
    return routing


def build(source: Path, out_dir: Path, max_bytes: int) -> dict:
    source = source.resolve()
    out_dir = out_dir.resolve()
    stats, rows = parse_source(source)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    source_text = source.read_text(encoding="utf-8")
    source_sha = sha256_text(source_text)
    shards = pack_shards(rows, max_bytes)
    manifest_shards = []

    for index, cards in enumerate(shards):
        name = f"shard_{index:03d}.json"
        payload = {"schema_version": 1, "index": index, "cards": cards}
        text = compact_json(payload) + "\n"
        path = out_dir / name
        path.write_text(text, encoding="utf-8")
        labels = [str(card[1]) for card in cards]
        domains = sorted({str(card[0]) for card in cards})
        manifest_shards.append(
            {
                "file": name,
                "index": index,
                "cards": len(cards),
                "bytes": len(text.encode("utf-8")),
                "sha256": sha256_text(text),
                "first_label": labels[0] if labels else "",
                "last_label": labels[-1] if labels else "",
                "domains": domains,
            }
        )

    manifest = {
        "schema_version": 1,
        "source": {
            "path": source.relative_to(ROOT).as_posix() if source.is_relative_to(ROOT) else source.as_posix(),
            "sha256": source_sha,
            "bytes": source.stat().st_size,
        },
        "stats": stats,
        "total_cards": len(rows),
        "shard_max_bytes": max_bytes,
        "shard_count": len(manifest_shards),
        "shards": manifest_shards,
    }
    if DEFAULT_SOURCE_OF_TRUTH.exists():
        registry = json.loads(DEFAULT_SOURCE_OF_TRUTH.read_text(encoding="utf-8"))
        manifest["source_of_truth"] = {
            "path": DEFAULT_SOURCE_OF_TRUTH.relative_to(ROOT).as_posix(),
            "source_set_id": registry.get("source_set_id", ""),
            "row_count": registry.get("row_count", len(rows)),
            "chunk_count": len(registry.get("sources", [])),
        }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    routing = build_routing(manifest, shards, source_sha)
    (out_dir / "routing.json").write_text(
        json.dumps(routing, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Build static knowledge shard JSON files.")
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    args = parser.parse_args()

    manifest = build(Path(args.source), Path(args.out_dir), args.max_bytes)
    print(
        json.dumps(
            {
                "ok": True,
                "total_cards": manifest["total_cards"],
                "shard_count": manifest["shard_count"],
                "max_shard_bytes": max(s["bytes"] for s in manifest["shards"]),
                "out_dir": str(Path(args.out_dir)),
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
