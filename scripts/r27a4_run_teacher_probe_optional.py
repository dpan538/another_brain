#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--execute-live-teacher", action="store_true")
args = ap.parse_args()
enabled = args.execute_live_teacher and os.environ.get("R27A4_ALLOW_LIVE_TEACHER") == "1"
status = "blocked_no_credentials" if args.execute_live_teacher and not enabled else "disabled_by_default"
report = {"ok": True, "live_teacher_called": False, "live_teacher_probe_status": status, "requires_flag": True, "requires_env": "R27A4_ALLOW_LIVE_TEACHER=1"}
out = Path("artifacts/r27a4/reports/live_teacher_probe_report.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
print(json.dumps(report, indent=2, sort_keys=True))
