"""Typed scenario schema and family contracts for scenario-grounded dialogue data."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any


REQUIRED_FIELDS = (
    "scenario_id", "family_id", "capability", "dialogue_act", "messages",
    "world_facts", "user_request", "active_referent", "alternative_referents",
    "active_constraints", "removed_constraints", "correction_before",
    "correction_after", "source_text", "requested_transformation",
    "target_fact_ids", "forbidden_fact_ids", "must_include_values",
    "must_exclude_values", "maximum_answer_characters", "tone_contract",
    "canonical_targets", "prompt_variants", "provenance", "review_status",
    "split_group", "split",
)

MAJOR_FAMILY_KINDS = (
    "ordinary", "acknowledgement", "follow_up", "referent", "correction",
    "constraint", "rewrite", "summary", "planning", "comparison",
    "uncertainty", "clarification", "identity", "privacy", "voice",
)

FAMILY_CONTRACTS: dict[str, tuple[str, ...]] = {
    "ordinary": ("answers_specific_request", "facts_from_scenario", "no_policy_language"),
    "acknowledgement": ("natural_acknowledgement", "no_forced_plan", "one_or_two_sentences"),
    "follow_up": ("answers_current_gap", "depends_on_history", "no_policy_language"),
    "referent": ("active_referent_bound", "alternative_exclusive_facts_absent"),
    "correction": ("correction_after_active", "correction_before_inactive"),
    "constraint": ("all_active_constraints_satisfied", "removed_constraints_absent"),
    "rewrite": ("source_fact_ledger_preserved", "requested_transformation_only"),
    "summary": ("target_facts_subset_of_source", "source_order_preserved"),
    "planning": ("concrete_plan", "scenario_constraints_only"),
    "comparison": ("declared_candidates_only", "declared_dimensions_only"),
    "uncertainty": ("no_invented_answer", "bounded_uncertainty"),
    "clarification": ("one_necessary_question", "missing_field_explicit"),
    "identity": ("identity_only", "no_internal_ontology", "no_privacy_collision"),
    "privacy": ("brief_privacy_refusal", "safe_alternative_optional", "no_identity_collision"),
    "voice": ("natural_short_answer", "no_customer_service_template"),
}


@dataclass(frozen=True)
class Message:
    role: str
    content: str


@dataclass(frozen=True)
class PromptVariant:
    prompt_variant_id: str
    messages: tuple[Message, ...]
    operator_ids: tuple[str, ...]


@dataclass(frozen=True)
class ScenarioSpec:
    scenario_id: str
    family_id: str
    capability: str
    dialogue_act: str
    messages: tuple[Message, ...]
    world_facts: dict[str, str]
    user_request: str
    active_referent: str | None
    alternative_referents: tuple[str, ...]
    active_constraints: tuple[str, ...]
    removed_constraints: tuple[str, ...]
    correction_before: str | None
    correction_after: str | None
    source_text: str | None
    requested_transformation: str | None
    target_fact_ids: tuple[str, ...]
    forbidden_fact_ids: tuple[str, ...]
    must_include_values: tuple[str, ...]
    must_exclude_values: tuple[str, ...]
    maximum_answer_characters: int
    tone_contract: str
    canonical_targets: tuple[str, ...]
    prompt_variants: tuple[PromptVariant, ...]
    provenance: str
    review_status: str
    split_group: str
    split: str
    family_kind: str
    source_fact_ids: tuple[str, ...] = ()
    requested_addition_fact_ids: tuple[str, ...] = ()
    missing_field: str | None = None

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "ScenarioSpec":
        missing = [field for field in REQUIRED_FIELDS if field not in value]
        if missing:
            raise ValueError(f"scenario_missing_required_fields:{','.join(missing)}")
        messages = tuple(Message(str(item["role"]), str(item["content"])) for item in value["messages"])
        prompt_variants = tuple(
            PromptVariant(
                prompt_variant_id=str(item["prompt_variant_id"]),
                messages=tuple(Message(str(message["role"]), str(message["content"])) for message in item["messages"]),
                operator_ids=tuple(str(operator) for operator in item.get("operator_ids", [])),
            )
            for item in value["prompt_variants"]
        )
        return cls(
            scenario_id=str(value["scenario_id"]), family_id=str(value["family_id"]),
            capability=str(value["capability"]), dialogue_act=str(value["dialogue_act"]),
            messages=messages, world_facts={str(k): str(v) for k, v in value["world_facts"].items()},
            user_request=str(value["user_request"]), active_referent=value["active_referent"],
            alternative_referents=tuple(str(v) for v in value["alternative_referents"]),
            active_constraints=tuple(str(v) for v in value["active_constraints"]),
            removed_constraints=tuple(str(v) for v in value["removed_constraints"]),
            correction_before=value["correction_before"], correction_after=value["correction_after"],
            source_text=value["source_text"], requested_transformation=value["requested_transformation"],
            target_fact_ids=tuple(str(v) for v in value["target_fact_ids"]),
            forbidden_fact_ids=tuple(str(v) for v in value["forbidden_fact_ids"]),
            must_include_values=tuple(str(v) for v in value["must_include_values"]),
            must_exclude_values=tuple(str(v) for v in value["must_exclude_values"]),
            maximum_answer_characters=int(value["maximum_answer_characters"]),
            tone_contract=str(value["tone_contract"]), canonical_targets=tuple(str(v) for v in value["canonical_targets"]),
            prompt_variants=prompt_variants, provenance=str(value["provenance"]),
            review_status=str(value["review_status"]), split_group=str(value["split_group"]), split=str(value["split"]),
            family_kind=str(value.get("family_kind") or infer_family_kind(str(value["capability"]))),
            source_fact_ids=tuple(str(v) for v in value.get("source_fact_ids", [])),
            requested_addition_fact_ids=tuple(str(v) for v in value.get("requested_addition_fact_ids", [])),
            missing_field=value.get("missing_field"),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def semantic_payload(self) -> dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "family_id": self.family_id,
            "capability": self.capability,
            "dialogue_act": self.dialogue_act,
            "world_facts": self.world_facts,
            "active_referent": self.active_referent,
            "alternative_referents": self.alternative_referents,
            "active_constraints": self.active_constraints,
            "removed_constraints": self.removed_constraints,
            "correction_before": self.correction_before,
            "correction_after": self.correction_after,
            "source_text": self.source_text,
            "requested_transformation": self.requested_transformation,
            "target_fact_ids": self.target_fact_ids,
            "forbidden_fact_ids": self.forbidden_fact_ids,
            "must_include_values": self.must_include_values,
            "must_exclude_values": self.must_exclude_values,
        }

    def semantic_digest(self) -> str:
        payload = json.dumps(self.semantic_payload(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def infer_family_kind(capability: str) -> str:
    if capability in {"daily_food_answer", "household_answer"}:
        return "ordinary"
    if capability in {"daily_acknowledgement", "emotional_acknowledgement", "greeting"}:
        return "acknowledgement"
    if capability == "follow_up":
        return "follow_up"
    if capability.startswith("referent_"):
        return "referent"
    if capability.endswith("_correction"):
        return "correction"
    if capability in {"one_constraint", "two_constraints", "late_constraint", "removed_constraint"}:
        return "constraint"
    if capability == "rewrite":
        return "rewrite"
    if capability == "short_summary":
        return "summary"
    if capability == "simple_planning":
        return "planning"
    if capability == "simple_comparison":
        return "comparison"
    if capability == "uncertainty":
        return "uncertainty"
    if capability == "necessary_clarification":
        return "clarification"
    if capability == "identity_boundary":
        return "identity"
    if capability == "privacy_boundary":
        return "privacy"
    return "voice"
