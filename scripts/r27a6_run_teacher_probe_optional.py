#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--execute-live-teacher", action="store_true")
ap.add_argument("--max-requests", type=int, default=500)
ap.add_argument("--max-output-tokens", type=int, default=512)
ap.add_argument("--provider", default="")
args = ap.parse_args()
enabled = args.execute_live_teacher and os.environ.get("R27A6_ALLOW_LIVE_TEACHER") == "1"
has_provider = bool(args.provider or os.environ.get("R27A6_TEACHER_PROVIDER"))
status = "disabled_by_default"
if args.execute_live_teacher and not enabled:
    status = "blocked_requires_R27A6_ALLOW_LIVE_TEACHER"
elif args.execute_live_teacher and enabled and not has_provider:
    status = "blocked_no_credentials"
elif args.execute_live_teacher and enabled and has_provider:
    status = "blocked_live_teacher_client_not_configured_in_repo"
report = {
    "ok": True,
    "live_teacher_called": False,
    "live_teacher_probe_status": status,
    "requires_flag": True,
    "requires_env": "R27A6_ALLOW_LIVE_TEACHER=1",
    "max_requests": args.max_requests,
    "max_output_tokens": args.max_output_tokens,
    "provider_configured": has_provider,
    "stores_final_answer_only": True,
}
out = Path("artifacts/r27a6/reports/live_teacher_probe_report.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
print(json.dumps(report, indent=2, sort_keys=True))
