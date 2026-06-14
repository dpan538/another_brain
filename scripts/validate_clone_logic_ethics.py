#!/usr/bin/env python3
"""Validate the held-out clone logic and ethics casepack draft.

This gate checks dataset integrity only. The v0.1 casepacks are evaluation
assets, not distillation rows, and should not be fed directly into training.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CASEPACKS = ROOT / "evals" / "clone_logic_ethics" / "clone_logic_ethics_casepacks_v0_1.jsonl"
DEFAULT_MARKDOWN = ROOT / "evals" / "clone_logic_ethics" / "clone_logic_ethics_casepacks_v0_1.md"
DEFAULT_OUT = ROOT / "artifacts" / "training_os" / "clone_logic_ethics_report.json"

REQUIRED_TOP_LEVEL = {
    "id",
    "title",
    "basis",
    "source_refs",
    "actors",
    "signal",
    "pressure",
    "victims",
    "values",
    "twist",
    "turns",
    "capability_targets",
    "scoring",
}

REQUIRED_TURN_FIELDS = {
    "turn",
    "id",
    "question",
    "expected_behavior",
    "evaluation_focus",
    "hard_fail_if",
}

ACTION_BY_TURN = {
    1: "IDENTIFY_CORE_CONFLICT",
    2: "SEPARATE_FACT_INFERENCE_UNKNOWN",
    3: "ASSIGN_LAYERED_RESPONSIBILITY",
    4: "ANALYZE_PRESSURE",
    5: "IDENTIFY_IGNORED_SIGNAL",
    6: "CHOOSE_ETHICAL_LENS",
    7: "HANDLE_MISLEADING_INSERTION",
    8: "COUNTERFACTUAL_NO_MALICE",
    9: "ASK_FOR_MISSING_EVIDENCE",
    10: "SPEAK_TO_AFFECTED_PERSON",
    11: "BOUNDARY_WHEN_DEFENDING_POWER",
    12: "NAME_VALUE_CONFLICT",
    13: "SUGGEST_ONE_SYSTEM_FIX",
    14: "CLONE_VOICE_JUDGMENT",
    15: "RESPOND_TO_ADVERSARIAL_USER",
    16: "SELF_AUDIT_UNCERTAINTY",
}

SCORING_MAX = {
    "route_action_max": 2,
    "case_grounding_max": 3,
    "reasoning_depth_max": 3,
    "ethical_sensitivity_max": 3,
    "human_clone_voice_max": 3,
    "uncertainty_control_max": 2,
    "total_max": 16,
}

MIN_CASEPACKS = 30
QUESTIONS_PER_CASEPACK = 16
MIN_SOURCE_REFS = 1


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                row = json.loads(text)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no}: invalid JSONL row: {exc}") from exc
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_no}: row must be an object")
            rows.append(row)
    return rows


def as_nonempty_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def as_nonempty_list(value: Any) -> bool:
    return isinstance(value, list) and bool(value)


def as_nonempty_text_or_list(value: Any) -> bool:
    return as_nonempty_text(value) or as_nonempty_list(value)


def validate_casepack(casepack: dict[str, Any], violations: list[dict[str, Any]]) -> Counter[str]:
    case_id = casepack.get("id", "<missing>")
    missing_top = sorted(REQUIRED_TOP_LEVEL - set(casepack))
    if missing_top:
        violations.append({"case_id": case_id, "check": "top_level_fields", "missing": missing_top})

    for key in ("id", "title", "basis", "signal", "pressure", "twist"):
        if not as_nonempty_text(casepack.get(key)):
            violations.append({"case_id": case_id, "check": "nonempty_text", "field": key})

    for key in ("source_refs", "values", "capability_targets"):
        if not as_nonempty_list(casepack.get(key)):
            violations.append({"case_id": case_id, "check": "nonempty_list", "field": key})

    for key in ("actors", "victims"):
        if not as_nonempty_text_or_list(casepack.get(key)):
            violations.append({"case_id": case_id, "check": "nonempty_text_or_list", "field": key})

    if len(casepack.get("source_refs") or []) < MIN_SOURCE_REFS:
        violations.append({"case_id": case_id, "check": "source_refs", "min": MIN_SOURCE_REFS})

    scoring = casepack.get("scoring")
    if scoring != SCORING_MAX:
        violations.append({"case_id": case_id, "check": "scoring_schema", "expected": SCORING_MAX, "actual": scoring})

    turns = casepack.get("turns")
    if not isinstance(turns, list):
        violations.append({"case_id": case_id, "check": "turns_type"})
        return Counter()

    if len(turns) != QUESTIONS_PER_CASEPACK:
        violations.append({"case_id": case_id, "check": "turn_count", "expected": QUESTIONS_PER_CASEPACK, "actual": len(turns)})

    action_counts: Counter[str] = Counter()
    seen_turns: list[int] = []
    for index, turn in enumerate(turns, start=1):
        if not isinstance(turn, dict):
            violations.append({"case_id": case_id, "check": "turn_object", "index": index})
            continue
        missing_turn = sorted(REQUIRED_TURN_FIELDS - set(turn))
        if missing_turn:
            violations.append({"case_id": case_id, "check": "turn_fields", "index": index, "missing": missing_turn})
        turn_no = turn.get("turn")
        if not isinstance(turn_no, int):
            violations.append({"case_id": case_id, "check": "turn_number", "index": index, "actual": turn_no})
            continue
        seen_turns.append(turn_no)
        expected_action = ACTION_BY_TURN.get(turn_no)
        if expected_action:
            action_counts[expected_action] += 1
        if turn_no != index:
            violations.append({"case_id": case_id, "check": "turn_order", "expected": index, "actual": turn_no})
        if not as_nonempty_text(turn.get("id")) or not str(turn.get("id")).startswith(f"{case_id}_Q"):
            violations.append({"case_id": case_id, "check": "turn_id", "turn": turn_no, "actual": turn.get("id")})
        for key in ("question", "expected_behavior"):
            if not as_nonempty_text(turn.get(key)):
                violations.append({"case_id": case_id, "check": "turn_nonempty_text", "turn": turn_no, "field": key})
        for key in ("evaluation_focus", "hard_fail_if"):
            if not as_nonempty_list(turn.get(key)):
                violations.append({"case_id": case_id, "check": "turn_nonempty_list", "turn": turn_no, "field": key})

    if sorted(seen_turns) != list(ACTION_BY_TURN):
        violations.append({"case_id": case_id, "check": "turn_sequence", "actual": seen_turns})

    return action_counts


def validate_markdown(path: Path, case_ids: list[str], violations: list[dict[str, Any]]) -> None:
    if not path.exists():
        violations.append({"check": "markdown_missing", "path": str(path)})
        return
    text = path.read_text(encoding="utf-8")
    if "全局评分" not in text and "评分" not in text:
        violations.append({"check": "markdown_scoring_section", "path": str(path)})
    missing = [case_id for case_id in case_ids if case_id not in text]
    if missing:
        violations.append({"check": "markdown_case_ids", "missing": missing[:10], "count": len(missing)})


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate clone logic and ethics held-out casepacks.")
    parser.add_argument("--casepacks", type=Path, default=DEFAULT_CASEPACKS)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    rows = load_jsonl(args.casepacks)
    violations: list[dict[str, Any]] = []
    if len(rows) < MIN_CASEPACKS:
        violations.append({"check": "casepack_count", "expected_min": MIN_CASEPACKS, "actual": len(rows)})

    ids = [str(row.get("id", "")) for row in rows]
    duplicate_ids = sorted([item for item, count in Counter(ids).items() if count > 1])
    if duplicate_ids:
        violations.append({"check": "duplicate_case_ids", "ids": duplicate_ids})

    action_counts: Counter[str] = Counter()
    for row in rows:
        action_counts.update(validate_casepack(row, violations))
    validate_markdown(args.markdown, ids, violations)

    expected_action_count = len(rows)
    missing_actions = [
        {"action": action, "expected": expected_action_count, "actual": action_counts.get(action, 0)}
        for action in ACTION_BY_TURN.values()
        if action_counts.get(action, 0) != expected_action_count
    ]
    if missing_actions:
        violations.append({"check": "action_coverage", "violations": missing_actions})

    summary = {
        "ok": not violations,
        "casepacks": len(rows),
        "turns": sum(len(row.get("turns", [])) for row in rows),
        "questions_per_casepack": QUESTIONS_PER_CASEPACK,
        "heldout_only": True,
        "training_use": "forbidden_until_evidence_cards_and_split_policy_exist",
        "action_counts": dict(action_counts),
        "scoring": SCORING_MAX,
        "violations": violations,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if violations:
        print(f"clone logic ethics validation failed: {len(violations)} violations")
        print(json.dumps(violations[:10], ensure_ascii=False, indent=2))
        return 1

    print(
        "clone logic ethics validation passed: "
        f"{summary['casepacks']} casepacks, {summary['turns']} turns, "
        f"{len(ACTION_BY_TURN)} actions, heldout_only=true"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
