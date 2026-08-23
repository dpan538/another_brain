#!/usr/bin/env python3
"""Reconcile an interrupted R30J1A segment from its durable event log."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r30j1a_supervision import build_failed_segment_receipt  # noqa: E402
from src.training.mlx.r30j1a_training import CAMPAIGN_ID, append_jsonl, atomic_json, utc_now  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--segment-id", required=True)
    parser.add_argument("--failure-code", required=True)
    args = parser.parse_args()
    artifact_root = args.artifact_root.resolve()
    segment_root = artifact_root / "training_flight_recorder" / "segments" / args.segment_id
    receipt = build_failed_segment_receipt(
        segment_root=segment_root,
        error=args.failure_code,
        failure_source="parent_reconciliation_from_durable_events",
        checkpoint_root=artifact_root / "checkpoints" / args.segment_id,
    )
    receipt["failed_at"] = utc_now()
    atomic_json(segment_root / "segment_receipt.json", receipt)
    append_jsonl(artifact_root / "training_flight_recorder" / "timeline.jsonl", {
        "event": "SEGMENT_FAILURE_RECONCILED",
        "segment_id": args.segment_id,
        "failure_code": receipt["failure_code"],
        "attempted_optimizer_updates": receipt["attempted_optimizer_updates"],
        "durable_global_optimizer_step": receipt["durable_global_optimizer_step"],
        "at": utc_now(),
    })
    attempted = receipt["attempted_training_state"]
    durable = receipt["durable_training_state"]
    atomic_json(artifact_root / "campaign_state.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": "SEGMENT_AUDIT",
        **durable,
        "current_process": None,
        "active_segment": args.segment_id,
        "active_checkpoint": None,
        "training_started": int(attempted["global_optimizer_step"]) > 0,
        "attempted_training_state": attempted,
        "discarded_uncheckpointed_optimizer_updates": receipt["discarded_uncheckpointed_optimizer_updates"],
        "heldout_opened": False,
        "descriptive_bootstrap_authorized": True,
        "normative_persona_training_authorized": False,
        "final_persona_training_authorized": False,
        "foreground_training": True,
        "background_training": False,
        "parent_decision_pending": True,
        "last_segment_failed": True,
        "failure_code": receipt["failure_code"],
        "updated_at": utc_now(),
    })
    atomic_json(artifact_root / "heartbeat_latest.json", {
        "campaign_id": CAMPAIGN_ID,
        "state": "SEGMENT_AUDIT",
        "current_process": None,
        "process_running": False,
        "training_running": False,
        "segment_id": args.segment_id,
        "durable_global_optimizer_step": receipt["durable_global_optimizer_step"],
        "attempted_ending_global_optimizer_step": receipt["attempted_ending_global_optimizer_step"],
        "parent_decision_pending": True,
        "failure_code": receipt["failure_code"],
        "updated_at": utc_now(),
    })
    print(json.dumps({
        "valid": True,
        "segment": args.segment_id,
        "completed": False,
        "attempted_updates": receipt["attempted_optimizer_updates"],
        "durable_step": receipt["durable_global_optimizer_step"],
        "checkpoint_verified": receipt["checkpoint_verified"],
        "parent_decision_pending": True,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
