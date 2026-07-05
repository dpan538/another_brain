#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKER = ROOT / "training/from_scratch/APPROVE_R27A5_SUSTAINED_PILOT_DISTILLATION_V1.json"


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a5_sustained_pilot_distillation_v1")
    args = ap.parse_args()
    marker = json.loads(MARKER.read_text(encoding="utf-8"))
    if marker.get("run_id") != args.campaign_id:
        raise SystemExit("campaign_marker_id_mismatch")
    marker["consumed"] = True
    marker["allow_additional_runs"] = False
    marker["consumed_by_phase"] = "R27A5"
    marker["consumed_by_commit"] = "pending_r27a5_commit"
    marker["consumed_at_utc"] = now_utc()
    marker["consumed_reason"] = "R27A5 bounded engineering campaign completed or safely stopped; future runs require a new approval marker."
    MARKER.write_text(json.dumps(marker, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({"ok": True, "active_training_approval_count": 0, "consumed": True}, indent=2))


if __name__ == "__main__":
    main()
