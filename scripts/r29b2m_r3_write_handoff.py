#!/usr/bin/env python3
"""Write the ignored MLX engineering-candidate handoff and review pack."""

from __future__ import annotations

from collections import defaultdict
import argparse
import json
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_r3_campaign import CAMPAIGN_ID, atomic_json, atomic_jsonl, utc_now  # noqa: E402
from src.training.mlx.r29b2m_r3_loader import sha256_file  # noqa: E402


def _read(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected_json_object:{path}")
    return value


def _copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--final-evaluation-dir", type=Path, required=True)
    parser.add_argument("--candidate-decision", type=Path, required=True)
    args = parser.parse_args()
    artifact_root = args.artifact_root.resolve()
    checkpoint = args.checkpoint.resolve()
    evaluation = args.final_evaluation_dir.resolve()
    decision = _read(args.candidate_decision.resolve())
    if decision.get("decision") != "PASSED_MLX_DIALOGUE_CANDIDATE" or decision.get("gate", {}).get("pass") is not True:
        raise ValueError("engineering_handoff_requires_passed_candidate_gate")
    candidate = artifact_root / "candidate"
    candidate.mkdir(parents=True, exist_ok=True)
    for name in ("model.safetensors", "optimizer.safetensors", "training_config.json", "lineage.json"):
        _copy(checkpoint / name, candidate / name)
    _copy(evaluation / "eval_v2_generations.json", candidate / "final_eval_generations.json")
    _copy(evaluation / "eval_v2_scores.json", candidate / "final_eval_scores.json")
    _copy(checkpoint / "metrics.json", candidate / "checkpoint_metrics.json")
    _copy(artifact_root / "reports" / "exact_resume_proof.json", candidate / "resume_proof.json")
    _copy(artifact_root / "reports" / "resource_report.json", candidate / "resource_report.json")
    _copy(artifact_root / "reports" / "memory_report.json", candidate / "memory_report.json")
    _copy(args.candidate_decision.resolve(), candidate / "candidate_decision.json")
    dataset_admission = _read(artifact_root / "reports" / "dataset_admission.json")
    adopted = _read(artifact_root / "reports" / "adopted_evidence.json")
    atomic_json(candidate / "dataset_manifest_reference.json", {
        "dataset_id": dataset_admission["dataset_id"],
        "dataset_manifest_sha256": dataset_admission["dataset_manifest_sha256"],
        "admitted_for_engineering_sft": True,
        "human_review_completed": False,
        "product_training_admission": False,
    })
    atomic_json(candidate / "eval_manifest_reference.json", {
        "eval_v2_manifest_sha256": adopted["repository_hashes"]["eval_v2_manifest"],
        "eval_v2_sessions_sha256": adopted["repository_hashes"]["eval_v2_sessions"],
        "frozen": True,
    })
    _copy(artifact_root / "reports" / "pretrain_eval_v2_scores.json", candidate / "pretrain_baseline.json")
    checksums = {
        path.name: sha256_file(path)
        for path in sorted(candidate.iterdir())
        if path.is_file() and path.name != "checksums.json"
    }
    atomic_json(candidate / "checksums.json", {"campaign_id": CAMPAIGN_ID, "files": checksums})

    baseline_generations = _read(artifact_root / "reports" / "pretrain_eval_v2_generations.json")
    baseline_scores = _read(artifact_root / "reports" / "pretrain_eval_v2_scores.json")
    candidate_generations = _read(evaluation / "eval_v2_generations.json")
    candidate_scores = _read(evaluation / "eval_v2_scores.json")
    baseline_by_id = {row["session_id"]: row for row in baseline_generations["sessions"]}
    baseline_score_by_id = {row["session_id"]: row for row in baseline_scores["sessions"]}
    candidate_score_by_id = {row["session_id"]: row for row in candidate_scores["sessions"]}
    by_family: dict[str, list[dict]] = defaultdict(list)
    for row in candidate_generations["sessions"]:
        by_family[row["family_id"]].append(row)
    selected: list[dict] = []
    for family in sorted(by_family):
        selected.extend(by_family[family][:4])
    for family in sorted(by_family)[:8]:
        selected.append(by_family[family][4])
    if len(selected) != 120 or len(by_family) != 28:
        raise ValueError("product_review_pack_stratification_mismatch")
    review_rows = []
    for row in selected:
        session_id = row["session_id"]
        review_rows.append({
            "session_id": session_id,
            "family_id": row["family_id"],
            "prompt_history": row["messages"],
            "state_capsule": row["state_capsule"],
            "baseline": {
                "raw_generated_token_ids": baseline_by_id[session_id]["raw_generated_token_ids"],
                "raw_output": baseline_by_id[session_id]["raw_decoded_output"],
                "automatic_checks": baseline_by_id[session_id]["deterministic_family_validator_result"],
                "codex_scores": baseline_score_by_id.get(session_id),
            },
            "candidate": {
                "raw_generated_token_ids": row["raw_generated_token_ids"],
                "raw_output": row["raw_decoded_output"],
                "automatic_checks": row["deterministic_family_validator_result"],
                "codex_scores": candidate_score_by_id[session_id],
            },
            "human_reviewer": {"reviewer": "", "decision": "", "notes": ""},
        })
    review_root = artifact_root / "product_review_pack"
    atomic_jsonl(review_root / "sessions.jsonl", review_rows)
    atomic_json(review_root / "manifest.json", {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "session_count": 120,
        "family_count": 28,
        "family_stratified": True,
        "baseline_candidate_side_by_side": True,
        "human_review_completed": False,
        "product_training_admission": False,
        "product_admission": False,
        "candidate_model_sha256": sha256_file(candidate / "model.safetensors"),
        "sessions_sha256": sha256_file(review_root / "sessions.jsonl"),
    })
    print(json.dumps({"valid": True, "candidate_model_sha256": sha256_file(candidate / "model.safetensors"), "candidate_file_count": len(checksums), "product_review_sessions": len(review_rows), "human_review_completed": False}, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
