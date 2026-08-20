"""Permanent rejection identifiers for the R29B2M-R1 dataset and generator."""

from __future__ import annotations

from typing import Any


REJECTED_GENERATOR_STATUS = "REJECTED_GENERATOR_DO_NOT_USE_FOR_TRAINING"
REJECTED_R1_CAMPAIGN_ID = "r29b2m_r1_measured_sft_v1"
REJECTED_R1_DATASET_ID = "r29b2m_r1.dialogue_sft.v1/6000/64c43836"
REJECTED_R1_MANIFEST_SHA256 = "73b869081bb5b3ba8ec574dafd5890920858608ddb3dedcac365b006ad793960"
REJECTED_R1_SESSIONS_SHA256 = "64c43836f5edbb424c6cb1397255c4537fae3bf88589f4ce47496760b628fb03"
REJECTED_R1_VALIDATION_SHA256 = "c04821bad8c4f39214ed2f776d852aee66abaa1f80d462ed2abe10f27fc618b3"
REJECTED_R1_SEMANTIC_AUDIT_SHA256 = "bf742c7c628b0d922a6e121553406418e258ae14b5fa69f6ff1e6eb2821de23a"


def rejected_dataset_registry() -> dict[str, Any]:
    return {
        "dataset_status": "rejected_systematic_semantic_misalignment",
        "old_dataset_id": REJECTED_R1_DATASET_ID,
        "old_campaign_id": REJECTED_R1_CAMPAIGN_ID,
        "old_dataset_manifest_sha256": REJECTED_R1_MANIFEST_SHA256,
        "old_sessions_sha256": REJECTED_R1_SESSIONS_SHA256,
        "old_validation_sha256": REJECTED_R1_VALIDATION_SHA256,
        "old_semantic_audit_sha256": REJECTED_R1_SEMANTIC_AUDIT_SHA256,
        "rejection_reasons": [
            "base_target_plus_generic_policy_tail",
            "scenario_independent_prompt_and_target_modifiers",
            "referent_correction_and_constraint_misalignment",
            "rewrite_and_summary_fact_injection",
            "grammatical_tail_collisions",
        ],
        "policy_language_hits_in_400_reviewed": 162,
        "closure_or_collision_hits_in_400_reviewed": 83,
        "training_admission": False,
        "permitted_use": "audit_and_regression_fixture_only",
        "generator_status": REJECTED_GENERATOR_STATUS,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }


def assert_not_rejected_dataset(manifest: dict[str, Any], *, manifest_sha256: str | None = None) -> None:
    rejected = []
    if manifest.get("campaign_id") == REJECTED_R1_CAMPAIGN_ID:
        rejected.append("campaign_id")
    if manifest.get("dataset_id") == REJECTED_R1_DATASET_ID:
        rejected.append("dataset_id")
    if manifest_sha256 == REJECTED_R1_MANIFEST_SHA256:
        rejected.append("manifest_sha256")
    if manifest.get("sessions_sha256") == REJECTED_R1_SESSIONS_SHA256:
        rejected.append("sessions_sha256")
    if rejected:
        raise ValueError("rejected_r29b2m_r1_dataset:" + ",".join(rejected))
