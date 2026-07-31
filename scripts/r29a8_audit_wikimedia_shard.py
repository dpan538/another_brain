#!/usr/bin/env python3
"""Build an ignored, reviewable Chinese continuation candidate from one dump shard.

The script is deliberately local-only: its input and output are explicit paths,
and it writes no repository corpus.  A later review must still admit the report
through ``r29a8_foundation_source_gate`` before training may consume the output.
"""
from __future__ import annotations

import argparse
import bz2
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path


EVAL_PHRASES = ("代理指标便于测量，却可能偏离真正目标", "混杂因素会制造表面相关", "平均数会掩盖群体间的不同结果", "结论强度应匹配证据质量")
TEMPLATE_RE = re.compile(r"\{\{[^{}]*\}\}")
REF_RE = re.compile(r"<ref[^>]*>.*?</ref\s*>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
LINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")
SPACE_RE = re.compile(r"\s+")


def clean_wikitext(text: str) -> str:
    value = str(text or "")
    for _ in range(4):
        next_value = TEMPLATE_RE.sub(" ", value)
        if next_value == value:
            break
        value = next_value
    value = REF_RE.sub(" ", value)
    value = TAG_RE.sub(" ", value)
    value = LINK_RE.sub(r"\1", value)
    value = re.sub(r"'{2,}", "", value)
    return SPACE_RE.sub(" ", value).strip()


def chinese_ratio(text: str) -> float:
    visible = [char for char in text if not char.isspace()]
    if not visible:
        return 0.0
    return sum("\u4e00" <= char <= "\u9fff" for char in visible) / len(visible)


def split_for(title: str) -> str:
    bucket = int(hashlib.sha256(title.encode("utf-8")).hexdigest()[:8], 16) % 100
    return "train" if bucket < 90 else "dev" if bucket < 95 else "heldout"


def build_candidate(input_path: Path, output_path: Path, max_clean_chars: int) -> dict:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    counts = {"pages_seen": 0, "namespace_filtered": 0, "short_or_non_chinese": 0, "eval_phrase_excluded": 0, "accepted": 0, "clean_chars": 0, "split_counts": {"train": 0, "dev": 0, "heldout": 0}}
    seen_hashes: set[str] = set()
    with bz2.open(input_path, "rb") as source, output_path.open("w", encoding="utf-8") as target:
        for _, element in ET.iterparse(source, events=("end",)):
            if not element.tag.endswith("page"):
                continue
            counts["pages_seen"] += 1
            ns = element.findtext("{*}ns") or ""
            title = element.findtext("{*}title") or ""
            raw = element.findtext(".//{*}text") or ""
            element.clear()
            if ns != "0" or not title:
                counts["namespace_filtered"] += 1
                continue
            text = clean_wikitext(raw)
            if len(text) < 240 or chinese_ratio(text) < 0.55:
                counts["short_or_non_chinese"] += 1
                continue
            if any(phrase in text for phrase in EVAL_PHRASES):
                counts["eval_phrase_excluded"] += 1
                continue
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            if digest in seen_hashes:
                continue
            seen_hashes.add(digest)
            row = {"source_id": "zhwiki_20260701_articles_part1", "title": title, "text": text, "text_sha256": digest, "split": split_for(title), "license": "CC-BY-SA-4.0", "training_allowed": False}
            target.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            counts["accepted"] += 1; counts["clean_chars"] += len(text); counts["split_counts"][row["split"]] += 1
            if counts["clean_chars"] >= max_clean_chars:
                break
    return {"ok": counts["accepted"] > 0, "input": str(input_path), "output": str(output_path), "max_clean_chars": max_clean_chars, "counts": counts, "heldout_exclusion": {"enabled": True, "method": "exact exclusion of project R29 heldout answer phrases plus deterministic page-title split"}, "raw_external_text_committed": False, "processed_corpus_committed": False, "training_started": False}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--max-clean-chars", type=int, default=12_000_000)
    args = parser.parse_args()
    report = build_candidate(args.input, args.output, args.max_clean_chars)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
