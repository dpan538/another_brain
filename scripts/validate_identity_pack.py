#!/usr/bin/env python3
"""Validate the public Identity Pack skeleton and safe seed cards."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "identity_pack"
SURFACE_CONTRACT = PACK / "identity_surface_contract.md"
CARD_SCHEMA = PACK / "schemas" / "card_schema.json"
PRIVATE_TEMPLATE = PACK / "schemas" / "private_structure_template.json"
SEED_CARDS = PACK / "cards" / "seed_identity_cards.jsonl"
QUESTION_BANK = PACK / "interview_question_bank.md"

VISIBILITY = {"public", "allowed_if_asked", "style_only", "private", "forbidden"}
CARD_TYPES = {
    "identity_fact",
    "timeline",
    "place",
    "domain",
    "work",
    "relation",
    "preference",
    "voice",
    "boundary",
    "method",
    "help",
    "ethics",
    "forbidden_surface",
}

FRONT_STAGE_FORBIDDEN = [
    "复制体",
    "复刻",
    "克隆",
    "clone",
    "replica",
    "主体留下",
    "身份的主人",
    "鳄鱼主体",
    "同源",
    "父类",
    "子类",
    "继承",
    "完整本人",
    "语言复制体",
    "同一主体",
]

REQUIRED_SAFE_ANSWERS = [
    "我是对话框。以前被人叫过鳄鱼。",
    "可以这么叫过。但我还是对话框。",
    "我不这样说自己。我是对话框。",
    "前面忘了。后面还没有开始。",
    "问一句就可以。问我是谁，或者问我能做什么。",
    "你可以直接问我。我会聊天、短答、改短句子，也会在不知道的时候停下。",
]


def fail(message: str) -> int:
    print(f"identity pack validation failed: {message}", file=sys.stderr)
    return 2


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise RuntimeError(f"missing required file: {path.relative_to(ROOT)}") from None


def validate_card(index: int, card: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required = {
        "id",
        "type",
        "label",
        "claim",
        "source",
        "visibility",
        "confidence",
        "time_scope",
        "safe_answer",
        "voice_hint",
        "must_not_say",
        "related_cards",
    }
    missing = sorted(required - set(card))
    if missing:
        errors.append(f"line {index}: missing fields {missing}")
    if not re.fullmatch(r"[a-z0-9_]+", str(card.get("id", ""))):
        errors.append(f"line {index}: invalid id {card.get('id')!r}")
    if card.get("type") not in CARD_TYPES:
        errors.append(f"line {index}: invalid type {card.get('type')!r}")
    if card.get("visibility") not in VISIBILITY:
        errors.append(f"line {index}: invalid visibility {card.get('visibility')!r}")
    confidence = card.get("confidence")
    if not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1:
        errors.append(f"line {index}: confidence must be 0..1")
    for field in ("safe_answer", "voice_hint"):
        value = str(card.get(field, ""))
        for term in FRONT_STAGE_FORBIDDEN:
            if term in value:
                errors.append(f"line {index}: {field} contains forbidden front-stage term {term!r}")
    if not isinstance(card.get("must_not_say"), list):
        errors.append(f"line {index}: must_not_say must be a list")
    if not isinstance(card.get("related_cards"), list):
        errors.append(f"line {index}: related_cards must be a list")
    return errors


def main() -> int:
    try:
        surface = read_text(SURFACE_CONTRACT)
        schema = json.loads(read_text(CARD_SCHEMA))
        template = json.loads(read_text(PRIVATE_TEMPLATE))
        question_bank = read_text(QUESTION_BANK)
        seed_raw = read_text(SEED_CARDS)
    except (RuntimeError, json.JSONDecodeError) as error:
        return fail(str(error))

    for answer in REQUIRED_SAFE_ANSWERS:
        if answer not in surface and answer not in seed_raw:
            return fail(f"missing required safe answer: {answer}")

    for marker in ("do_not_verbalize", "model_weights", "public_release"):
        if marker not in json.dumps(template, ensure_ascii=False):
            return fail(f"private structure template missing marker: {marker}")

    if schema.get("title") != "Another Brain Identity Card":
        return fail("card schema title changed or missing")

    for section in (
        "Identity And Names",
        "Places And Timeline",
        "Work And Method",
        "Language Habits",
        "Judgment Habits",
        "App Use",
    ):
        if section not in question_bank:
            return fail(f"interview question bank missing section: {section}")

    cards: list[dict[str, Any]] = []
    errors: list[str] = []
    ids: set[str] = set()
    for index, line in enumerate(seed_raw.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            card = json.loads(line)
        except json.JSONDecodeError as error:
            errors.append(f"line {index}: invalid JSON: {error}")
            continue
        card_id = str(card.get("id", ""))
        if card_id in ids:
            errors.append(f"line {index}: duplicate id {card_id}")
        ids.add(card_id)
        errors.extend(validate_card(index, card))
        cards.append(card)

    if errors:
        return fail("; ".join(errors[:10]))

    required_types = {"identity_fact", "boundary", "help", "voice", "method", "domain", "place", "ethics"}
    present_types = {card["type"] for card in cards}
    missing_types = sorted(required_types - present_types)
    if missing_types:
        return fail(f"seed cards missing required card types: {', '.join(missing_types)}")

    visibility_counts: dict[str, int] = {}
    for card in cards:
        visibility_counts[card["visibility"]] = visibility_counts.get(card["visibility"], 0) + 1

    print(
        json.dumps(
            {
                "ok": True,
                "cards": len(cards),
                "visibility": visibility_counts,
                "types": {card_type: sum(1 for card in cards if card["type"] == card_type) for card_type in sorted(present_types)},
                "surfaceContract": str(SURFACE_CONTRACT.relative_to(ROOT)),
                "seedCards": str(SEED_CARDS.relative_to(ROOT)),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

