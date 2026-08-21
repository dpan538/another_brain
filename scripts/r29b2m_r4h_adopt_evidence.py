#!/usr/bin/env python3
"""Adopt prior campaign evidence without loading a training dataset or model state."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CAMPAIGN_ID = "r29b2m_r4h_hybrid_signal_simulation_v1"
EXPECTED_SOURCE_REVISION = "55df7f6d811e585789afb00979d7b246272d32eb"


def default_artifacts_parent() -> Path:
    return Path.home() / "Desktop" / "another_brain_train_r29a0" / "artifacts"


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"expected_object:{path.name}")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def git(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=repo, text=True).strip()


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--artifacts-parent", type=Path, default=default_artifacts_parent())
    parser.add_argument("--artifact-root", type=Path)
    args = parser.parse_args()
    repo = args.repo.resolve()
    parent = args.artifacts_parent.expanduser().resolve()
    output = (args.artifact_root or parent / "r29b2m_r4h").expanduser().resolve()
    roots = {name: parent / name for name in ("r29b2m", "r29b2m_r2", "r29b2m_r3")}

    base_state = read_json(roots["r29b2m"] / "campaign_state.json")
    seed = read_json(roots["r29b2m"] / "seed" / "seed_manifest.json")
    r2_state = read_json(roots["r29b2m_r2"] / "campaign_state.json")
    r2_adopted = read_json(roots["r29b2m_r2"] / "reports" / "adopted_evidence.json")
    r2_manifest = read_json(roots["r29b2m_r2"] / "dataset" / "dataset_manifest.json")
    r3_state = read_json(roots["r29b2m_r3"] / "campaign_state.json")
    r3_final = read_json(roots["r29b2m_r3"] / "reports" / "final_engineering_report.json")
    r3_decision = read_json(roots["r29b2m_r3"] / "reports" / "stage_a_decision.json")
    r3_resume = read_json(roots["r29b2m_r3"] / "reports" / "exact_resume_proof.json")
    r3_resource = read_json(roots["r29b2m_r3"] / "reports" / "resource_report.json")
    r3_memory = read_json(roots["r29b2m_r3"] / "reports" / "memory_report.json")
    r3_heartbeat = read_json(roots["r29b2m_r3"] / "heartbeat_latest.json")
    checkpoint_checksums = roots["r29b2m_r3"] / "checkpoints" / "stage_a_080k" / "checksums.json"

    head = git(repo, "rev-parse", "HEAD")
    main_sha = git(repo, "rev-parse", "main")
    origin_sha = git(repo, "rev-parse", "origin/main")
    status = git(repo, "status", "--porcelain=v1")
    required = {
        "base_MLX_environment": roots["r29b2m"] / "reports" / "mlx_environment.json",
        "base_q4_seed_manifest": roots["r29b2m"] / "seed" / "seed_manifest.json",
        "base_architecture_fingerprint": roots["r29b2m"] / "reports" / "mlx_architecture_audit.json",
        "base_full_context_report": roots["r29b2m"] / "reports" / "mlx_full_context.json",
        "base_KV_cache_report": roots["r29b2m"] / "reports" / "mlx_kv_parity.json",
        "R2_dataset_admission": roots["r29b2m_r2"] / "reports" / "final_engineering_report.json",
        "R3_campaign_state": roots["r29b2m_r3"] / "campaign_state.json",
        "R3_final_engineering_report": roots["r29b2m_r3"] / "reports" / "final_engineering_report.json",
        "R3_stage_A_decision": roots["r29b2m_r3"] / "reports" / "stage_a_decision.json",
        "R3_exact_resume_proof": roots["r29b2m_r3"] / "reports" / "exact_resume_proof.json",
        "R3_resource_report": roots["r29b2m_r3"] / "reports" / "resource_report.json",
        "R3_stage_A_080k_checkpoint_manifest": checkpoint_checksums,
    }
    missing = [name for name, path in required.items() if not path.is_file()]
    if missing:
        raise RuntimeError(f"missing_evidence:{','.join(missing)}")

    checks = {
        "source_revision_is_required_parent": EXPECTED_SOURCE_REVISION in {head, main_sha, origin_sha} or git(repo, "merge-base", "--is-ancestor", EXPECTED_SOURCE_REVISION, head) == "",
        "working_on_main": git(repo, "branch", "--show-current") == "main",
        "head_main_origin_equal": head == main_sha == origin_sha,
        "worktree_clean": status == "",
        "seed_kind_verified": seed.get("source_kind") == "r28m1_q4_recovered_seed",
        "seed_sha_matches_R3": seed.get("seed_safetensors_sha256") == r3_final.get("parent_seed_sha256") == r3_resource.get("parent_seed_sha256"),
        "R2_dataset_admitted": r2_state.get("state") == "PASSED_DATASET_ADMISSION_READY_FOR_SFT" and r2_manifest.get("admitted_for_engineering_sft") is True,
        "R2_human_review_remains_false": r2_state.get("human_review_completed") is False and r2_manifest.get("human_review_completed") is False,
        "R2_eval_v2_hashes_present": bool(r2_adopted.get("eval_v2_manifest_sha256")) and bool(r2_adopted.get("eval_v2_sessions_sha256")),
        "R3_terminal_state_preserved": r3_state.get("state") == r3_final.get("terminal_state") == "BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE",
        "R3_active_checkpoint_diagnostic_only": r3_state.get("active_checkpoint") == "stage_a_080k",
        "R3_candidate_is_null": r3_state.get("candidate_checkpoint") is None and r3_final.get("candidate_checkpoint") is None and r3_decision.get("candidate_checkpoint") is None,
        "R3_generated_behaviour_pass_rate_zero": r3_final.get("current_behaviour_metrics", {}).get("overall_session_pass_rate") == 0,
        "R3_all_140_semantic_samples_unusable": r3_final.get("current_behaviour_metrics", {}).get("reviewed_session_count") == 140 and r3_final.get("current_behaviour_metrics", {}).get("session_median") == 0,
        "R3_exact_resume_passed": r3_resume.get("valid") is True and r3_resume.get("actual_96m_fixture", {}).get("pass") is True,
        "R3_no_active_child": r3_heartbeat.get("process_active") is False and r3_heartbeat.get("child_pid") is None,
        "R3_no_q4_product_or_release_admission": all(r3_final.get(key) is False for key in ("q4_exported", "public_model_replaced", "deployment_performed", "browser_admission", "product_training_admission", "release_admission")),
    }
    valid = all(checks.values())
    report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "valid": valid,
        "repository": {"HEAD": head, "main": main_sha, "origin_main": origin_sha, "worktree_clean": status == ""},
        "R29B2M": {"terminal_state": base_state.get("state"), "seed_kind": seed.get("source_kind"), "seed_sha256": seed.get("seed_safetensors_sha256")},
        "R29B2M_R2": {"terminal_state": r2_state.get("state"), "dataset_admission": "engineering_SFT_only", "eval_v2_manifest_sha256": r2_adopted.get("eval_v2_manifest_sha256"), "eval_v2_sessions_sha256": r2_adopted.get("eval_v2_sessions_sha256"), "human_review_completed": False},
        "R29B2M_R3": {
            "terminal_state": r3_final.get("terminal_state"), "parent_checkpoint": r3_final.get("parent_checkpoint"), "active_checkpoint": "stage_a_080k",
            "candidate_checkpoint": None, "stage_B_ran": False, "diagnostic_checkpoint_only": True, "global_optimizer_step": r3_final.get("global_optimizer_step"),
            "optimizer_tokens": r3_final.get("optimizer_tokens"), "assistant_target_tokens": r3_final.get("assistant_target_tokens"), "train_loss": r3_final.get("current_train_loss"),
            "validation_loss": r3_final.get("validation_loss"), "generated_behaviour_pass_rate": r3_final.get("current_behaviour_metrics", {}).get("overall_session_pass_rate"),
            "reviewed_unusable_session_count": r3_final.get("current_behaviour_metrics", {}).get("reviewed_session_count"), "exact_resume": r3_final.get("checkpoint_resume_status", {}).get("exact_resume"),
            "peak_MLX_memory_bytes": r3_memory.get("peak_mlx_memory_bytes"), "q4_exported": False, "public_model_replaced": False, "browser_admission": False, "product_admission": False, "release_admission": False,
        },
        "evidence_sha256": {name: sha256(path) for name, path in required.items()},
        "checks": checks,
        "training_dataset_loaded_as_product_signal": False,
        "simulation_only": True,
        "actual_efish_signal_model_trained": False,
        "actual_browser_signal_inference": False,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }
    atomic_json(output / "reports" / "adopted_evidence.json", report)
    print(json.dumps({"state": "EVIDENCE_ADOPTION_PASSED" if valid else "EVIDENCE_ADOPTION_FAILED", "valid": valid}))
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
