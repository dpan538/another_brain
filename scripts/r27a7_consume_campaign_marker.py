#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a7_autonomous_controller import LEDGER, load_json, now_utc, write_json


MARKER = ROOT / "training/from_scratch/APPROVE_R27A7_MPS_24H_LARGE_DECODER_V1.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a7_mps_24h_large_decoder_v1")
    args = ap.parse_args()
    marker = load_json(MARKER)
    if marker.get("campaign_id") != args.campaign_id:
        raise SystemExit("r27a7_marker_campaign_mismatch")
    marker.update({
        "consumed": True,
        "consumed_at_utc": now_utc(),
        "consumed_by_phase": "R27A7",
        "consumed_by_commit": "pending_r27a7_commit",
        "consumed_reason": "R27A7 bounded campaign completed or safely stopped; future training requires fresh approval.",
    })
    write_json(MARKER, marker)
    ledger = load_json(LEDGER, {"campaign_id": args.campaign_id, "stages": []})
    ledger["active_approval_after_completion"] = 0
    write_json(LEDGER, ledger)
    print(json.dumps(marker, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
