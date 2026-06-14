#!/usr/bin/env python3
"""Validate the 100x16 mixed context stress-case design."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CASES = ROOT / "web" / "context_stress_cases.json"
GROUP_COUNT = 100
GROUP_SIZE = 16
VISIBLE_CONTEXT_WINDOW = 4
REASONING_CONTEXT_WINDOW = 12


def fail(failures: list[dict[str, Any]], group_id: str, message: str, **extra: Any) -> None:
    failures.append({"group": group_id, "message": message, **extra})


def validate(payload: dict[str, Any]) -> dict[str, Any]:
    failures: list[dict[str, Any]] = []
    groups = payload.get("groups", [])
    if len(groups) != GROUP_COUNT:
        failures.append({"group": "*", "message": "wrong group count", "actual": len(groups), "expected": GROUP_COUNT})

    seen_ids: set[str] = set()
    mode_counts: dict[str, int] = {}
    context_assertions = 0
    total_questions = 0

    for index, group in enumerate(groups, start=1):
        group_id = str(group.get("id") or f"#{index}")
        mode = str(group.get("mode") or "")
        themes = list(group.get("themes") or [])
        turns = list(group.get("turns") or [])
        mode_counts[mode] = mode_counts.get(mode, 0) + 1
        total_questions += len(turns)

        expected_id = f"context_{index:03d}"
        if group_id != expected_id:
            fail(failures, group_id, "wrong group id", actual=group_id, expected=expected_id)
        if group_id in seen_ids:
            fail(failures, group_id, "duplicate group id")
        seen_ids.add(group_id)
        if len(turns) != GROUP_SIZE:
            fail(failures, group_id, "wrong turn count", actual=len(turns), expected=GROUP_SIZE)
        if len({turn.get("q", "") for turn in turns}) != len(turns):
            fail(failures, group_id, "duplicate question inside group")

        if 1 <= index <= 20:
            if mode != "single_topic":
                fail(failures, group_id, "groups 001-020 must be single_topic", actual=mode)
            if len(themes) != 1:
                fail(failures, group_id, "single_topic group must have exactly one theme", actual=len(themes))
        elif 21 <= index <= 59:
            if mode != "adjacent_bridge":
                fail(failures, group_id, "groups 021-059 must be adjacent_bridge", actual=mode)
            if len(themes) != 2:
                fail(failures, group_id, "adjacent_bridge group must have exactly two themes", actual=len(themes))
        elif 60 <= index <= 80:
            if mode != "soft_multi_insert":
                fail(failures, group_id, "groups 060-080 must be soft_multi_insert", actual=mode)
            if len(themes) <= 3:
                fail(failures, group_id, "soft_multi_insert must contain more than three themes", actual=len(themes))
        elif 81 <= index <= 100:
            if mode != "hard_mixed":
                fail(failures, group_id, "groups 081-100 must be hard_mixed", actual=mode)
            if len(themes) <= 3:
                fail(failures, group_id, "hard_mixed must contain more than three themes", actual=len(themes))

        group_context_assertions = 0
        for turn_index, item in enumerate(turns, start=1):
            if not str(item.get("q") or "").strip():
                fail(failures, group_id, "empty question", turn=turn_index)
            if not str(item.get("theme") or "").strip():
                fail(failures, group_id, "empty turn theme", turn=turn_index)
            if not str(item.get("purpose") or "").strip():
                fail(failures, group_id, "empty turn purpose", turn=turn_index)

            assertion = item.get("context_assert")
            if turn_index == 1:
                if assertion:
                    fail(failures, group_id, "first turn must not require prior context", turn=turn_index)
                if item.get("requires_context_delta") is not False:
                    fail(failures, group_id, "first turn must not require context delta", turn=turn_index)
                continue
            if not assertion:
                fail(failures, group_id, "every turn after first must require recent context", turn=turn_index)
                continue
            if not isinstance(item.get("requires_context_delta"), bool):
                fail(failures, group_id, "requires_context_delta must be boolean", turn=turn_index)
            group_context_assertions += 1
            context_assertions += 1
            if "target_turn" in assertion and not 1 <= int(assertion["target_turn"]) < turn_index:
                fail(failures, group_id, "target_turn must point to an earlier turn", turn=turn_index, target=assertion["target_turn"])
            if "target_turns" in assertion:
                targets = [int(target) for target in assertion["target_turns"]]
                if any(target < 1 or target >= turn_index for target in targets):
                    fail(failures, group_id, "target_turns must point to earlier turns", turn=turn_index, targets=targets)
            if "target_range" in assertion:
                start, end = [int(value) for value in assertion["target_range"]]
                if start < 1 or end > turn_index or start > end:
                    fail(failures, group_id, "target_range must end at or before current turn", turn=turn_index, target_range=[start, end])
                expected_start = max(1, turn_index - REASONING_CONTEXT_WINDOW)
                expected_end = turn_index - 1
                if start != expected_start or end != expected_end:
                    fail(
                        failures,
                        group_id,
                        "target_range must match rolling context window",
                        turn=turn_index,
                        actual=[start, end],
                        expected=[expected_start, expected_end],
                    )
                neighbor_range = assertion.get("offline_neighbor_range")
                if neighbor_range:
                    offline_start, offline_end = [int(value) for value in neighbor_range]
                    expected_offline = [max(1, turn_index - REASONING_CONTEXT_WINDOW), min(GROUP_SIZE, turn_index + REASONING_CONTEXT_WINDOW)]
                    if [offline_start, offline_end] != expected_offline:
                        fail(
                            failures,
                            group_id,
                            "offline_neighbor_range must match before/after reasoning window",
                            turn=turn_index,
                            actual=[offline_start, offline_end],
                            expected=expected_offline,
                        )
                if int(assertion.get("visible_window", VISIBLE_CONTEXT_WINDOW)) != VISIBLE_CONTEXT_WINDOW:
                    fail(failures, group_id, "visible_window mismatch", turn=turn_index, actual=assertion.get("visible_window"))
                if int(assertion.get("reasoning_window", REASONING_CONTEXT_WINDOW)) != REASONING_CONTEXT_WINDOW:
                    fail(failures, group_id, "reasoning_window mismatch", turn=turn_index, actual=assertion.get("reasoning_window"))

        expected_assertions = GROUP_SIZE - 1
        if group_context_assertions != expected_assertions:
            fail(
                failures,
                group_id,
                "wrong context assertion count",
                actual=group_context_assertions,
                expected=expected_assertions,
            )

    return {
        "ok": not failures,
        "groups": len(groups),
        "questions": total_questions,
        "modeCounts": dict(sorted(mode_counts.items())),
        "contextAssertions": context_assertions,
        "failures": failures[:50],
        "failureCount": len(failures),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate mixed context stress cases.")
    parser.add_argument("--cases", default=str(DEFAULT_CASES))
    args = parser.parse_args()
    path = Path(args.cases)
    result = validate(json.loads(path.read_text(encoding="utf-8")))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    sys.exit(main())
