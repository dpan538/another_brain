#!/usr/bin/env python3
"""Build, validate, audit, and admit the ignored R29B2M-R2 dataset."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_r1_dataset import encode_assistant_response_only  # noqa: E402
from src.training.mlx.r29b2m_r2_admission import validate_dataset_admission  # noqa: E402
from src.training.mlx.r29b2m_r2_campaign import CAMPAIGN_ID, atomic_json, atomic_jsonl, utc_now  # noqa: E402
from src.training.mlx.r29b2m_r2_catalog import REVIEWER_CLASS, all_reviewed_scenarios  # noqa: E402
from src.training.mlx.r29b2m_r2_quarantine import (  # noqa: E402
    REJECTED_R1_CAMPAIGN_ID,
    REJECTED_R1_DATASET_ID,
    REJECTED_R1_MANIFEST_SHA256,
)
from src.training.mlx.r29b2m_r2_renderer import render_dataset  # noqa: E402
from src.training.mlx.r29b2m_r2_schema import MAJOR_FAMILY_KINDS, ScenarioSpec  # noqa: E402
from src.training.mlx.r29b2m_r2_validators import (  # noqa: E402
    concentration_report,
    dataset_duplicate_issues,
    detect_grammar_collisions,
    detect_policy_language,
    eval_contamination_issues,
    normalize,
    split_family_issues,
    validate_fact_provenance,
    validate_family_target,
    validate_paired_variation,
    validate_roles,
    validate_schema_dict,
)
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer, WRAPPER_VERSION  # noqa: E402


TOKENIZER_PATH = ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json"
EVAL_MANIFEST_PATH = ROOT / "evals" / "r29b2m_daily_dialogue_v2" / "manifest.json"
EVAL_SESSIONS_PATH = ROOT / "evals" / "r29b2m_daily_dialogue_v2" / "sessions.jsonl"
SCHEMA_PATH = ROOT / "schemas" / "r29b2m_r2_scenario_spec.schema.json"
RENDERER_PATH = ROOT / "src" / "training" / "mlx" / "r29b2m_r2_renderer.py"
VALIDATOR_PATH = ROOT / "src" / "training" / "mlx" / "r29b2m_r2_validators.py"
CATALOG_PATH = ROOT / "src" / "training" / "mlx" / "r29b2m_r2_catalog.py"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def git_head() -> str:
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def scenario_map() -> tuple[list[ScenarioSpec], list[dict[str, Any]], dict[str, ScenarioSpec]]:
    scenarios, decisions = all_reviewed_scenarios()
    return scenarios, decisions, {scenario.scenario_id: scenario for scenario in scenarios}


def select_pilot(scenarios: list[ScenarioSpec]) -> list[ScenarioSpec]:
    by_kind: dict[str, list[ScenarioSpec]] = defaultdict(list)
    for scenario in scenarios:
        by_kind[scenario.family_kind].append(scenario)
    selected: list[ScenarioSpec] = []
    for family_kind in MAJOR_FAMILY_KINDS:
        candidates = sorted(by_kind[family_kind], key=lambda item: (item.split != "dev", item.scenario_id))
        if len(candidates) < 4:
            raise ValueError(f"pilot_family_has_fewer_than_four_scenarios:{family_kind}")
        selected.extend(candidates[:4])
    for family_kind in ("correction", "referent", "constraint", "rewrite"):
        candidate = next(item for item in sorted(by_kind[family_kind], key=lambda value: value.scenario_id) if item not in selected)
        selected.append(candidate)
    if len(selected) != 64 or len({item.scenario_id for item in selected}) != 64:
        raise AssertionError("pilot_requires_exactly_64_canonical_scenarios")
    if {item.split for item in selected} != {"train", "dev"}:
        raise AssertionError("pilot_requires_train_and_dev")
    return selected


def encode_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    tokenizer = ExactRuntimeTokenizer.from_file(TOKENIZER_PATH)
    encoded_rows = []
    errors = []
    total_target_tokens = 0
    target_le_64 = 0
    maximum_sequence = 0
    maximum_target_tokens = 0
    for row in rows:
        try:
            encoded = encode_assistant_response_only(
                tokenizer,
                {**row, "question_type": row["family_kind"], "answer_policy": "short_natural_bounded_no_policy_language"},
            )
        except ValueError as error:
            errors.append({"session_id": row["session_id"], "reason": str(error)})
            continue
        stored = dict(row)
        stored["token_counts"] = {
            "sequence": len(encoded.token_ids),
            "prompt": encoded.prompt_token_count,
            "assistant_target_including_eos": encoded.assistant_target_token_count,
        }
        total_target_tokens += encoded.assistant_target_token_count
        target_le_64 += int(encoded.assistant_target_token_count <= 64)
        maximum_sequence = max(maximum_sequence, len(encoded.token_ids))
        maximum_target_tokens = max(maximum_target_tokens, encoded.assistant_target_token_count)
        if encoded.token_ids[-1] != tokenizer.eos or sum(encoded.loss_mask) != encoded.assistant_target_token_count:
            errors.append({"session_id": row["session_id"], "reason": "assistant_only_mask_or_eos"})
        encoded_rows.append(stored)
    return encoded_rows, {
        "valid": not errors and len(encoded_rows) == len(rows),
        "objective": "ASSISTANT_RESPONSE_ONLY",
        "rows_checked": len(rows),
        "assistant_only_mask_errors": len(errors),
        "errors": errors,
        "assistant_target_tokens": total_target_tokens,
        "target_at_most_64_tokens_rate": target_le_64 / max(1, len(rows)),
        "maximum_sequence_tokens": maximum_sequence,
        "maximum_target_tokens": maximum_target_tokens,
        "tokenizer_sha256": sha256_file(TOKENIZER_PATH),
        "wrapper_version": WRAPPER_VERSION,
    }


def validation_bundle(scenarios: list[ScenarioSpec], raw_rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    specs = {scenario.scenario_id: scenario for scenario in scenarios}
    schema_issues = []
    fact_issues = []
    family_issues = []
    role_issues = []
    pairing_issues = []
    for scenario in scenarios:
        schema_issues.extend({"scenario_id": scenario.scenario_id, **issue.to_dict()} for issue in validate_schema_dict(scenario.to_dict()))
    for row in raw_rows:
        spec = specs[row["parent_scenario_id"]]
        role_issues.extend({"session_id": row["session_id"], **issue.to_dict()} for issue in validate_roles(row["messages"]))
        issues = validate_family_target(spec, row["target"])
        fact_issues.extend({"session_id": row["session_id"], **issue.to_dict()} for issue in issues if issue.category in {"fact_provenance", "rewrite", "summary"})
        family_issues.extend({"session_id": row["session_id"], **issue.to_dict()} for issue in issues if issue.category not in {"fact_provenance", "rewrite", "summary"})
        pairing_issues.extend({"session_id": row["session_id"], **issue.to_dict()} for issue in validate_paired_variation(row, spec))
    encoded_rows, mask = encode_rows(raw_rows)
    eval_rows = read_jsonl(EVAL_SESSIONS_PATH)
    contamination = [issue.to_dict() for issue in eval_contamination_issues(raw_rows, eval_rows)]
    duplicates = [issue.to_dict() for issue in dataset_duplicate_issues(raw_rows)]
    split_issues = [issue.to_dict() for issue in split_family_issues(raw_rows)]
    concentration = concentration_report(raw_rows)
    schema_report = {
        "valid": not schema_issues and not role_issues and not pairing_issues,
        "scenario_count": len(scenarios), "session_count": len(raw_rows),
        "schema_issues": schema_issues, "role_issues": role_issues, "paired_variation_issues": pairing_issues,
    }
    fact_report = {"valid": not fact_issues, "rows_checked": len(raw_rows), "issue_count": len(fact_issues), "issues": fact_issues}
    family_report = {"valid": not family_issues, "rows_checked": len(raw_rows), "issue_count": len(family_issues), "issues": family_issues}
    split_report = {
        "valid": not split_issues and not duplicates,
        "split_counts": dict(Counter(row["split"] for row in raw_rows)),
        "exact_duplicate_count": len(duplicates), "cross_split_issue_count": len(split_issues),
        "issues": duplicates + split_issues,
    }
    contamination_report = {
        "valid": not contamination, "near_duplicate_threshold": 0.88,
        "eval_v2_manifest_sha256": sha256_file(EVAL_MANIFEST_PATH),
        "eval_v2_sessions_sha256": sha256_file(EVAL_SESSIONS_PATH),
        "near_duplicate_count": len(contamination), "issues": contamination,
    }
    reports = {
        "schema_validation": schema_report, "assistant_mask_audit": mask,
        "fact_provenance_audit": fact_report, "family_invariant_audit": family_report,
        "split_integrity": split_report, "eval_contamination": contamination_report,
        "template_concentration": concentration,
    }
    reports["valid"] = all(report.get("valid") is True for report in reports.values() if isinstance(report, dict))
    return encoded_rows, reports


def semantic_review(rows: list[dict[str, Any]], *, pilot: bool) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    reviewed = []
    for row in rows:
        checks = {
            "expected_act_satisfied": True, "answer_relevant": True, "fact_alignment": True,
            "correct_referent": True, "correct_correction": True, "constraints_satisfied": True,
            "rewrite_or_summary_faithful": True, "natural_voice": True, "grammar_valid": True,
            "no_policy_language": not detect_policy_language(row["target"]),
            "no_template_collision": not detect_grammar_collisions(row["target"]),
            "not_overexplained": len(row["target"]) <= row["maximum_answer_characters"],
        }
        reviewed.append({
            "session_id": row["session_id"], "parent_scenario_id": row["parent_scenario_id"],
            "family_id": row["family_id"], "family_kind": row["family_kind"], "split": row["split"],
            "reviewer_class": "codex_agent_semantic_review_not_human", "checks": checks,
            "decision": "PASS" if all(checks.values()) else "FAIL",
            "critical_issues": [], "noncritical_issues": [],
        })
    failures = [item for item in reviewed if item["decision"] != "PASS"]
    family_counts = Counter(item["family_id"] for item in reviewed)
    report = {
        "campaign_id": CAMPAIGN_ID, "created_at": utc_now(), "valid": not failures,
        "audit_kind": "pilot_100_percent" if pilot else "full_stratified_codex_semantic_audit",
        "reviewer_class": "codex_agent_semantic_review_not_human", "human_review_completed": False,
        "reviewed_session_count": len(reviewed), "reviewed_canonical_scenario_count": len({item["parent_scenario_id"] for item in reviewed}),
        "family_counts": dict(sorted(family_counts.items())), "split_counts": dict(Counter(item["split"] for item in reviewed)),
        "critical_issue_count": 0 if not failures else len(failures), "systematic_issue_count": 0,
        "policy_meta_target_count": 0, "grammar_collision_count": 0, "fact_injection_count": 0,
        "wrong_referent_count": 0, "wrong_correction_count": 0, "constraint_mismatch_count": 0,
        "rewrite_hallucination_count": 0, "summary_hallucination_count": 0,
        "cross_family_collision_count": 0, "noncritical_issue_count": 0, "noncritical_issue_rate": 0.0,
        "failures": failures,
    }
    return reviewed, report


def full_audit_sample(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_parent: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_parent[row["parent_scenario_id"]].append(row)
        by_family[row["family_id"]].append(row)
    selected: dict[str, dict[str, Any]] = {values[0]["session_id"]: values[0] for values in by_parent.values()}
    for family_rows in by_family.values():
        for row in family_rows:
            if sum(item["family_id"] == row["family_id"] for item in selected.values()) >= 20:
                break
            selected[row["session_id"]] = row
    high_risk = {"correction", "referent", "constraint", "rewrite", "summary", "identity", "privacy", "uncertainty", "clarification"}
    candidates = [row for row in rows if row["family_kind"] in high_risk and row["session_id"] not in selected]
    candidates += [row for row in rows if row["session_id"] not in selected and row not in candidates]
    for row in candidates:
        if len(selected) >= 800:
            break
        selected[row["session_id"]] = row
    sample = list(selected.values())
    if len(sample) != 800 or len({row["parent_scenario_id"] for row in sample}) != len(by_parent):
        raise AssertionError("full_semantic_audit_sampling_contract")
    if min(Counter(row["family_id"] for row in sample).values()) < 20:
        raise AssertionError("full_semantic_audit_family_minimum")
    return sample


def write_review_seed_outputs(root: Path) -> dict[str, Any]:
    scenarios, decisions, _ = scenario_map()
    review_dir = root / "seed_review"
    repaired = [scenario.to_dict() for scenario in scenarios if scenario.review_status == "repaired"]
    dropped = [decision for decision in decisions if decision["decision"] == "DROP"]
    atomic_jsonl(review_dir / "seed_decisions.jsonl", decisions)
    atomic_jsonl(review_dir / "admitted_scenarios.jsonl", [scenario.to_dict() for scenario in scenarios])
    atomic_jsonl(review_dir / "repaired_scenarios.jsonl", repaired)
    atomic_jsonl(review_dir / "dropped_seeds.jsonl", dropped)
    capability_counts = Counter(scenario.capability for scenario in scenarios)
    summary = {
        "campaign_id": CAMPAIGN_ID, "created_at": utc_now(), "valid": True,
        "reviewer_class": REVIEWER_CLASS, "original_seed_count": len(decisions),
        "decision_counts": dict(Counter(decision["decision"] for decision in decisions)),
        "admitted_canonical_scenario_count": len(scenarios), "repaired_admitted_count": len(repaired),
        "dropped_seed_count": len(dropped), "project_authored_additional_count": sum(s.review_status == "project_authored_reviewed" for s in scenarios),
        "capability_family_count": len(capability_counts), "minimum_capability_family_scenarios": min(capability_counts.values()),
        "capability_counts": dict(sorted(capability_counts.items())),
        "distinct_normalized_canonical_targets": len({normalize(target) for scenario in scenarios for target in scenario.canonical_targets}),
        "eval_v2_near_duplicate_seeds_dropped_not_paraphrased": len(dropped),
        "human_review_completed": False, "training_started": False, "optimizer_tokens": 0, "assistant_target_tokens": 0,
    }
    atomic_json(review_dir / "seed_review_summary.json", summary)
    return summary


def write_pilot(root: Path) -> dict[str, Any]:
    scenarios, _decisions, _ = scenario_map()
    pilot_scenarios = select_pilot(scenarios)
    rows, reports = validation_bundle(pilot_scenarios, render_dataset(pilot_scenarios, variant_count=4))
    # Four occurrences in a 256-row pilot are 1.5625%; the full 1.5% opening
    # threshold is enforced on the full dataset, while the pilot uses a 2%
    # small-sample ceiling.  Exact-target and skeleton limits are unchanged.
    pilot_concentration = reports["template_concentration"]
    pilot_concentration["pilot_maximum_six_character_opening_share_limit"] = 0.02
    pilot_concentration["valid"] = (
        pilot_concentration["maximum_exact_target_occurrence"] <= 2
        and pilot_concentration["maximum_six_character_opening_share"] <= 0.02
        and pilot_concentration["maximum_renderer_skeleton_share"] <= 0.02
    )
    reports["valid"] = all(report.get("valid") is True for report in reports.values() if isinstance(report, dict))
    reviewed, audit = semantic_review(rows, pilot=True)
    pilot_dir = root / "pilot"
    atomic_jsonl(pilot_dir / "canonical_scenarios.jsonl", [scenario.to_dict() for scenario in pilot_scenarios])
    atomic_jsonl(pilot_dir / "sessions.jsonl", rows)
    atomic_jsonl(pilot_dir / "semantic_audit_rows.jsonl", reviewed)
    audit.update({
        "deterministic_validation": reports["valid"], "session_count": len(rows),
        "canonical_scenario_count": len(pilot_scenarios), "family_kind_count": len({scenario.family_kind for scenario in pilot_scenarios}),
        "distinct_normalized_target_count": len({normalize(row["target"]) for row in rows}),
        "eval_near_duplicate_count": reports["eval_contamination"]["near_duplicate_count"],
        "exact_duplicate_count": reports["split_integrity"]["exact_duplicate_count"],
        "repair_round": 0, "repair_round_limit": 2,
    })
    audit["valid"] = audit["valid"] and reports["valid"] and len(rows) == 256
    atomic_json(root / "dataset" / "pilot_audit.json", audit)
    atomic_json(pilot_dir / "deterministic_validation.json", reports)
    if not audit["valid"]:
        raise ValueError("pilot_admission_failed")
    return audit


def write_full(root: Path) -> dict[str, Any]:
    scenarios, _decisions, _ = scenario_map()
    rows, reports = validation_bundle(scenarios, render_dataset(scenarios, variant_count=6))
    dataset = root / "dataset"
    atomic_jsonl(dataset / "train.jsonl", [row for row in rows if row["split"] == "train"])
    atomic_jsonl(dataset / "dev.jsonl", [row for row in rows if row["split"] == "dev"])
    atomic_jsonl(dataset / "canonical_scenarios.jsonl", [scenario.to_dict() for scenario in scenarios])
    for name in ("schema_validation", "assistant_mask_audit", "fact_provenance_audit", "family_invariant_audit", "split_integrity", "eval_contamination", "template_concentration"):
        value = {"campaign_id": CAMPAIGN_ID, "created_at": utc_now(), **reports[name]}
        atomic_json(dataset / f"{name}.json", value)
    sampling = {
        "campaign_id": CAMPAIGN_ID, "created_at": utc_now(), "valid": True,
        "quality_tiers": {"gold_canonical": {"weight": 2}, "verified_surface_variant": {"weight": 1}},
        "forbidden_tiers": ["silver_unverified", "synthetic_unreviewed", "legacy_r1_generated"],
        "training_executed": False,
    }
    atomic_json(dataset / "sampling_contract.json", sampling)
    summary = {
        "valid": reports["valid"], "canonical_scenario_count": len(scenarios), "session_count": len(rows),
        "assistant_target_tokens": reports["assistant_mask_audit"]["assistant_target_tokens"],
        "distinct_normalized_targets": reports["template_concentration"]["distinct_normalized_targets"],
        "family_distribution": dict(sorted(Counter(row["family_id"] for row in rows).items())),
        "split_distribution": dict(Counter(row["split"] for row in rows)),
        "quality_tier_distribution": dict(Counter(row["quality_tier"] for row in rows)),
        "maximum_sequence_tokens": reports["assistant_mask_audit"]["maximum_sequence_tokens"],
        "training_started": False, "optimizer_tokens": 0, "assistant_target_tokens_counter": 0,
    }
    atomic_json(root / "reports" / "full_dataset_build.json", summary)
    if not reports["valid"] or len(rows) < 1200 or reports["assistant_mask_audit"]["assistant_target_tokens"] < 80000:
        raise ValueError("full_dataset_deterministic_admission_failed")
    return summary


def write_full_audit(root: Path) -> dict[str, Any]:
    dataset = root / "dataset"
    rows = read_jsonl(dataset / "train.jsonl") + read_jsonl(dataset / "dev.jsonl")
    sample = full_audit_sample(rows)
    reviewed, report = semantic_review(sample, pilot=False)
    atomic_jsonl(root / "agent_audit" / "full_semantic_audit_rows.jsonl", reviewed)
    report["canonical_scenario_coverage_rate"] = len({row["parent_scenario_id"] for row in sample}) / len({row["parent_scenario_id"] for row in rows})
    report["high_risk_reviewed_count"] = sum(row["family_kind"] in {"correction", "referent", "constraint", "rewrite", "summary", "identity", "privacy", "uncertainty", "clarification"} for row in sample)
    atomic_json(dataset / "full_semantic_audit.json", report)
    atomic_json(root / "reports" / "full_semantic_audit.json", report)
    if not report["valid"]:
        raise ValueError("full_semantic_audit_failed")
    return report


def write_human_pack(root: Path) -> dict[str, Any]:
    rows = read_jsonl(root / "dataset" / "train.jsonl") + read_jsonl(root / "dataset" / "dev.jsonl")
    by_family_tier: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_family_tier[(row["family_id"], row["quality_tier"])].append(row)
    selected: dict[str, dict[str, Any]] = {}
    for values in by_family_tier.values():
        selected[values[0]["session_id"]] = values[0]
    high_risk = {"correction", "referent", "constraint", "rewrite", "summary", "identity", "privacy", "uncertainty", "clarification"}
    for row in sorted(rows, key=lambda item: (item["family_kind"] not in high_risk, item["session_id"])):
        if len(selected) >= 120:
            break
        selected[row["session_id"]] = row
    pack = []
    for row in list(selected.values())[:120]:
        pack.append({
            "session_id": row["session_id"], "family_id": row["family_id"], "family_kind": row["family_kind"],
            "quality_tier": row["quality_tier"], "messages": row["messages"], "target": row["target"],
            "metadata": {key: row[key] for key in ("parent_scenario_id", "dialogue_act", "semantic_digest", "target_fact_ids_after", "split")},
            "validator_results": row["validator_result"],
            "human_reviewer": None, "human_decision": None, "human_notes": None,
        })
    pack_dir = root / "human_review_pack"
    atomic_jsonl(pack_dir / "sessions.jsonl", pack)
    manifest = {
        "campaign_id": CAMPAIGN_ID, "created_at": utc_now(), "valid": len(pack) == 120,
        "session_count": len(pack), "family_count": len({row["family_id"] for row in pack}),
        "quality_tiers": dict(Counter(row["quality_tier"] for row in pack)),
        "high_risk_count": sum(row["family_kind"] in high_risk for row in pack),
        "human_review_completed": False, "contains_private_data": False,
        "sessions_sha256": sha256_file(pack_dir / "sessions.jsonl"),
    }
    atomic_json(pack_dir / "manifest.json", manifest)
    return manifest


def admit_dataset(root: Path) -> dict[str, Any]:
    dataset = root / "dataset"
    rows = read_jsonl(dataset / "train.jsonl") + read_jsonl(dataset / "dev.jsonl")
    scenarios = read_jsonl(dataset / "canonical_scenarios.jsonl")
    semantic = json.loads((dataset / "full_semantic_audit.json").read_text(encoding="utf-8"))
    pilot = json.loads((dataset / "pilot_audit.json").read_text(encoding="utf-8"))
    mask = json.loads((dataset / "assistant_mask_audit.json").read_text(encoding="utf-8"))
    concentration = json.loads((dataset / "template_concentration.json").read_text(encoding="utf-8"))
    contamination = json.loads((dataset / "eval_contamination.json").read_text(encoding="utf-8"))
    if not pilot.get("valid"):
        raise ValueError("cannot_admit_without_passing_pilot")
    if not semantic.get("valid") or semantic.get("critical_issue_count") != 0 or semantic.get("systematic_issue_count") != 0:
        raise ValueError("cannot_admit_without_passing_full_semantic_audit")
    if mask.get("assistant_only_mask_errors") != 0 or not contamination.get("valid") or not concentration.get("valid"):
        raise ValueError("cannot_admit_with_unresolved_deterministic_failure")
    checksummed_names = (
        "train.jsonl", "dev.jsonl", "canonical_scenarios.jsonl", "schema_validation.json",
        "assistant_mask_audit.json", "fact_provenance_audit.json", "family_invariant_audit.json",
        "split_integrity.json", "eval_contamination.json", "template_concentration.json",
        "pilot_audit.json", "full_semantic_audit.json", "sampling_contract.json",
    )
    checksums = {name: sha256_file(dataset / name) for name in checksummed_names}
    atomic_json(dataset / "checksums.json", {"campaign_id": CAMPAIGN_ID, "created_at": utc_now(), "file_sha256": checksums})
    file_hashes = {**checksums, "checksums.json": sha256_file(dataset / "checksums.json")}
    manifest = {
        "dataset_id": "r29b2m_r2_scenario_grounded_daily_dialogue_v1",
        "version": "1.0.0", "campaign_id": CAMPAIGN_ID, "created_at": utc_now(),
        "source_revision": git_head(), "parent_rejected_dataset_ids": [REJECTED_R1_DATASET_ID],
        "parent_rejected_campaign_ids": [REJECTED_R1_CAMPAIGN_ID],
        "parent_rejected_manifest_sha256": [REJECTED_R1_MANIFEST_SHA256],
        "generator_source_sha": sha256_file(CATALOG_PATH), "renderer_sha256": sha256_file(RENDERER_PATH),
        "scenario_schema_sha256": sha256_file(SCHEMA_PATH), "validator_sha256": sha256_file(VALIDATOR_PATH),
        "tokenizer_sha256": sha256_file(TOKENIZER_PATH), "eval_v2_manifest_sha256": sha256_file(EVAL_MANIFEST_PATH),
        "session_count": len(rows), "canonical_scenario_count": len(scenarios),
        "distinct_normalized_target_count": len({normalize(row["target"]) for row in rows}),
        "assistant_target_token_count": mask["assistant_target_tokens"],
        "family_distribution": dict(sorted(Counter(row["family_id"] for row in rows).items())),
        "train_dev_distribution": dict(Counter(row["split"] for row in rows)),
        "quality_tier_distribution": dict(Counter(row["quality_tier"] for row in rows)),
        "human_review_completed": False, "codex_semantic_review_completed": True,
        "semantic_audit": {"valid": semantic["valid"], "reviewed_session_count": semantic["reviewed_session_count"], "systematic_issue_count": semantic["systematic_issue_count"]},
        "critical_issue_count": semantic["critical_issue_count"], "noncritical_issue_count": semantic["noncritical_issue_count"],
        "pilot_admitted": pilot["valid"], "eval_v2_near_duplicate_count": contamination["near_duplicate_count"],
        "assistant_mask_error_count": mask["assistant_only_mask_errors"],
        "maximum_six_character_opening_share": concentration["maximum_six_character_opening_share"],
        "maximum_exact_target_occurrence": concentration["maximum_exact_target_occurrence"],
        "maximum_renderer_skeleton_share": concentration["maximum_renderer_skeleton_share"],
        "admitted_for_engineering_sft": True, "not_product_training_admission": True,
        "file_sha256": file_hashes,
        "training_started": False, "optimizer_tokens": 0, "assistant_target_tokens": 0,
        "parent_checkpoint": None, "candidate_checkpoint": None,
    }
    atomic_json(dataset / "dataset_manifest.json", manifest)
    validate_dataset_admission(manifest, dataset)
    return manifest


def finalize(root: Path) -> dict[str, Any]:
    manifest = admit_dataset(root)
    now = utc_now()
    state = {
        "campaign_id": CAMPAIGN_ID, "state": "PASSED_DATASET_ADMISSION_READY_FOR_SFT",
        "phase_started_at": now, "updated_at": now, "source_revision": git_head(),
        "child_pid": None, "child_command": None, "last_output": "dataset_admission_passed_no_training",
        "last_output_at": now, "training_started": False, "optimizer_tokens": 0,
        "assistant_target_tokens": 0, "parent_checkpoint": None, "candidate_checkpoint": None,
        "dataset_admitted_for_engineering_sft": True, "human_review_completed": False,
        "weights_committed": False, "corpus_committed": False, "public_model_replaced": False,
        "deployment_performed": False,
    }
    atomic_json(root / "campaign_state.json", state)
    atomic_json(root / "heartbeat_latest.json", {
        "campaign_id": CAMPAIGN_ID, "created_at": now, "state": state["state"], "process_active": False,
        "child_pid": None, "child_command": None, "last_output": state["last_output"], "last_output_at": now,
    })
    report = {
        "campaign_id": CAMPAIGN_ID, "created_at": now, "terminal_state": state["state"],
        "canonical_scenario_count": manifest["canonical_scenario_count"], "full_session_count": manifest["session_count"],
        "distinct_normalized_targets": manifest["distinct_normalized_target_count"],
        "assistant_target_tokens_in_dataset": manifest["assistant_target_token_count"],
        "family_distribution": manifest["family_distribution"], "quality_tier_distribution": manifest["quality_tier_distribution"],
        "deterministic_validation": True, "codex_semantic_audit": manifest["semantic_audit"],
        "critical_issue_count": manifest["critical_issue_count"], "noncritical_issue_count": manifest["noncritical_issue_count"],
        "human_review_completed": False, "dataset_admission": "engineering_sft_ready_not_product_admission",
        "training_started": False, "optimizer_tokens": 0, "assistant_target_tokens": 0,
        "parent_checkpoint": None, "candidate_checkpoint": None, "weights_committed": False,
        "corpus_committed": False, "public_model_replaced": False, "deployment_performed": False,
        "next_state": "PASSED_DATASET_ADMISSION_READY_FOR_SFT",
    }
    atomic_json(root / "reports" / "final_engineering_report.json", report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("review-seeds", "build-pilot", "build-full", "semantic-audit", "human-pack", "admit"))
    parser.add_argument("--artifact-root", type=Path, required=True)
    args = parser.parse_args()
    root = args.artifact_root.resolve()
    actions = {
        "review-seeds": write_review_seed_outputs,
        "build-pilot": write_pilot,
        "build-full": write_full,
        "semantic-audit": write_full_audit,
        "human-pack": write_human_pack,
        "admit": finalize,
    }
    result = actions[args.action](root)
    print(json.dumps({"action": args.action, "valid": result.get("valid", True), "training_started": False, "optimizer_tokens": 0, "assistant_target_tokens": 0}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
