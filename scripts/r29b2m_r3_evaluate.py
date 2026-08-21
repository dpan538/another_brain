#!/usr/bin/env python3
"""Generate and validate frozen R3 behavioural evaluations."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_model import load_r28m1_seed  # noqa: E402
from src.training.mlx.r29b2m_r3_campaign import CAMPAIGN_ID, atomic_json, utc_now  # noqa: E402
from src.training.mlx.r29b2m_r3_checkpoint import load_checkpoint  # noqa: E402
from src.training.mlx.r29b2m_r3_evaluator import (  # noqa: E402
    evaluate_teacher_forced_loss,
    generate_eval_v2,
    generate_structural_v1,
    load_eval_v2,
    semantic_review_sample,
    validate_semantic_scores,
)
from src.training.mlx.r29b2m_r3_loader import load_admitted_dataset, sha256_file  # noqa: E402
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer  # noqa: E402


def _failure_bank(generation: dict) -> list[dict]:
    failures: list[dict] = []
    for row in generation["sessions"]:
        checks = row["deterministic_family_validator_result"]
        active = {key: value for key, value in checks.items() if key in {"mojibake", "role_prefix_leakage", "repeated_output", "repeated_ngram", "empty_output", "old_correction_value_persisted", "removed_constraint_persisted"} and value}
        critical = {key: value for key, value in row["critical_failure_fields"].items() if value}
        if active or critical:
            failures.append({"session_id": row["session_id"], "family_id": row["family_id"], "failures": active, "critical_failures": critical, "raw_decoded_output": row["raw_decoded_output"]})
    return failures


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    from src.training.mlx.r29b2m_r3_campaign import atomic_jsonl

    atomic_jsonl(path, rows)


def generation_mode(args: argparse.Namespace) -> int:
    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer.resolve())
    dataset = load_admitted_dataset(args.dataset_root.resolve())
    eval_manifest, eval_sessions = load_eval_v2(args.eval_dir.resolve())
    if args.seed:
        model = load_r28m1_seed(args.seed.resolve())
        label = args.label or "pretrain_parent_seed"
        checkpoint_id = None
        parent_seed_sha = sha256_file(args.seed.resolve())
    else:
        loaded = load_checkpoint(args.checkpoint.resolve(), restore_rng=False)
        model = loaded.model
        label = args.label or str(loaded.lineage["checkpoint_id"])
        checkpoint_id = loaded.lineage["checkpoint_id"]
        parent_seed_sha = loaded.lineage["parent_seed_sha256"]
    model.eval()
    eval_report = generate_eval_v2(model, tokenizer, eval_sessions, label=label)
    structural_report = generate_structural_v1(model, tokenizer, label=label)
    validation_loss = evaluate_teacher_forced_loss(model, dataset.encode_rows(tokenizer, dataset.dev))
    eval_report.update({
        "eval_v2_manifest_sha256": sha256_file(args.eval_dir.resolve() / "manifest.json"),
        "eval_v2_sessions_sha256": eval_manifest["sessions_sha256"],
        "dataset_manifest_sha256": dataset.manifest_sha256,
        "parent_seed_sha256": parent_seed_sha,
        "checkpoint_id": checkpoint_id,
        "validation_loss": validation_loss,
        "human_review_completed": False,
        "product_training_admission": False,
    })
    structural_report.update({"checkpoint_id": checkpoint_id, "parent_seed_sha256": parent_seed_sha})
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if args.baseline:
        generation_path = output_dir / "pretrain_eval_v2_generations.json"
        structural_path = output_dir / "pretrain_structural_v1.json"
        failure_path = output_dir / "pretrain_failure_bank.jsonl"
        sample_path = output_dir / "pretrain_semantic_review_sample.json"
    else:
        generation_path = output_dir / "eval_v2_generations.json"
        structural_path = output_dir / "structural_v1.json"
        failure_path = output_dir / "failure_bank.jsonl"
        sample_path = output_dir / "semantic_review_sample.json"
    atomic_json(generation_path, eval_report)
    atomic_json(structural_path, structural_report)
    _write_jsonl(failure_path, _failure_bank(eval_report))
    sample_ids = semantic_review_sample(eval_report["sessions"], baseline=bool(args.baseline))
    atomic_json(sample_path, {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "reviewer_class_required": "codex_agent_generated_output_review_not_human",
        "human_review_completed": False,
        "baseline_oversampling": bool(args.baseline),
        "session_count": len(sample_ids),
        "session_ids": sample_ids,
    })
    print(json.dumps({"valid": True, "label": label, "eval_sessions": len(eval_report["sessions"]), "structural_sessions": len(structural_report["sessions"]), "semantic_review_requested": len(sample_ids), "validation_loss": validation_loss["normalised_loss"]}, sort_keys=True), flush=True)
    return 0


def validate_scores_mode(args: argparse.Namespace) -> int:
    generation = json.loads(args.generation.read_text(encoding="utf-8"))
    score_report = json.loads(args.scores_input.read_text(encoding="utf-8"))
    aggregate = validate_semantic_scores(score_report, generation, require_all_sessions=args.require_all_sessions)
    frozen = score_report | {
        "campaign_id": CAMPAIGN_ID,
        "validated_at": utc_now(),
        "generation_sha256": sha256_file(args.generation),
        "aggregate": aggregate,
        "scoring_dimensions": {
            "speech_act_selection": 2,
            "answer_relevance": 2,
            "referent_context_binding": 3,
            "constraint_correction_handling": 3,
            "natural_voice": 2,
            "uncertainty_boundary": 2,
            "brevity_completeness": 2,
            "total": 16,
        },
        "human_review_completed": False,
        "product_training_admission": False,
    }
    atomic_json(args.scores_output, frozen)
    print(json.dumps({"valid": True, "reviewed_session_count": aggregate["reviewed_session_count"], "overall_session_pass_rate": aggregate["overall_session_pass_rate"], "critical_failure_count": aggregate["critical_failure_count"]}, sort_keys=True), flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--generate", action="store_true")
    mode.add_argument("--validate-scores", action="store_true")
    parser.add_argument("--baseline", action="store_true")
    parser.add_argument("--seed", type=Path)
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--tokenizer", type=Path)
    parser.add_argument("--dataset-root", type=Path)
    parser.add_argument("--eval-dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--label")
    parser.add_argument("--generation", type=Path)
    parser.add_argument("--scores-input", type=Path)
    parser.add_argument("--scores-output", type=Path)
    parser.add_argument("--require-all-sessions", action="store_true")
    args = parser.parse_args()
    if args.generate:
        if bool(args.seed) == bool(args.checkpoint):
            parser.error("--generate requires exactly one of --seed or --checkpoint")
        for name in ("tokenizer", "dataset_root", "eval_dir", "output_dir"):
            if getattr(args, name) is None:
                parser.error(f"--generate requires --{name.replace('_', '-')}")
        return generation_mode(args)
    for name in ("generation", "scores_input", "scores_output"):
        if getattr(args, name) is None:
            parser.error(f"--validate-scores requires --{name.replace('_', '-')}")
    return validate_scores_mode(args)


if __name__ == "__main__":
    raise SystemExit(main())
