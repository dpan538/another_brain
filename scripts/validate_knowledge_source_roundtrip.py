#!/usr/bin/env python3
"""Validate that reviewed knowledge source chunks round-trip to generated rows."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from build_knowledge_base import (
    DEFAULT_BUILD_SOURCE_OUT,
    DEFAULT_SOURCE_REGISTRY,
    SPECIFIC_FACTS,
    build_cards_from_sources,
    write_outputs,
)
from build_knowledge_shards import parse_source


ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_KEYS = {
    "chain_of_thought",
    "chain-of-thought",
    "hidden_prompt",
    "system_prompt",
    "private_memory",
    "raw_private_data",
}


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_jsonl(path: Path):
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if line.strip():
            yield line_number, json.loads(line)


def find_forbidden_keys(value: object, path: str = "") -> list[str]:
    failures: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            key_path = f"{path}.{key}" if path else str(key)
            if str(key).lower() in FORBIDDEN_KEYS:
                failures.append(key_path)
            failures.extend(find_forbidden_keys(child, key_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            failures.extend(find_forbidden_keys(child, f"{path}[{index}]"))
    return failures


def compact_rows(cards: list[dict]) -> list[list]:
    return [[card["domain"], card["label"], card["aliases"], card["answers"]] for card in cards]


def expected_stats(cards: list[dict], generated_at: str) -> dict:
    return {
        "schema_version": 1,
        "generated_at": generated_at,
        "concept_cards": len(cards),
        "answer_fields": sum(len(card["answers"]) for card in cards),
        "specific_fact_cards": sum(1 for card in cards if card["label"] in SPECIFIC_FACTS),
        "domains": sorted({card["domain"] for card in cards}),
        "policy": {
            "cloud_inference_api_allowed": False,
            "contains_project_paths": False,
            "contains_internal_asset_labels": False,
            "purpose": "local persona-shaped common knowledge for short natural answers",
            "voice": "short conversational facts; no encyclopedia tone and no unexplained poetic metaphors",
        },
    }


def main() -> int:
    failures: list[str] = []
    registry_path = DEFAULT_SOURCE_REGISTRY
    build_source_path = DEFAULT_BUILD_SOURCE_OUT
    registry = read_json(registry_path)
    cards, generated_at = build_cards_from_sources(registry_path)
    source_rows = compact_rows(cards)

    seen_ids: set[str] = set()
    seen_label_domain: set[tuple[str, str]] = set()
    for source in registry.get("sources", []):
        source_path = ROOT / "knowledge_sources" / source["path"]
        for line_number, row in iter_jsonl(source_path):
            source_id = row.get("source_id")
            if source_id in seen_ids:
                failures.append(f"duplicate_source_id:{source_id}")
            seen_ids.add(source_id)
            label_domain = (str(row.get("domain") or ""), str(row.get("label") or ""))
            if label_domain in seen_label_domain:
                failures.append(f"duplicate_domain_label:{label_domain[0]}:{label_domain[1]}")
            seen_label_domain.add(label_domain)
            if row.get("contains_private_data") is not False:
                failures.append(f"private_data_not_false:{source_path}:{line_number}")
            if not row.get("license_or_permission"):
                failures.append(f"missing_license_or_permission:{source_path}:{line_number}")
            for forbidden in find_forbidden_keys(row):
                failures.append(f"forbidden_key:{source_path}:{line_number}:{forbidden}")

    current_stats, current_rows = parse_source(build_source_path)
    if current_rows != source_rows:
        failures.append("current_build_source_rows_do_not_match_knowledge_sources")
    for key in ("schema_version", "concept_cards", "answer_fields", "domains", "policy"):
        if current_stats.get(key) != expected_stats(cards, generated_at or "").get(key):
            failures.append(f"current_stats_mismatch:{key}")

    with tempfile.TemporaryDirectory(prefix="another-brain-knowledge-roundtrip-") as temp:
        temp_path = Path(temp)
        temp_js = temp_path / "knowledge_base.generated.js"
        temp_json = temp_path / "knowledge_base.generated.json"
        write_outputs(cards, temp_json, temp_js, generated_at=generated_at)
        temp_stats, temp_rows = parse_source(temp_js)
        if temp_rows != source_rows:
            failures.append("temp_generated_rows_do_not_match_knowledge_sources")
        if temp_stats != expected_stats(cards, generated_at or ""):
            failures.append("temp_generated_stats_do_not_match_expected")

    report = {
        "ok": not failures,
        "registry": registry_path.relative_to(ROOT).as_posix(),
        "build_source": build_source_path.relative_to(ROOT).as_posix(),
        "source_rows": len(source_rows),
        "current_generated_rows": len(current_rows),
        "source_files": len(registry.get("sources", [])),
        "generated_at": generated_at,
        "failures": failures,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 2 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
