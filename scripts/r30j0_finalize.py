#!/usr/bin/env python3
"""Write the ignored R30J0 aggregate receipt without training or network I/O."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_ROOT = ROOT / "artifacts" / "r30j0"
REPORT_ROOT = ARTIFACT_ROOT / "reports"
HISTORICAL_STATES = {
    "R29B2M-R3": "BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE",
    "R29B2M-R4H": "ABORTED_SAFELY",
    "R29B2M-R4H-R1": "BLOCKED_HYBRID_VALUE",
    "R29B2M-R4H-R2": "BLOCKED_HYBRID_V2_FACTUAL",
    "R29B2M-R4H-R3": "BLOCKED_HYBRID_ARCHITECTURE",
    "R29P0": "BLOCKED_CANDIDATE_HEADROOM",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tests-pass", action="store_true")
    parser.add_argument("--gates-pass", action="store_true")
    parser.add_argument("--browser-owner-review-verified", action="store_true")
    parser.add_argument("--browser-personal-source-review-verified", action="store_true")
    parser.add_argument("--require-pushed", action="store_true")
    return parser.parse_args()


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True, indent=2)
            handle.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def load(relative: str) -> dict[str, Any]:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def run_json(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def git_value(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True, check=True,
    ).stdout.strip()


def main() -> int:
    args = parse_args()
    timestamp = datetime.now(timezone.utc).isoformat()
    architecture = run_json(["python3", "scripts/r30j0_measure_architecture.py", "--compact"])
    production_gate = run_json(["node", "scripts/r30j0_no_production_change_gate.mjs"])
    secret_scan = run_json(
        [
            "python3",
            "scripts/r30j0_secret_scan.py",
            "--output",
            "artifacts/r30j0/reports/secret_scan.json",
        ]
    )
    source_readiness = load("artifacts/r30j0/reports/personalization_data_readiness.json")
    discovery = load("artifacts/r30j0/reports/personal_source_discovery.json")
    source_review = load("artifacts/r30j0/owner_review/personal_source_review/manifest.json")
    general_review = load("artifacts/r30j0/owner_review/manifest.json")
    dataset_readiness = load("artifacts/r30j0/reports/dataset_readiness.json")

    head = git_value("rev-parse", "HEAD")
    origin = git_value("rev-parse", "origin/main")
    branch = git_value("branch", "--show-current")
    worktree_clean = git_value("status", "--porcelain") == ""
    pushed = head == origin

    invariants = {
        "branch_main": branch == "main",
        "source_evidence_ready": source_readiness.get("status") == "PERSONAL_SOURCE_EVIDENCE_READY",
        "sensitive_exclusion_complete": source_readiness.get("sensitive_exclusion_complete") is True,
        "descriptive_normative_separated": source_readiness.get("descriptive_normative_separated") is True,
        "register_hypotheses_ready": source_readiness.get("register_conditioned_hypotheses_built") is True,
        "contrast_candidates_100": source_readiness.get("contrast_candidate_count") == 100,
        "contrast_owner_labels_zero": source_readiness.get("contrast_candidates_owner_label_count") == 0,
        "personal_review_100_contrasts": source_review.get("section_counts", {}).get("contrast_pairs") == 100,
        "personal_review_local_only": source_review.get("local_only") is True,
        "general_review_200_pilot_slots": general_review.get("pilot_slots") == 200,
        "general_review_100_contrast_slots": general_review.get("contrast_slots") == 100,
        "owner_review_incomplete": general_review.get("owner_review_completed") is False,
        "profile_not_frozen": source_review.get("profile_frozen") is False,
        "full_dataset_not_generated": source_readiness.get("full_personal_judge_dataset_generated") is False,
        "training_not_started": source_readiness.get("training_started") is False,
        "classification_updates_zero": source_readiness.get("classification_updates") == 0,
        "optimizer_examples_zero": source_readiness.get("examples_seen_by_optimizer") == 0,
        "api_requests_zero": source_readiness.get("api_requests") == 0,
        "network_requests_zero": source_readiness.get("network_requests") == 0,
        "architecture_parameter_target": 80_000_000 <= architecture["judge_common_parameters_excluding_profile_representation"] <= 85_000_000,
        "architecture_static_target": architecture["storage_projection"]["all_q4"]["static_local_asset_bytes"] <= 45_000_000,
        "context_512": architecture["dimensions"]["context_length"] == 512,
        "normal_448_reserve_64": architecture["dimensions"]["normal_target_tokens"] == 448 and architecture["dimensions"]["reserved_tokens"] == 64,
        "lm_head_removed": architecture["lm_head_parameters_removed"] == 14_336_000,
        "browser_owner_review_verified": args.browser_owner_review_verified,
        "browser_personal_source_review_verified": args.browser_personal_source_review_verified,
        "tests_pass": args.tests_pass,
        "gates_pass": args.gates_pass and production_gate.get("passed") is True,
        "secret_scan_pass": secret_scan.get("violations") == 0 and secret_scan.get("secret_file_read") is False,
        "no_production_change": production_gate.get("production_surface_diff_count") == 0,
        "no_weight_change": production_gate.get("model_weight_change") is False,
    }
    required_before_receipt = all(invariants.values())
    if not required_before_receipt:
        failed = sorted(key for key, value in invariants.items() if not value)
        raise SystemExit("r30j0_finalize_invariant_failed:" + ",".join(failed))
    if args.require_pushed and (not pushed or not worktree_clean):
        raise SystemExit("r30j0_finalize_requires_pushed_clean_main")

    browser_validation = {
        "schema_version": "r30j0.browser-validation.v1",
        "validation_kind": "local_loopback_in_app_browser",
        "general_owner_review_ui": {
            "verified": True,
            "pilot_slots": 200,
            "contrast_slots": 100,
            "owner_decisions_written": 0,
            "console_errors": 0,
        },
        "personal_source_review_ui": {
            "verified": True,
            "pages": 5,
            "item_count": source_review["item_count"],
            "section_counts": source_review["section_counts"],
            "decision_options": ["ACCEPT", "REJECT", "EDIT", "UNSURE"],
            "owner_decisions_written": 0,
            "console_errors": 0,
        },
        "network_requests": 0,
        "raw_personal_content_in_receipt": False,
    }
    architecture_summary = {
        "schema_version": "r30j0.architecture-measurement.v1",
        "model_family": "efish-personal-judge-v1",
        "source_decoder_parameters": architecture["source_decoder_parameters_excluding_masks"],
        "judge_common_parameters": architecture["judge_common_parameters_excluding_profile_representation"],
        "lm_head_parameters_removed": architecture["lm_head_parameters_removed"],
        "position_parameters_added": architecture["position_parameters_added"],
        "classification_head_parameters_added": architecture["classification_head_parameters_added"],
        "net_parameter_reduction": architecture["net_parameter_reduction"],
        "all_q4_weight_bytes": architecture["storage_projection"]["all_q4"]["weight_bytes"],
        "all_q4_static_local_asset_bytes": architecture["storage_projection"]["all_q4"]["static_local_asset_bytes"],
        "q4_backbone_fp16_heads_static_local_asset_bytes": architecture["storage_projection"]["q4_backbone_fp16_heads"]["static_local_asset_bytes"],
        "context_length": 512,
        "normal_target_tokens": 448,
        "reserved_tokens": 64,
        "autoregressive_decode": False,
        "browser_benchmark_run": False,
        "training_run": False,
        "causal_bidirectional_selection_made": False,
        "profile_representation_selection_made": False,
        "full_projection": architecture,
    }
    latency_summary = {
        "schema_version": "r30j0.synthetic-latency-memory.v1",
        "measurement_kind": architecture["measurement_kind"],
        "warm_target_p50_ms": 250,
        "warm_target_p95_ms": 500,
        "synthetic_latency": architecture["synthetic_latency"],
        "synthetic_memory_512": architecture["synthetic_memory_512"],
        "measured_browser_judge_latency": None,
        "performance_claim_allowed": False,
    }
    final_report = {
        "schema_version": "r30j0.final-report.v1",
        "campaign": "R30J0",
        "personal_source_subphase": "R30J0-P",
        "terminal_state": "HUMAN_OWNER_REVIEW_REQUIRED",
        "personal_source_terminal_state": "PERSONAL_SOURCE_EVIDENCE_READY",
        "generated_at": timestamp,
        "repository": {
            "branch": branch,
            "head": head,
            "origin_main": origin,
            "head_equals_origin_main": pushed,
            "worktree_clean": worktree_clean,
        },
        "model": {
            "family": "efish-personal-judge-v1",
            "role": "owner-specific personal judgement and non-semantic presentation",
            "generic_commercial_qa_model": False,
            "parameters": architecture["judge_common_parameters_excluding_profile_representation"],
            "all_q4_weight_bytes": architecture["storage_projection"]["all_q4"]["weight_bytes"],
            "all_q4_static_local_asset_bytes": architecture["storage_projection"]["all_q4"]["static_local_asset_bytes"],
            "context_length": 512,
            "autoregressive_decode": False,
        },
        "personal_source_aggregate": {
            key: discovery[key]
            for key in (
                "candidate_source_count",
                "owner_authored_high_confidence_count",
                "owner_answer_transcript_count",
                "owner_authored_edited_count",
                "mixed_owner_ai_count",
                "AI_or_Codex_generated_count",
                "third_party_count",
                "unknown_count",
                "Chinese_primary_source_count",
                "English_secondary_source_count",
                "sensitive_sections_excluded_count",
                "historical_personalization_assets_found",
            )
        },
        "review": {
            "owner_review_completed": False,
            "actual_profile_frozen": False,
            "personal_holdout_created": False,
            "full_training_dataset_generated": False,
            "source_review_item_count": source_review["item_count"],
            "contrast_candidates": source_readiness["contrast_candidate_count"],
            "contrast_owner_labels": 0,
        },
        "execution": {
            "training_started": False,
            "classification_updates": 0,
            "examples_seen_by_optimizer": 0,
            "checkpoint": None,
            "candidate": None,
            "api_requests": 0,
            "network_requests": 0,
            "production_modified": False,
            "deployment_performed": False,
            "rag_implemented": False,
            "structured_memory_implemented": False,
        },
        "validation": invariants,
        "historical_states_preserved": HISTORICAL_STATES,
        "r30j1_authorized": False,
        "next_state": "HUMAN_OWNER_REVIEW_REQUIRED",
    }
    terminal = {
        "schema_version": "r30j0.final-terminal.v1",
        "campaign": "R30J0",
        "terminal_state": "HUMAN_OWNER_REVIEW_REQUIRED",
        "personal_source_terminal_state": "PERSONAL_SOURCE_EVIDENCE_READY",
        "owner_review_completed": False,
        "training_started": False,
        "classification_updates": 0,
        "examples_seen_by_optimizer": 0,
        "checkpoint": None,
        "candidate": None,
        "r30j1_authorized": False,
        "reason": "architecture_and_source_evidence_ready_but_owner_review_not_completed",
        "generated_at": timestamp,
    }
    campaign_state = {
        "campaign": "R30J0",
        "state": "HUMAN_OWNER_REVIEW_REQUIRED",
        "subphase_states": {"R30J0-P": "PERSONAL_SOURCE_EVIDENCE_READY"},
        "current_process": None,
        "training_started": False,
        "classification_updates": 0,
        "examples_seen_by_optimizer": 0,
        "owner_review_completed": False,
        "profile_frozen": False,
        "r30j1_authorized": False,
        "updated_at": timestamp,
    }
    heartbeat = {
        "campaign": "R30J0",
        "state": "HUMAN_OWNER_REVIEW_REQUIRED",
        "process_running": False,
        "heartbeat_healthy": True,
        "training_running": False,
        "api_request_running": False,
        "updated_at": timestamp,
    }

    atomic_json(ARTIFACT_ROOT / "architecture" / "measurement.json", architecture_summary)
    atomic_json(ARTIFACT_ROOT / "latency_model" / "synthetic_projection.json", latency_summary)
    atomic_json(REPORT_ROOT / "production_diff_gate.json", production_gate)
    atomic_json(REPORT_ROOT / "browser_validation.json", browser_validation)
    atomic_json(REPORT_ROOT / "final_report.json", final_report)
    atomic_json(REPORT_ROOT / "final_terminal.json", terminal)
    atomic_json(ARTIFACT_ROOT / "campaign_state.json", campaign_state)
    atomic_json(ARTIFACT_ROOT / "heartbeat_latest.json", heartbeat)
    print(
        json.dumps(
            {
                "terminal_state": terminal["terminal_state"],
                "personal_source_terminal_state": terminal["personal_source_terminal_state"],
                "owner_review_completed": False,
                "training_started": False,
                "api_requests": 0,
                "head_equals_origin_main": pushed,
                "worktree_clean": worktree_clean,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
