#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.distillation.live_teacher_probe import prepare_probe

PROMPT_BANK = {
    "symbolic": [
        "如果证据只能证明A，能不能顺手断言B？",
        "一个回答什么时候应该挑战问题前提？",
        "2026-07-05 的后三天是哪一天？",
    ],
    "public_rag": [
        "给定证据只说明项目是浏览器端静态运行，能否推断它已经有产品模型？",
        "证据不足时，回答应该怎样保持诚实？",
    ],
    "value_aesthetic": [
        "为什么泛泛的客服式回答不适合another_brain？",
        "一个个人答案表面为什么需要保留判断和边界？",
    ],
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-prompts", type=int, default=1000)
    ap.add_argument("--sources", default="symbolic,public_rag,value_aesthetic")
    ap.add_argument("--final-answer-only", action="store_true")
    ap.add_argument("--no-private-data", action="store_true")
    ap.add_argument("--no-eval-prompts", action="store_true")
    args = ap.parse_args()
    selected = []
    for source in [s.strip() for s in args.sources.split(",") if s.strip()]:
        selected.extend(PROMPT_BANK.get(source, []))
    rows = []
    idx = 0
    while len(rows) < args.max_prompts and selected:
        rows.append(prepare_probe(selected[idx % len(selected)]))
        idx += 1
    report = {
        "ok": True,
        "probe_rows": len(rows),
        "sources": args.sources,
        "final_answer_only": bool(args.final_answer_only),
        "no_private_data": bool(args.no_private_data),
        "no_eval_prompts": bool(args.no_eval_prompts),
        "live_teacher_called": False,
    }
    out = ROOT / "artifacts/r27a6/distillation/live_teacher_probe_batch.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"ok": True, "rows": rows, "report": report}, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "artifacts/r27a6/reports").mkdir(parents=True, exist_ok=True)
    (ROOT / "artifacts/r27a6/reports/live_teacher_prepare_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
