#!/usr/bin/env python3
"""Read-only adoption and R2 admission gate for R29B2M-R3."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_r3_campaign import CAMPAIGN_ID, atomic_json, utc_now  # noqa: E402
from src.training.mlx.r29b2m_r3_loader import load_admitted_dataset, sha256_file  # noqa: E402


R29B2M_REQUIRED = (
    "reports/orientation.json",
    "reports/mlx_environment.json",
    "reports/q4_source_audit.json",
    "seed/seed_manifest.json",
    "seed/model_seed.safetensors",
    "reports/mlx_architecture_audit.json",
    "reports/mlx_full_context.json",
    "reports/mlx_kv_parity.json",
    "reports/seed_baseline.json",
)
R2_REQUIRED = (
    "campaign_state.json",
    "reports/final_engineering_report.json",
    "dataset/dataset_manifest.json",
    "dataset/train.jsonl",
    "dataset/dev.jsonl",
    "dataset/canonical_scenarios.jsonl",
    "dataset/full_semantic_audit.json",
    "dataset/sampling_contract.json",
    "dataset/checksums.json",
    "human_review_pack/manifest.json",
)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def _json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected_json_object:{path}")
    return value


def _file_record(path: Path, base: Path) -> dict[str, Any]:
    return {"path": str(path.relative_to(base)), "bytes": path.stat().st_size, "sha256": sha256_file(path)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--prior-runtime-root", type=Path, required=True)
    parser.add_argument("--r2-root", type=Path, required=True)
    parser.add_argument("--r1-dataset-root", type=Path, required=True)
    args = parser.parse_args()
    artifact_root = args.artifact_root.resolve()
    prior = args.prior_runtime_root.resolve()
    r2 = args.r2_root.resolve()
    dataset_dir = r2 / "dataset"
    missing = [str(path) for path in [*(prior / rel for rel in R29B2M_REQUIRED), *(r2 / rel for rel in R2_REQUIRED)] if not path.is_file()]
    if missing:
        raise ValueError("required_prior_evidence_missing:" + ",".join(missing))

    current_main = git("rev-parse", "HEAD")
    origin_main = git("rev-parse", "origin/main")
    if git("branch", "--show-current") != "main" or current_main != origin_main:
        raise ValueError("r29b2m_r3_must_run_on_synced_main")

    seed_manifest = _json(prior / "seed" / "seed_manifest.json")
    seed_path = prior / "seed" / "model_seed.safetensors"
    if sha256_file(seed_path) != seed_manifest.get("seed_safetensors_sha256"):
        raise ValueError("parent_seed_hash_mismatch")
    architecture = _json(prior / "reports" / "mlx_architecture_audit.json")
    full_context = _json(prior / "reports" / "mlx_full_context.json")
    kv = _json(prior / "reports" / "mlx_kv_parity.json")
    environment = _json(prior / "reports" / "mlx_environment.json")
    prior_runtime_valid = (
        architecture.get("valid") is True
        and environment.get("valid") is True
        and kv.get("valid") is True
        and full_context.get("all_layers_executed") is True
        and kv.get("greedy_sequences_match") is True
        and float(kv.get("no_future_leak_max_abs_error", 1.0)) == 0.0
        and float(kv.get("session_isolation_max_abs_error", 1.0)) == 0.0
    )
    if not prior_runtime_valid:
        raise ValueError("prior_mlx_evidence_invalid")
    r2_state = _json(r2 / "campaign_state.json")
    if r2_state.get("state") != "PASSED_DATASET_ADMISSION_READY_FOR_SFT":
        raise ValueError("r2_terminal_state_mismatch")
    dataset = load_admitted_dataset(dataset_dir)
    if dataset.manifest.get("human_review_completed") is not False:
        raise ValueError("r2_human_review_status_misrepresented")

    r1_rejection = {"pass": False, "error": None}
    try:
        load_admitted_dataset(args.r1_dataset_root.resolve())
    except (ValueError, KeyError) as error:
        r1_rejection = {"pass": True, "error": f"{type(error).__name__}:{error}"}
    if not r1_rejection["pass"]:
        raise ValueError("rejected_r1_dataset_was_accepted")

    repository_files = {
        "tokenizer": ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json",
        "eval_v2_manifest": ROOT / "evals" / "r29b2m_daily_dialogue_v2" / "manifest.json",
        "eval_v2_sessions": ROOT / "evals" / "r29b2m_daily_dialogue_v2" / "sessions.jsonl",
        "scenario_schema": ROOT / "schemas" / "r29b2m_r2_scenario_spec.schema.json",
        "validator_source": ROOT / "src" / "training" / "mlx" / "r29b2m_r2_validators.py",
        "admission_gate_source": ROOT / "src" / "training" / "mlx" / "r29b2m_r2_admission.py",
    }
    repo_hashes = {name: sha256_file(path) for name, path in repository_files.items()}
    expected = {
        "tokenizer": dataset.manifest["tokenizer_sha256"],
        "eval_v2_manifest": dataset.manifest["eval_v2_manifest_sha256"],
        "scenario_schema": dataset.manifest["scenario_schema_sha256"],
        "validator_source": dataset.manifest["validator_sha256"],
    }
    for name, value in expected.items():
        if repo_hashes[name] != value:
            raise ValueError(f"adopted_repository_hash_mismatch:{name}")

    prior_records = [_file_record(prior / rel, prior) for rel in R29B2M_REQUIRED]
    r2_records = [_file_record(r2 / rel, r2) for rel in R2_REQUIRED]
    adopted = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": True,
        "adoption_mode": "read_only_hash_validation_no_expensive_mlx_or_dataset_rebuild",
        "repository": {"branch": "main", "head": current_main, "origin_main": origin_main},
        "prior_runtime_evidence": prior_records,
        "r2_evidence": r2_records,
        "repository_hashes": repo_hashes,
        "parent_seed": {
            "kind": seed_manifest["source_kind"],
            "sha256": seed_manifest["seed_safetensors_sha256"],
            "source_fp32_checkpoint_loaded": False,
            "source_checkpoint_parity_claim": False,
        },
        "architecture_fingerprint": architecture["architecture_fingerprint"],
        "r2_terminal_state": r2_state["state"],
        "human_review_completed": False,
        "product_training_admission": False,
        "r1_rejection_gate": r1_rejection,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }
    admission = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": True,
        "gate_called": "src.training.mlx.r29b2m_r2_admission.validate_dataset_admission",
        "dataset_id": dataset.manifest["dataset_id"],
        "dataset_manifest_sha256": dataset.manifest_sha256,
        "session_count": dataset.manifest["session_count"],
        "canonical_scenario_count": dataset.manifest["canonical_scenario_count"],
        "distinct_normalized_target_count": dataset.manifest["distinct_normalized_target_count"],
        "assistant_target_token_count": dataset.manifest["assistant_target_token_count"],
        "train_count": len(dataset.train),
        "dev_count": len(dataset.dev),
        "critical_issue_count": dataset.manifest["critical_issue_count"],
        "systematic_issue_count": dataset.manifest["semantic_audit"]["systematic_issue_count"],
        "eval_v2_contamination_count": dataset.manifest["eval_v2_near_duplicate_count"],
        "admitted_for_engineering_sft": True,
        "human_review_completed": False,
        "product_training_admission": False,
        "r1_rejection_gate": r1_rejection,
        "optimizer_update_executed": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }
    atomic_json(artifact_root / "reports" / "adopted_evidence.json", adopted)
    atomic_json(artifact_root / "reports" / "dataset_admission.json", admission)
    print(json.dumps({"valid": True, "dataset_manifest_sha256": dataset.manifest_sha256, "parent_seed_sha256": seed_manifest["seed_safetensors_sha256"], "session_count": admission["session_count"]}, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
