from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]

from src.personal_judge.r30j1c_manual_evidence_contract import (  # noqa: E402
    EVIDENCE_CLASSES,
    OWNER_CHAT_ATTESTATION_KIND,
    OWNER_CHAT_AUTHORSHIP_CLASS,
    aggregate_public_receipt,
    validate_alias_timeline,
    validate_correction_item,
    validate_deidentified_message,
    validate_hypothesis,
    validate_owner_assertion,
    validate_peer_evidence,
    validate_single_source_family,
    validate_source_envelope,
)


def load_json(relative: str):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def load_schema_validator():
    path = ROOT / "tests" / "r30j0" / "test_p2_schema_contract.py"
    spec = importlib.util.spec_from_file_location("r30j1c_schema_validator", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.validate_jsonschema


VALIDATE_SCHEMA = load_schema_validator()
OPAQUE = "local." + "a" * 24
OTHER_OPAQUE = "local." + "b" * 24
MESSAGE = "local." + "c" * 24
CLUSTER = "local." + "d" * 24
EVIDENCE = "local." + "e" * 24
HYPOTHESIS = "local." + "f" * 24
LATENT = "local." + "1" * 24
CORRECTION = "local.correction." + "2" * 24


def source_template():
    return load_json("data/personal_judge/templates/r30j1c_manual_owner_evidence_source_v1.empty.json")


def populated_source():
    value = source_template()
    value["status"] = "OWNER_CORRECTION_PENDING"
    value["contains_owner_specific_values"] = True
    value["source_family"] = {
        "source_family_ref": OPAQUE,
        "document_group_ref": OPAQUE,
        "idea_group_ref": OPAQUE,
        "family_group_ref": OPAQUE,
    }
    value["evidence_class_counts"] = {
        "current_explicit_owner_assertion": 3,
        "owner_chat_direct": 4,
        "peer_reception": 2,
        "peer_playful_mythology": 1,
    }
    value["privacy_receipt"]["deidentification_complete"] = True
    value["privacy_receipt"]["quote_blocks_separated"] = True
    value["privacy_receipt"]["third_party_identifiers_removed"] = True
    value["authorship_receipt"]["owner_attestation_present"] = True
    value["authorship_receipt"]["direct_body_attribution_pass"] = True
    value["correction_pack_receipt"]["correction_item_count"] = 3
    return value


def message(**updates):
    value = {
        "message_id": MESSAGE,
        "sequence_index": 3,
        "turn_cluster_ref": CLUSTER,
        "source_family_ref": OPAQUE,
        "speaker": "OWNER",
        "speaker_role": "OWNER",
        "body": "这是公开安全的合成消息。",
        "quoted_speaker": "PEER_001",
        "quoted_body": "这是合成引用上下文。",
        "quoted_body_owner_style_admissible": False,
        "body_provenance": "DIRECT_MESSAGE_BODY",
        "message_kind": "TEXT",
        "privacy_status": "PASS",
        "raw_username_present": False,
        "avatar_present": False,
        "exact_timestamp_present": False,
        "evidence_class": OWNER_CHAT_AUTHORSHIP_CLASS,
        "owner_style_admissible": True,
        "peer_reception_analysis_eligible": False,
        "normative_evidence": False,
        "owner_identity_truth": False,
        "owner_review_required": True,
        "allowed_for_training": False,
    }
    value.update(updates)
    return value


def peer_evidence(evidence_class="PEER_RECEPTION_EVIDENCE"):
    return {
        "evidence_id": EVIDENCE,
        "source_family_ref": OPAQUE,
        "source_message_ref": MESSAGE,
        "anonymous_speaker_ref": "PEER_001",
        "evidence_class": evidence_class,
        "claim_code": "synthetic_reception_pattern",
        "convergence_cluster_ref": CLUSTER,
        "independent_speaker_count": 2,
        "descriptive_confidence": 0.8,
        "normative_confidence": 0.0,
        "owner_authored": False,
        "owner_identity_truth": False,
        "owner_preference_gold": False,
        "hypothesis_context_allowed": evidence_class == "PEER_RECEPTION_EVIDENCE",
        "anti_caricature_context_allowed": evidence_class == "PEER_PLAYFUL_MYTHOLOGY",
        "raw_excerpt_present": False,
        "owner_review_required": True,
        "allowed_for_training": False,
    }


def hypothesis():
    return {
        "hypothesis_id": HYPOTHESIS,
        "source_family_ref": OPAQUE,
        "latent_family_ref": LATENT,
        "behaviour_code": "synthetic_bounded_delivery",
        "claim_status": "DESCRIPTIVE_HYPOTHESIS_ONLY",
        "evidence_basis": "MIXED_DESCRIPTIVE",
        "evidence_refs": [EVIDENCE],
        "authorship_confidence": 1.0,
        "descriptive_confidence": 0.7,
        "normative_confidence": 0.0,
        "generalization_scope": "single_conversation_observation",
        "topic_slice_ref": OTHER_OPAQUE,
        "positive_boundary": ["A low-stakes synthetic context supports the behaviour."],
        "negative_boundary": ["A factual or safety-critical context forbids the behaviour."],
        "compatible_registers": ["ordinary_chat"],
        "forbidden_registers": ["technical_explanation"],
        "epistemic_category": None,
        "is_runtime_mode": False,
        "is_owner_identity_truth": False,
        "contains_raw_excerpt": False,
        "profile_frozen": False,
        "owner_review_required": True,
        "allowed_for_training": False,
    }


def correction_item():
    return {
        "version": "r30j1c.owner-correction-item.v1",
        "status": "OWNER_REVIEW_REQUIRED",
        "local_only": True,
        "must_remain_ignored": True,
        "correction_id": CORRECTION,
        "source_family_ref": OPAQUE,
        "split_family_ref": OPAQUE,
        "target_hypothesis_refs": [HYPOTHESIS],
        "evidence_refs": [EVIDENCE],
        "information_goal": "synthetic_boundary",
        "question_family": "synthetic_condition_review",
        "register_context": "ordinary_chat",
        "topic_slice_ref": OTHER_OPAQUE,
        "question_text_local": "在什么合成条件下，这种简短表达仍然合适？",
        "contains_source_excerpt": False,
        "review_actions": ["ACCEPT", "REJECT", "EDIT", "DEPENDS", "UNSURE"],
        "depends_requires_condition": True,
        "owner_response_present": False,
        "owner_review_status": "UNREVIEWED",
        "owner_review_required": True,
        "gold_admission": False,
        "allowed_for_training": False,
        "heldout_eligible": False,
    }


class R30J1CManualEvidenceContractTests(unittest.TestCase):
    def test_config_is_local_review_only_and_zero_training(self):
        config = load_json("config/r30j1c_manual_owner_evidence_intake_v1.json")
        self.assertEqual(tuple(config["evidence_classes"]), EVIDENCE_CLASSES)
        self.assertFalse(config["execution_boundary"]["network_requests_allowed"])
        self.assertEqual(config["execution_boundary"]["api_requests"], 0)
        self.assertFalse(config["tracked_output_boundary"]["actual_source_id"])
        self.assertFalse(config["tracked_output_boundary"]["actual_hypothesis_values"])
        self.assertFalse(config["training_state"]["training_started"])
        self.assertEqual(config["training_state"]["optimizer_tokens"], 0)
        self.assertFalse(config["training_state"]["allowed_for_training"])

    def test_empty_templates_validate_against_schemas_and_contracts(self):
        source = source_template()
        source_schema = load_json("schemas/r30j1c_manual_owner_evidence_source_v1.schema.json")
        correction = load_json("data/personal_judge/templates/r30j1c_owner_correction_item_v1.empty.json")
        correction_schema = load_json("schemas/r30j1c_owner_correction_item_v1.schema.json")
        VALIDATE_SCHEMA(source, source_schema)
        VALIDATE_SCHEMA(correction, correction_schema)
        validate_source_envelope(source)
        validate_correction_item(correction)

    def test_populated_aggregate_envelope_uses_one_opaque_family(self):
        value = populated_source()
        VALIDATE_SCHEMA(value, load_json("schemas/r30j1c_manual_owner_evidence_source_v1.schema.json"))
        validate_source_envelope(value)
        value["source_family"]["idea_group_ref"] = OTHER_OPAQUE
        with self.assertRaisesRegex(ValueError, "one_conversation"):
            validate_source_envelope(value)

    def test_direct_owner_body_is_descriptive_and_quote_is_context_only(self):
        value = message()
        validate_deidentified_message(value)
        self.assertTrue(value["owner_style_admissible"])
        self.assertFalse(value["quoted_body_owner_style_admissible"])
        self.assertFalse(value["normative_evidence"])
        self.assertFalse(value["allowed_for_training"])

    def test_peer_quoting_owner_never_becomes_owner_prose(self):
        value = message(
            speaker="PEER_001",
            speaker_role="PEER",
            quoted_speaker="OWNER",
            evidence_class="CONTEXT_ONLY",
            owner_style_admissible=False,
        )
        validate_deidentified_message(value)
        value["owner_style_admissible"] = True
        with self.assertRaisesRegex(ValueError, "direct_body_rule"):
            validate_deidentified_message(value)

    def test_peer_reception_is_analysis_only_and_never_normative(self):
        value = message(
            speaker="PEER_001",
            speaker_role="PEER",
            quoted_speaker=None,
            quoted_body=None,
            evidence_class="PEER_RECEPTION_EVIDENCE",
            owner_style_admissible=False,
            peer_reception_analysis_eligible=True,
        )
        validate_deidentified_message(value)
        evidence = peer_evidence()
        validate_peer_evidence(evidence)
        self.assertFalse(evidence["anti_caricature_context_allowed"])
        evidence["normative_confidence"] = 0.2
        with self.assertRaisesRegex(ValueError, "normative_confidence"):
            validate_peer_evidence(evidence)

        evidence = peer_evidence()
        evidence["anti_caricature_context_allowed"] = True
        with self.assertRaisesRegex(ValueError, "anti_caricature_context_allowed"):
            validate_peer_evidence(evidence)

    def test_playful_mythology_has_zero_identity_weight(self):
        value = peer_evidence("PEER_PLAYFUL_MYTHOLOGY")
        validate_peer_evidence(value)
        self.assertFalse(value["owner_identity_truth"])
        self.assertFalse(value["hypothesis_context_allowed"])
        self.assertTrue(value["anti_caricature_context_allowed"])
        value["owner_identity_truth"] = True
        with self.assertRaisesRegex(ValueError, "owner_identity_truth"):
            validate_peer_evidence(value)

    def test_raw_identifiers_fail_deidentified_message_contract(self):
        value = message(raw_username_present=True)
        with self.assertRaisesRegex(ValueError, "raw_username_present"):
            validate_deidentified_message(value)

    def test_current_assertions_are_provenance_not_model_features(self):
        value = {
            "assertion_id": EVIDENCE,
            "source_family_ref": OPAQUE,
            "assertion_kind": "synthetic_context_fact",
            "assertion_scope": "CONTEXT_FACT",
            "attestation_kind": "CURRENT_EXPLICIT_OWNER_ASSERTION",
            "value_local": "synthetic local value",
            "value_tracked": False,
            "authorship_confidence": 1.0,
            "descriptive_confidence": 1.0,
            "normative_confidence": 0.0,
            "generalization_scope": "source_context_only",
            "provenance_usable": True,
            "model_feature_eligible": False,
            "owner_review_required": True,
            "allowed_for_training": False,
        }
        validate_owner_assertion(value)
        value["model_feature_eligible"] = True
        with self.assertRaisesRegex(ValueError, "model_feature_eligible"):
            validate_owner_assertion(value)

    def test_alias_timeline_maps_aliases_to_one_subject_only(self):
        value = {
            "version": "r30j1c.owner-alias-timeline.local.v1",
            "subject_ref": OPAQUE,
            "events": [
                {
                    "era_code": "synthetic_era",
                    "alias_local": "Synthetic Alias",
                    "same_person": True,
                    "value_tracked": False,
                }
            ],
            "aliases_are_distinct_personas": False,
            "provenance_disambiguation_only": True,
            "model_input_eligible": False,
            "owner_review_required": True,
            "allowed_for_training": False,
        }
        validate_alias_timeline(value)
        value["aliases_are_distinct_personas"] = True
        with self.assertRaisesRegex(ValueError, "distinct_personas"):
            validate_alias_timeline(value)

    def test_hypothesis_remains_descriptive_non_runtime_and_review_only(self):
        value = hypothesis()
        validate_hypothesis(value)
        self.assertEqual(value["normative_confidence"], 0.0)
        self.assertFalse(value["is_runtime_mode"])
        self.assertFalse(value["profile_frozen"])
        value["is_runtime_mode"] = True
        with self.assertRaisesRegex(ValueError, "is_runtime_mode"):
            validate_hypothesis(value)

    def test_topic_slice_is_not_a_register(self):
        value = hypothesis()
        value["compatible_registers"] = ["synthetic_hobby_topic"]
        with self.assertRaisesRegex(ValueError, "register_unknown"):
            validate_hypothesis(value)

    def test_correction_item_requires_same_family_and_no_gold(self):
        value = correction_item()
        VALIDATE_SCHEMA(value, load_json("schemas/r30j1c_owner_correction_item_v1.schema.json"))
        validate_correction_item(value)
        value["split_family_ref"] = OTHER_OPAQUE
        with self.assertRaisesRegex(ValueError, "share_source_split_family"):
            validate_correction_item(value)

    def test_all_derived_record_types_share_one_family(self):
        records = [message(), peer_evidence(), hypothesis(), correction_item()]
        validate_single_source_family(OPAQUE, records)
        records[-1] = copy.deepcopy(records[-1])
        records[-1]["source_family_ref"] = OTHER_OPAQUE
        with self.assertRaisesRegex(ValueError, "crosses_source_family"):
            validate_single_source_family(OPAQUE, records)

    def test_public_receipt_contains_aggregates_and_no_identifiers(self):
        receipt = aggregate_public_receipt(populated_source())
        serialized = json.dumps(receipt, sort_keys=True)
        self.assertEqual(receipt["manual_source_count"], 1)
        self.assertEqual(receipt["third_party_optimizer_count"], 0)
        self.assertFalse(receipt["training_started"])
        self.assertNotIn(OPAQUE, serialized)
        self.assertNotIn("source_family_ref", serialized)
        self.assertNotIn("question_text_local", serialized)

    def test_tracked_schemas_have_closed_objects_and_no_source_value_slots_in_envelope(self):
        source_schema = load_json("schemas/r30j1c_manual_owner_evidence_source_v1.schema.json")
        correction_schema = load_json("schemas/r30j1c_owner_correction_item_v1.schema.json")
        self.assertFalse(source_schema["additionalProperties"])
        self.assertFalse(correction_schema["additionalProperties"])
        for forbidden in ("source_id", "alias", "raw_text", "excerpt", "sha256", "logical_path"):
            self.assertNotIn(forbidden, source_schema["properties"])
        correction_template = load_json("data/personal_judge/templates/r30j1c_owner_correction_item_v1.empty.json")
        self.assertIsNone(correction_template["question_text_local"])
        self.assertFalse(correction_template["owner_response_present"])


if __name__ == "__main__":
    unittest.main()
