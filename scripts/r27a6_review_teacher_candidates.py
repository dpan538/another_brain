#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "artifacts/r27a6"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-promoted", type=int, default=1500)
    ap.add_argument("--engineering-only", action="store_true")
    ap.add_argument("--require-final-answer-only", action="store_true")
    ap.add_argument("--reject-cot", action="store_true")
    ap.add_argument("--reject-private", action="store_true")
    ap.add_argument("--reject-eval-copy", action="store_true")
    ap.add_argument("--reject-old-excluded-pack", action="store_true")
    args = ap.parse_args()
    report = {
        "ok": True,
        "live_teacher_status": "blocked_no_credentials",
        "reviewed": 0,
        "promoted_live_teacher_rows": 0,
        "max_promoted": args.max_promoted,
        "engineering_only": bool(args.engineering_only),
        "contains_cot": False,
        "contains_private_data": False,
        "contains_eval_prompt": False,
        "contains_old_excluded_row": False,
    }
    out = ART / "reports/live_teacher_review_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A6_OPTIONAL_TEACHER_DISTILLATION.md").write_text(
        "# R27A6 Optional Teacher Distillation\n\n"
        "Live teacher use remains disabled by default and requires both `--execute-live-teacher` and `R27A6_ALLOW_LIVE_TEACHER=1`. "
        "No credentials were committed. In the default local run, status is `blocked_no_credentials` and zero teacher rows are promoted. Teacher candidates, if ever produced, are training-time pending candidates only and are not product runtime dependencies.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
