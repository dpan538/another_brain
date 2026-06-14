#!/usr/bin/env python3
"""Validate launch-governance files and production-lock policy."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POLICY_PATH = ROOT / "docs" / "release_governance.md"
STATUS_PATH = ROOT / "evals" / "release_policy" / "release_status.json"
SURFACE_PATH = ROOT / "web" / "surface_identity.js"
README_PATH = ROOT / "README.md"
PACKAGE_PATH = ROOT / "package.json"

REQUIRED_POLICY_PHRASES = [
    "我是对话框。",
    "以前被人叫过鳄鱼。",
    "前面忘了。后面还没有开始。",
    "Production review is allowed only after R0-R8 are passed.",
    "frontend answer after submit <= 1500 ms on a loaded page",
    "tiny_router_model.generated.js is observed, not a production blocker",
    "assistant-tone rate <= 2%",
    "blind median >= 11/16",
]

REQUIRED_SURFACE_SNIPPETS = [
    'self: "我是对话框。以前被人叫过鳄鱼。"',
    'copyRefusal: "我不这样说自己。我是对话框。"',
    'engineeringRefusal: "这太像说明书了。对话框就是对话框。"',
    "FORBIDDEN_SURFACE_IDENTITY_OUTPUT_RE",
]

FORBIDDEN_OUTPUT_TERMS = [
    "复制体",
    "复刻",
    "克隆",
    "clone",
    "replica",
    "鳄鱼主体",
    "主体留下",
    "身份的主人",
    "同源",
    "父类",
    "子类",
    "继承",
    "完整本人",
    "语言复制体",
    "同一主体",
]


def fail(message: str) -> int:
    print(f"launch policy check failed: {message}", file=sys.stderr)
    return 2


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise RuntimeError(f"missing required file: {path.relative_to(ROOT)}") from None


def main() -> int:
    try:
        policy = read(POLICY_PATH)
        surface = read(SURFACE_PATH)
        readme = read(README_PATH)
        status = json.loads(read(STATUS_PATH))
        package = json.loads(read(PACKAGE_PATH))
    except (RuntimeError, json.JSONDecodeError) as error:
        return fail(str(error))

    for phrase in REQUIRED_POLICY_PHRASES:
        if phrase not in policy:
            return fail(f"policy missing required phrase: {phrase}")

    for snippet in REQUIRED_SURFACE_SNIPPETS:
        if snippet not in surface:
            return fail(f"surface identity contract missing snippet: {snippet}")

    regex_match = re.search(r"FORBIDDEN_SURFACE_IDENTITY_OUTPUT_RE\s*=\s*/(.+?)/i;", surface, re.S)
    if not regex_match:
        return fail("cannot find forbidden surface identity output regex")
    regex_source = regex_match.group(1)
    missing_terms = [term for term in FORBIDDEN_OUTPUT_TERMS if term not in regex_source]
    if missing_terms:
        return fail(f"surface identity sanitizer missing terms: {', '.join(missing_terms)}")

    if "not an omniscient assistant or a generic chatbot" not in readme:
        return fail("README must preserve non-omniscient dialog positioning")

    scripts = package.get("scripts", {})
    if "check:launch-policy" not in scripts:
        return fail("package.json missing check:launch-policy script")
    if "check:launch-policy" not in scripts.get("check", ""):
        return fail("npm run check must include check:launch-policy")

    milestones = status.get("milestones", {})
    required = [f"R{i}_" for i in range(0, 9)]
    for prefix in required:
        if not any(key.startswith(prefix) for key in milestones):
            return fail(f"release status missing milestone prefix: {prefix}")

    final_allowed = bool(status.get("final_release_allowed"))
    if final_allowed:
        not_passed = [name for name, item in milestones.items() if name.startswith(tuple(required)) and item.get("status") != "passed"]
        if not_passed:
            return fail(f"final release is allowed but milestones are not passed: {', '.join(not_passed)}")
    thresholds = status.get("production_thresholds", {})
    if "tiny_router_web_bytes_max" in thresholds:
        return fail("tiny-router byte size must be informational, not a production threshold")
    if thresholds.get("frontend_answer_max_ms") != 1500:
        return fail("frontend answer latency budget must remain 1500ms")
    if thresholds.get("critical_failures_max") != 0:
        return fail("critical failure budget must remain 0")

    print(
        json.dumps(
            {
                "ok": True,
                "policy": str(POLICY_PATH.relative_to(ROOT)),
                "status": str(STATUS_PATH.relative_to(ROOT)),
                "finalReleaseAllowed": final_allowed,
                "currentStage": status.get("current_stage"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
