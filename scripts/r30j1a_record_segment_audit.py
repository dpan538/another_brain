#!/usr/bin/env python3
"""Record the parent decision after all synchronous segment auditors return."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_json(path: Path, value: Any) -> None:
    atomic_text(path, json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    parser.add_argument("--segment-id", required=True)
    parser.add_argument("--metrics-status", choices=("HEALTHY", "UNDERFIT", "OVERFIT", "UNSTABLE", "INCONCLUSIVE"), required=True)
    parser.add_argument("--shortcut-status", choices=("PASS", "WARN", "FAIL"), required=True)
    parser.add_argument("--integrity-status", choices=("PASS", "WARN", "FAIL"), required=True)
    parser.add_argument("--decision", choices=("CONTINUE", "ADJUST_ONE_VARIABLE", "HOLD", "ABORT"), required=True)
    parser.add_argument("--reason", required=True)
    parser.add_argument("--next-change", default="none")
    parser.add_argument("--triggering-resource-snapshot-missing", action="store_true")
    parser.add_argument("--checkpoint-forensics-only", action="store_true")
    args = parser.parse_args()
    root = args.artifact_root / "training_flight_recorder" / "segments" / args.segment_id
    receipt = json.loads((root / "segment_receipt.json").read_text(encoding="utf-8"))
    dev = json.loads((root / "dev_eval.json").read_text(encoding="utf-8")) if (root / "dev_eval.json").exists() else {"skipped": True}
    completed = receipt.get("completed") is True
    failed = receipt.get("failed") is True and completed is False
    if not (completed or failed) or receipt.get("parent_decision_pending") is not True:
        raise ValueError("segment_not_ready_for_parent_decision")
    if args.triggering_resource_snapshot_missing:
        if not failed or not str(receipt.get("failure_code", "")).endswith(("swap_growth_stop", "memory_pressure_not_normal", "mlx_hard_stop_exceeded")):
            raise ValueError("resource_snapshot_correction_not_applicable")
        receipt["last_persisted_resource_swap_delta_bytes"] = receipt.get("swap_delta_bytes")
        receipt["swap_delta_bytes"] = None
        receipt["resource_telemetry_complete"] = False
        receipt["triggering_resource_snapshot_persisted"] = False
    if args.checkpoint_forensics_only:
        if not failed or receipt.get("checkpoint_verified") is not True:
            raise ValueError("forensics_only_checkpoint_not_applicable")
        receipt["checkpoint_forensics_only"] = True
        receipt["checkpoint_role"] = "FORENSIC_DURABLE_ONLY"
        receipt["continuation_authorized"] = False
        receipt["resume_allowed"] = False
        receipt["restart_from_original_seed_required"] = True
    if completed and args.decision in {"CONTINUE", "ADJUST_ONE_VARIABLE"} and args.integrity_status == "FAIL":
        raise ValueError("cannot_continue_after_integrity_failure")
    if failed and args.decision == "CONTINUE":
        raise ValueError("failed_segment_cannot_continue")
    if failed and args.decision == "ADJUST_ONE_VARIABLE" and receipt.get("resume_allowed") is not False:
        raise ValueError("failed_segment_adjustment_requires_fresh_restart")
    if args.decision == "ADJUST_ONE_VARIABLE" and args.next_change == "none":
        raise ValueError("adjustment_requires_one_named_change")
    metrics_summary = {
        "auditor": "METRICS_AUDITOR",
        "status": args.metrics_status,
        "domain_macro_f1": dev.get("domain", {}).get("macro_f1"),
        "register_macro_f1": dev.get("register", {}).get("macro_f1"),
        "mechanics_macro_f1": dev.get("mechanics", {}).get("macro_f1"),
        "representation_collapsed": dev.get("representation", {}).get("collapsed"),
        "raw_text_included": False,
    }
    shortcut_summary = {
        "auditor": "PERSONALIZATION_AND_SHORTCUT_AUDITOR",
        "status": args.shortcut_status,
        "maximum_shortcut_drop_points": dev.get("maximum_shortcut_drop_points"),
        "matched_style_contrast_accuracy": dev.get("representation", {}).get("matched_style_contrast_accuracy"),
        "p2_used_as_analysis_only": True,
        "normative_persona_truth_assigned": False,
        "raw_text_included": False,
    }
    checkpoint_receipt = receipt.get("checkpoint")
    checkpoint_verified = bool(
        receipt.get("checkpoint_verified", checkpoint_receipt.get("verified", False) if isinstance(checkpoint_receipt, dict) else False)
    )
    integrity_summary = {
        "auditor": "RESOURCE_AND_INTEGRITY_AUDITOR",
        "status": args.integrity_status,
        "segment_completed": completed,
        "failure_code": receipt.get("failure_code"),
        "checkpoint_created": receipt.get("checkpoint_created", completed),
        "checkpoint_verified": checkpoint_verified,
        "heldout_opened": receipt["heldout_opened"],
        "swap_delta_bytes": receipt["swap_delta_bytes"],
        "resource_telemetry_complete": receipt.get("resource_telemetry_complete", True),
        "peak_mlx_memory_bytes": receipt["peak_mlx_memory_bytes"],
        "background_training": receipt["background_training"],
        "raw_text_included": False,
    }
    atomic_json(root / "metrics_audit.json", metrics_summary)
    atomic_json(root / "personalization_shortcut_audit.json", shortcut_summary)
    atomic_json(root / "integrity_audit.json", integrity_summary)
    decision = {
        "schema_version": "r30j1a.parent-decision.v1",
        "segment": args.segment_id,
        "decision": args.decision,
        "reason": args.reason,
        "metrics_reviewed": metrics_summary,
        "shortcut_reviewed": shortcut_summary,
        "resource_reviewed": integrity_summary,
        "checkpoint_verified": integrity_summary["checkpoint_verified"],
        "next_change_if_any": args.next_change,
        "one_primary_variable_at_most": True,
        "all_synchronous_auditors_returned": True,
        "training_running_during_audit": False,
        "triggering_resource_snapshot_missing": args.triggering_resource_snapshot_missing,
        "checkpoint_forensics_only": args.checkpoint_forensics_only,
    }
    atomic_json(root / "parent_decision.json", decision)
    receipt["parent_decision_pending"] = False
    receipt["parent_decision"] = args.decision
    atomic_json(root / "segment_receipt.json", receipt)
    campaign_path = args.artifact_root / "campaign_state.json"
    campaign = json.loads(campaign_path.read_text(encoding="utf-8"))
    if args.checkpoint_forensics_only:
        campaign["forensics_checkpoint"] = campaign.get("active_checkpoint")
        campaign["active_checkpoint"] = None
        campaign["continuation_checkpoint_authorized"] = False
    campaign.update({
        "state": "SEGMENT_AUDIT",
        "current_process": None,
        "active_segment": args.segment_id,
        "parent_decision_pending": False,
        "last_parent_decision": args.decision,
        "next_change_if_any": args.next_change,
    })
    atomic_json(campaign_path, campaign)
    atomic_json(args.artifact_root / "heartbeat_latest.json", {
        "campaign_id": campaign["campaign_id"],
        "state": campaign["state"],
        "current_process": None,
        "process_running": False,
        "training_running": False,
        "segment_id": args.segment_id,
        "parent_decision_pending": False,
        "last_parent_decision": args.decision,
    })
    print(json.dumps({"valid": True, "segment": args.segment_id, "decision": args.decision}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
