"""Explicit paired renderer for R29B2M-R2 scenarios."""

from __future__ import annotations

from typing import Any

from src.training.mlx.r29b2m_r2_schema import ScenarioSpec
from src.training.mlx.r29b2m_r2_validators import validate_family_target, validate_paired_variation


TARGET_PAIRING = (0, 1, 2, 0, 1, 2)


def render_scenario(spec: ScenarioSpec, *, variant_count: int = 6) -> list[dict[str, Any]]:
    if variant_count not in {4, 5, 6}:
        raise ValueError("r29b2m_r2_variant_count_must_be_4_to_6")
    if len(spec.prompt_variants) < variant_count or len(spec.canonical_targets) != 3:
        raise ValueError("r29b2m_r2_explicit_pairing_inputs_incomplete")
    digest = spec.semantic_digest()
    rows = []
    for index in range(variant_count):
        prompt = spec.prompt_variants[index]
        target_index = TARGET_PAIRING[index]
        target = spec.canonical_targets[target_index]
        pair_id = f"{spec.scenario_id}_v{index + 1:02d}"
        row = {
            "session_id": pair_id,
            "variation_pair_id": pair_id,
            "parent_scenario_id": spec.scenario_id,
            "family_id": spec.family_id,
            "family_kind": spec.family_kind,
            "capability": spec.capability,
            "dialogue_act": spec.dialogue_act,
            "messages": [{"role": message.role, "content": message.content} for message in prompt.messages],
            "target": target,
            "prompt_variant_id": prompt.prompt_variant_id,
            "target_variant_id": f"target_v{target_index + 1:02d}",
            "operator_ids": list(prompt.operator_ids) + (["gold_whole_target"] if target_index == 0 else [f"authored_whole_target_v{target_index + 1:02d}"]),
            "before_semantic_digest": digest,
            "after_semantic_digest": digest,
            "semantic_digest": digest,
            "target_fact_ids_before": list(spec.target_fact_ids),
            "target_fact_ids_after": list(spec.target_fact_ids),
            "quality_tier": "gold_canonical" if index == 0 else "verified_surface_variant",
            "renderer_skeleton_id": f"{spec.scenario_id}:{prompt.prompt_variant_id}:target_v{target_index + 1:02d}",
            "validator_result": {"valid": True, "issue_count": 0},
            "provenance": spec.provenance,
            "review_status": spec.review_status,
            "split_group": spec.split_group,
            "split": spec.split,
            "maximum_answer_characters": spec.maximum_answer_characters,
        }
        issues = validate_family_target(spec, target) + validate_paired_variation(row, spec)
        if issues:
            row["validator_result"] = {"valid": False, "issues": [issue.to_dict() for issue in issues]}
            raise ValueError(f"r29b2m_r2_variation_validation_failed:{pair_id}:{row['validator_result']}")
        rows.append(row)
    if len({row["variation_pair_id"] for row in rows}) != variant_count:
        raise AssertionError("variation_pair_ids_not_unique")
    return rows


def render_dataset(scenarios: list[ScenarioSpec], *, variant_count: int = 6) -> list[dict[str, Any]]:
    rows = [row for spec in scenarios for row in render_scenario(spec, variant_count=variant_count)]
    if len(rows) != len(scenarios) * variant_count:
        raise AssertionError("no_cartesian_expansion_contract")
    return rows
