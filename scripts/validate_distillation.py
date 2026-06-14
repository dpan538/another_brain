#!/usr/bin/env python3
"""Validate distillation dataset and optional adapter training status."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


FORBIDDEN = [
    "知识卡",
    "素材标签",
    "项目名",
    "检索",
    "作为一个 AI",
    "AI助手",
    "/Users/",
    "/Volumes/",
    "里关于",
    "里处理",
    "里把",
    "里的概念",
    "中处理",
    "开发中的",
    "通常要靠代码",
    "放在一起考虑",
    "讨论",
    "适不适合被用在某个地方",
    "细节会影响电路",
    "知道一点会少踩坑",
    "拍摄时要处理的",
    "放进同一个画面判断",
    "怎样起作用",
    "变成能看、能用",
    "会用到的词",
    "互相牵连",
    "放到同一个问题里",
    "怎样安排",
    "能不能可靠工作",
    "和工程里的结构、制造、可靠性有关",
    "和语言怎么说、怎么写、怎么理解有关",
    "和影像、镜头、媒体表达有关",
    "最后要看它怎么让人读下去",
    "要看功能、成本和可靠性",
    "通常要同时看",
    "会谈到的问题或概念",
    "会遇到的概念",
    "日常会用到的东西",
    "可以被谈到的东西",
    "可以说，但不一定要说很满",
    "和工程中的设计",
    "和语言的声音、结构或意思有关",
    "和绘画里的材料、技法或观看方式有关",
    "和版画或印刷的制作过程有关",
    "和设计里的信息、界面或视觉秩序有关",
    "和代码、系统或网络有关",
    "和工程里的结构、制造或可靠性有关",
    "是地理名称，可能是地方、山河或区域",
    "和影像、镜头或媒体表达有关",
    "是做某类工作的人",
    "问的是语言怎样起作用",
    "答案不会只有一个",
    "同一个画面问题",
    "落到界面或版面上",
    "适合先知道大概",
    "先知道",
]

FORBIDDEN_REGEXES = [
    re.compile(r"^.+是.+里(?:的)?[^。]{1,18}问题。$"),
    re.compile(r"^.+是.+里(?:的)?[^。]{1,18}词。$"),
]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as fp:
        for line in fp:
            if line.strip():
                yield json.loads(line)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate distillation artifacts.")
    parser.add_argument("--distill-dir", default="artifacts/distillation")
    parser.add_argument("--min-rows", type=int, default=10000)
    parser.add_argument("--require-trained", action="store_true")
    args = parser.parse_args()
    root = Path(args.distill_dir)
    violations: list[dict[str, Any]] = []
    required = ["manifest.json", "chinese_short_answer_sft.jsonl", "train.jsonl", "eval.jsonl"]
    for name in required:
        if not (root / name).exists():
            violations.append({"check": "required_file", "missing": name})
    if violations:
        print(json.dumps({"ok": False, "violations": violations}, ensure_ascii=False, indent=2))
        return 2
    manifest = load_json(root / "manifest.json")
    if manifest.get("rows", 0) < args.min_rows:
        violations.append({"check": "row_count", "actual": manifest.get("rows", 0), "expected": f">={args.min_rows}"})
    sample_count = 0
    bad_lengths = 0
    for row in iter_jsonl(root / "chinese_short_answer_sft.jsonl"):
        sample_count += 1
        text = json.dumps(row, ensure_ascii=False)
        for term in FORBIDDEN:
            if term in text:
                violations.append({"check": "forbidden_term", "term": term, "id": row.get("id")})
                break
        for message in row.get("messages", []):
            content = message.get("content", "")
            if message.get("role") == "assistant" and any(pattern.search(content) for pattern in FORBIDDEN_REGEXES):
                violations.append({"check": "forbidden_regex", "content": content, "id": row.get("id")})
                break
        assistant = [msg.get("content", "") for msg in row.get("messages", []) if msg.get("role") == "assistant"]
        if assistant and max(len(item) for item in assistant) > 240:
            bad_lengths += 1
        if sample_count >= 3000 and violations:
            break
    if bad_lengths:
        violations.append({"check": "assistant_length", "count": bad_lengths})
    status_path = root / "training_status.json"
    status = load_json(status_path) if status_path.exists() else {"status": "not_started"}
    if args.require_trained and status.get("status") != "trained":
        violations.append({"check": "training_status", "actual": status.get("status")})
    result = {
        "ok": not violations,
        "rows": manifest.get("rows"),
        "train_rows": manifest.get("train_rows"),
        "eval_rows": manifest.get("eval_rows"),
        "training_status": status.get("status"),
        "violations": violations[:40],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not violations else 2


if __name__ == "__main__":
    raise SystemExit(main())
