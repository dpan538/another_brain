#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKER = ROOT / "training/from_scratch/APPROVE_R27A6_AUTONOMOUS_LONGRUN_DIALOGUE_READINESS_V1.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a6_autonomous_longrun_dialogue_readiness_v1")
    args = ap.parse_args()
    marker = json.loads(MARKER.read_text(encoding="utf-8"))
    if marker.get("campaign_id") != args.campaign_id:
        raise SystemExit("r27a6_marker_campaign_mismatch")
    marker["consumed"] = True
    marker["consumed_at_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    marker["consumed_by_phase"] = "R27A6"
    marker["consumed_by_commit"] = "pending_r27a6_commit"
    marker["consumed_reason"] = "R27A6 autonomous bounded campaign completed or safely blocked; future training requires fresh approval."
    MARKER.write_text(json.dumps(marker, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "consumed": True, "active_training_approval_count": 0}, indent=2))


if __name__ == "__main__":
    main()
