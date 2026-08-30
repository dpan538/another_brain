from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]

from src.personal_judge.r30j1c_r1_contract import (  # noqa: E402
    ContractError,
    canonical_pack_manifest_sha,
    canonical_review_hash,
    derive_session_state,
    validate_correction_record,
    validate_pack,
    validate_partial_export,
)
from scripts.r30j1c_r1_build_review_ui import (  # noqa: E402
    READY_UI_BUILD_AUTHORIZED,
    browser_projection,
)


def load_json(relative: str):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def load_schema_validator():
    path = ROOT / "tests" / "r30j0" / "test_p2_schema_contract.py"
    spec = importlib.util.spec_from_file_location("r30j1c_r1_schema_validator", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.validate_jsonschema


VALIDATE_SCHEMA = load_schema_validator()
PACK_SCHEMA = load_json("schemas/r30j1c_r1_correction_pack_v1.schema.json")
RECORD_SCHEMA = load_json("schemas/r30j1c_r1_correction_record_v1.schema.json")


def local_ref(label: str) -> str:
    return "local." + hashlib.sha256(label.encode("utf-8")).hexdigest()


def decision_options(kind: str):
    if kind == "AUTHENTIC_REPRESENTATIVENESS":
        values = [
            "YES_REPRESENTATIVE",
            "REAL_BUT_NOT_FOR_EFISH",
            "REGISTER_SPECIFIC",
            "NO_LONGER_REPRESENTATIVE",
            "UNSURE",
        ]
    elif kind == "GENERIC_FALSE_POSITIVE":
        values = [
            "ACTUALLY_FITS",
            "TOO_GENERIC",
            "TOO_SHORT",
            "TOO_CASUAL",
            "TOO_POLISHED",
            "TOO_ASSISTANT_LIKE",
            "TOO_COLD",
            "TOO_STRUCTURED",
            "OTHER",
            "DEPENDS",
        ]
    elif kind == "REGISTER_CLASSIFICATION":
        values = ["CASUAL", "TECHNICAL", "REFLECTIVE", "FORMAL", "PLAYFUL", "MIXED", "DEPENDS"]
    else:
        values = ["PREFER_A", "PREFER_B", "TIE", "NONE", "DEPENDS", "UNSURE", "EDIT"]
    return [{"value": value, "label": f"Fixture {value}"} for value in values]


def source_kind_for(session_id: str, index: int, kind: str) -> str:
    if session_id == "SESSION_1":
        return "J1A_SHORTCUT" if kind == "SHORTCUT_PAIR" else "J1A_DEV_ERROR"
    if session_id == "SESSION_2":
        return "P2_CONTRADICTION" if index % 4 == 0 else "P2_HYPOTHESIS"
    if session_id == "SESSION_3":
        if index < 6:
            return "MANUAL_OWNER_EVIDENCE"
        return "P2_HYPOTHESIS" if index % 2 else "PUBLIC_SAFE_SYNTHETIC"
    return "PUBLIC_SAFE_SYNTHETIC"


def source_family_for(source_kind: str, session_id: str, index: int) -> str:
    if source_kind == "MANUAL_OWNER_EVIDENCE":
        return local_ref("one-manual-conversation-family")
    return local_ref(f"{source_kind}-{session_id}-{index // 3}")


def make_item(session_id: str, index: int, kind: str):
    item_id = f"R30J1C-S{session_id[-1]}-{index + 1:03d}"
    source_kind = source_kind_for(session_id, index, kind)
    candidates = []
    if kind not in {"AUTHENTIC_REPRESENTATIVENESS", "GENERIC_FALSE_POSITIVE", "REGISTER_CLASSIFICATION"}:
        candidates = [
            {
                "option_id": "A",
                "response_text": f"Fixture option A {item_id}",
                "mechanism": "synthetic.direct",
                "canonical_option_ref": local_ref(f"{item_id}-option-a"),
                "factually_compatible": True,
            },
            {
                "option_id": "B",
                "response_text": f"Fixture option B {item_id}",
                "mechanism": "synthetic.reflective",
                "canonical_option_ref": local_ref(f"{item_id}-option-b"),
                "factually_compatible": True,
            },
        ]
    # Indices 13/14 become blind repeats of 0/1 below.  This layout remains
    # balanced after that semantic linkage is applied.
    session2_registers = [
        "CASUAL", "AMBIGUOUS", "CASUAL",
        "TECHNICAL", "TECHNICAL", "TECHNICAL",
        "REFLECTIVE", "REFLECTIVE", "REFLECTIVE",
        "LIGHT_EMOTIONAL", "LIGHT_EMOTIONAL", "PROJECT_DESIGN", "AMBIGUOUS",
        "CASUAL", "AMBIGUOUS",
    ]
    if session_id == "SESSION_2":
        register = session2_registers[index]
    else:
        register = {
            "SESSION_1": "CASUAL",
            "SESSION_3": "PLAYFUL" if index < 10 else "AMBIGUOUS",
            "SESSION_4": "MIXED",
        }[session_id]
    fatigue = None
    if session_id == "SESSION_3" and index < 3:
        fatigue = {
            "question": "Fixture: if this happens three times, is it still natural?",
            "options": [
                {"value": "STILL_NATURAL", "label": "Still natural"},
                {"value": "NATURAL_ONCE_ONLY", "label": "Only once"},
                {"value": "BECOMES_GIMMICKY", "label": "Becomes gimmicky"},
                {"value": "DEPENDS", "label": "Depends"},
                {"value": "UNSURE", "label": "Unsure"},
            ],
        }
    reason_options = []
    reason_required_for = []
    if session_id == "SESSION_4":
        reason_options = [
            {"value": "WRONG_REGISTER", "label": "Wrong register"},
            {"value": "TOO_FORCED", "label": "Too forced"},
            {"value": "TOO_EMPTY", "label": "Too empty"},
            {"value": "TOO_COLD", "label": "Too cold"},
            {"value": "TOO_GIMMICKY", "label": "Too gimmicky"},
            {"value": "TOO_IMPRECISE", "label": "Too imprecise"},
            {"value": "SERIOUSNESS_REQUIRED", "label": "Seriousness required"},
            {"value": "NO_REAL_PROBLEM", "label": "No real problem"},
            {"value": "OTHER", "label": "Other"},
        ]
        reason_required_for = ["PREFER_B"]
    ownership = kind == "AUTHENTIC_REPRESENTATIVENESS"
    session2_tags = [
        "relationship.complete_vs_minimal",
        "relationship.direct_vs_exploratory",
        "relationship.serious_vs_playful",
        "relationship.solution_vs_acknowledgement",
        "relationship.closed_vs_open",
        "relationship.precision_vs_compression",
    ]
    session3_tags = [
        "croc_context.harmless_absurd",
        "croc_context.meta_ai",
        "croc_context.normal_factual",
        "croc_context.technical",
        "croc_context.serious_personal",
        "croc_context.playful_conversation",
        "croc_context.already_serious",
        "croc_context.explicit_roleplay",
        "croc_context.no_roleplay",
        "croc_context.one_off",
        "croc_context.repeated_use",
    ]
    session4_tags = [
        "reverse.too_short",
        "reverse.too_deadpan",
        "reverse.too_crocodile",
        "reverse.too_casual",
        "reverse.too_vague",
        "reverse.too_quirky",
        "reverse.too_anti_helpful",
        "reverse.too_incomplete",
        "reverse.too_provocative",
        "reverse.too_playful",
        "reverse.too_emotionally_detached",
        "reverse.too_self_referential",
    ]
    elicitation_tags = {
        "SESSION_1": [f"session1.{kind.lower()}"],
        "SESSION_2": [session2_tags[index % len(session2_tags)]],
        "SESSION_3": [session3_tags[index % len(session3_tags)]],
        "SESSION_4": [session4_tags[index % len(session4_tags)]],
    }[session_id]
    manual_theme_refs = []
    if source_kind == "MANUAL_OWNER_EVIDENCE":
        theme_indices = ((0, 1), (2, 3), (4, 5), (6,), (7,), (8,))[index]
        manual_theme_refs = [local_ref(f"manual-theme-{theme_index}") for theme_index in theme_indices]
    return {
        "item_id": item_id,
        "session_id": session_id,
        "item_kind": kind,
        "source_kind": source_kind,
        "source_pool_refs": [local_ref(f"pool-{item_id}")],
        "manual_theme_refs": manual_theme_refs,
        "source_family": source_family_for(source_kind, session_id, index),
        "context_family": f"synthetic.{session_id.lower()}.{index:03d}",
        "elicitation_tags": elicitation_tags,
        "register": register,
        "persona_dimension": "synthetic.bounded_delivery",
        "failure_type": "synthetic.high_information_error",
        "context_text": f"Fixture context {item_id}",
        "question_text": f"Fixture question {item_id}",
        "candidates": candidates,
        "decision_options": decision_options(kind),
        "acceptable_alternatives_allowed": session_id == "SESSION_3",
        "fatigue_question": fatigue,
        "reason_options": reason_options,
        "reason_required_for": reason_required_for,
        "boundary_question": session_id in {"SESSION_2", "SESSION_3"},
        "ownership_question": ownership,
        "source_identity_hidden": not ownership,
        "model_metadata_hidden": True,
        "information_gain": {
            "model_confidence": 0.7,
            "model_error_severity": 0.8,
            "shortcut_suspicion": 0.3,
            "persona_uncertainty": 0.7,
            "register_boundary": 0.6,
            "historical_evidence_conflict": 0.4,
            "potential_training_value": 0.9,
        },
        "priority_score": 0.75,
        "blind_repeat": False,
        "repeat_of": None,
        "canonical_decision_ref": local_ref(f"canonical-{item_id}"),
        "surface_variant": 0,
        "crocodile_related": session_id == "SESSION_3" and index < 10,
        "privacy_review_pass": True,
        "contains_third_party_identity": False,
        "fact_preservation_pass": True,
        "normative_label_leakage": False,
        "heldout_used": False,
        "gold_admission": False,
        "allowed_for_training": False,
    }


def make_repeat(target, source):
    target.update({
        "source_kind": source["source_kind"],
        "source_pool_refs": list(source["source_pool_refs"]),
        "manual_theme_refs": list(source["manual_theme_refs"]),
        "source_family": source["source_family"],
        "context_family": source["context_family"],
        "elicitation_tags": list(source["elicitation_tags"]),
        "register": source["register"],
        "persona_dimension": source["persona_dimension"],
        "failure_type": source["failure_type"],
        "question_text": f"Reworded fixture question {target['item_id']}",
        "decision_options": copy.deepcopy(source["decision_options"]),
        "acceptable_alternatives_allowed": source["acceptable_alternatives_allowed"],
        "fatigue_question": copy.deepcopy(source["fatigue_question"]),
        "reason_options": copy.deepcopy(source["reason_options"]),
        "reason_required_for": copy.deepcopy(source["reason_required_for"]),
        "boundary_question": source["boundary_question"],
        "ownership_question": source["ownership_question"],
        "source_identity_hidden": source["source_identity_hidden"],
        "canonical_decision_ref": source["canonical_decision_ref"],
        "blind_repeat": True,
        "repeat_of": source["item_id"],
        "surface_variant": 1,
        "crocodile_related": source["crocodile_related"],
    })
    if source["candidates"]:
        source_candidates = list(reversed(copy.deepcopy(source["candidates"])))
        for option_id, candidate in zip(("A", "B", "C"), source_candidates):
            candidate["option_id"] = option_id
        target["candidates"] = source_candidates
    else:
        target["candidates"] = []


def synthetic_pack():
    session1_kinds = (
        ["AUTHENTIC_REPRESENTATIVENESS"] * 5
        + ["GENERIC_FALSE_POSITIVE"] * 6
        + ["REGISTER_CLASSIFICATION"] * 4
        + ["SHORTCUT_PAIR"] * 4
    )
    specs = {
        "SESSION_1": session1_kinds,
        "SESSION_2": ["REGISTER_BOUNDARY"] * 15,
        "SESSION_3": ["CROCODILE_BOUNDARY"] * 15,
        "SESSION_4": ["REVERSE_CONTROL"] * 13,
    }
    items = []
    by_session = {}
    for session_id, kinds in specs.items():
        rows = [make_item(session_id, index, kind) for index, kind in enumerate(kinds)]
        by_session[session_id] = rows
        items.extend(rows)

    repeat_pairs = [
        ("SESSION_1", 10, 5),
        ("SESSION_1", 18, 15),
        ("SESSION_2", 13, 0),
        ("SESSION_2", 14, 1),
        ("SESSION_3", 14, 6),
        ("SESSION_4", 12, 0),
    ]
    for session_id, target_index, source_index in repeat_pairs:
        make_repeat(by_session[session_id][target_index], by_session[session_id][source_index])

    prompts = []
    registers = [
        "CASUAL", "CASUAL", "CASUAL", "PLAYFUL", "PLAYFUL", "AMBIGUOUS", "AMBIGUOUS",
        "TECHNICAL", "TECHNICAL", "REFLECTIVE", "REFLECTIVE", "LIGHT_EMOTIONAL",
        "PROJECT_DESIGN", "PLAYFUL", "MIXED",
    ]
    elicitation_categories = (
        ["ORDINARY_CHAT"] * 3 + ["WEIRD_ABSURD"] * 2 + ["META_AI"] * 2
        + ["TECHNICAL"] * 2 + ["PHILOSOPHY_REFLECTIVE"] * 2
        + ["LIGHT_EMOTIONAL", "PROJECT_DESIGN", "PLAYFUL", "AMBIGUOUS"]
    )
    for index, (register, category) in enumerate(zip(registers, elicitation_categories)):
        prompt_id = f"R30J1C-S5-W{index + 1:03d}"
        prompts.append({
            "prompt_id": prompt_id,
            "session_id": "SESSION_5",
            "source_kind": "PUBLIC_SAFE_SYNTHETIC",
            "source_pool_refs": [local_ref(f"write-pool-{index}")],
            "source_family": local_ref(f"write-family-{index}"),
            "context_family": f"synthetic.owner_write.{index:03d}",
            "register": register,
            "persona_dimension": "synthetic.unprimed_response",
            "elicitation_category": category,
            "prompt_text": f"Fixture short response prompt {index + 1}",
            "instruction": "一句话就够也可以。",
            "candidate_answers_shown": False,
            "minimum_characters": 0,
            "privacy_review_required": True,
            "privacy_review_pass": True,
            "contains_third_party_identity": False,
            "heldout_used": False,
            "gold_admission": False,
            "allowed_for_training": False,
        })

    sessions = []
    session_meta = {
        "SESSION_1": ("Session 1 · 模型误解", "Fixture model-error correction.", True, 10, 15),
        "SESSION_2": ("Session 2 · 场景与语气边界", "Fixture register boundaries.", True, 10, 15),
        "SESSION_3": ("Session 3 · 鳄鱼边界", "Fixture conditional persona boundaries.", True, 10, 15),
        "SESSION_4": ("Session 4 · 反向控制", "Fixture reverse controls.", True, 8, 12),
        "SESSION_5": ("Session 5 · 如果是 efish，你会怎么回", "Fixture unprimed writing.", False, 15, 25),
    }
    for order, session_id in enumerate(["SESSION_1", "SESSION_2", "SESSION_3", "SESSION_4", "SESSION_5"], start=1):
        title, purpose, required, minutes_min, minutes_max = session_meta[session_id]
        item_ids = [item["item_id"] for item in items if item["session_id"] == session_id]
        prompt_ids = [prompt["prompt_id"] for prompt in prompts if prompt["session_id"] == session_id]
        sessions.append({
            "session_id": session_id,
            "order": order,
            "title": title,
            "purpose": purpose,
            "required": required,
            "decision_item_ids": item_ids,
            "owner_write_prompt_ids": prompt_ids,
            "expected_count": len(item_ids) + len(prompt_ids),
            "estimated_minutes_min": minutes_min,
            "estimated_minutes_max": minutes_max,
            "separately_completable": True,
            "separately_exportable": True,
            "partial_export_filename": f"r30j1c_session{order}_review.json",
            "initial_state": "NOT_STARTED",
        })

    source_counts = {source_kind: sum(item["source_kind"] == source_kind for item in items) for source_kind in (
        "J1A_DEV_ERROR", "J1A_SHORTCUT", "P2_HYPOTHESIS", "P2_CONTRADICTION", "MANUAL_OWNER_EVIDENCE", "PUBLIC_SAFE_SYNTHETIC"
    )}
    blind_count = sum(item["blind_repeat"] for item in items)
    croc_count = sum(item["crocodile_related"] for item in items)
    pack = {
        "schema_version": "r30j1c-r1.owner-correction-pack.v1",
        "campaign_id": "r30j1c_r1_staged_error_driven_owner_correction_v1",
        "pack_id": "r30j1c-r1-0123456789abcdef",
        "manifest_sha": "a" * 64,
        "status": "OWNER_CORRECTION_IN_PROGRESS",
        "local_only": True,
        "must_remain_ignored": True,
        "network_required": False,
        "heldout_used": False,
        "api_requests": 0,
        "owner_review_completed": False,
        "profile_inference_allowed": False,
        "profile_frozen": False,
        "gold_admission": False,
        "allowed_for_training": False,
        "training_state": {
            "training_started": False,
            "optimizer_tokens": 0,
            "classification_updates": 0,
            "assistant_target_tokens": 0,
            "training_authorized": False,
        },
        "audit_status": {
            "pack_receipt_passed": True,
            "source_balance_passed": True,
            "question_quality_passed": True,
            "heldout_integrity_passed": True,
            "privacy_passed": True,
        },
        "review_contract": {
            "session_states": ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "VALIDATED"],
            "each_session_independently_completable": True,
            "each_session_independently_exportable": True,
            "partial_export_allowed": True,
            "local_storage_autosave": True,
            "depends_requires_condition": True,
            "none_owner_rewrite_optional": True,
            "notes_required_only_for": ["BOUNDARY_ITEM", "DEPENDS", "NONE", "EDIT"],
            "partial_export_evidence_class": "OWNER_CORRECTION_EVIDENCE",
            "partial_export_is_training_gold": False,
            "automatic_profile_inference": False,
        },
        "sessions": sessions,
        "decision_items": items,
        "owner_write_prompts": prompts,
        "coverage": {
            "decision_item_count": len(items),
            "owner_write_prompt_count": len(prompts),
            "blind_repeat_count": blind_count,
            "blind_repeat_rate": blind_count / len(items),
            "crocodile_related_count": croc_count,
            "crocodile_related_rate": croc_count / len(items),
            "fatigue_followup_count": sum(item["fatigue_question"] is not None for item in items),
            "manual_correction_theme_count": len({
                reference
                for item in items
                if item["source_kind"] == "MANUAL_OWNER_EVIDENCE"
                for reference in item["manual_theme_refs"]
            }),
        },
        "source_summary": {
            "j1a_dev_error_count": source_counts["J1A_DEV_ERROR"],
            "j1a_shortcut_count": source_counts["J1A_SHORTCUT"],
            "p2_hypothesis_count": source_counts["P2_HYPOTHESIS"],
            "p2_contradiction_count": source_counts["P2_CONTRADICTION"],
            "manual_owner_evidence_count": source_counts["MANUAL_OWNER_EVIDENCE"],
            "public_safe_synthetic_count": source_counts["PUBLIC_SAFE_SYNTHETIC"],
            "distinct_source_family_count": len({value["source_family"] for value in [*items, *prompts]}),
        },
    }
    pack["manifest_sha"] = canonical_pack_manifest_sha(pack)
    return pack


def rehash_pack(pack):
    pack["manifest_sha"] = canonical_pack_manifest_sha(pack)
    return pack


def valid_record(item, decision="PREFER_A"):
    note_required = item["boundary_question"] or decision in {"DEPENDS", "NONE", "EDIT"}
    record = {
        "schema_version": "r30j1c-r1.correction-record.v1",
        "status": "OWNER_CORRECTION_EVIDENCE",
        "item_id": item["item_id"],
        "session_id": item["session_id"],
        "context_family": item["context_family"],
        "owner_decision": decision,
        "owner_condition": "Fixture condition" if decision in {"DEPENDS", "REGISTER_SPECIFIC"} else "",
        "owner_note": "Fixture note" if note_required else "",
        "owner_written_response": "Fixture edit" if decision == "EDIT" else "",
        "acceptable_alternatives": [],
        "fatigue_decision": None,
        "reason_codes": [],
        "normative_strength": "CONDITIONAL_NORMATIVE_EVIDENCE" if decision in {"DEPENDS", "REGISTER_SPECIFIC"} else (
            "UNRESOLVED" if decision == "UNSURE" else "EXPLICIT_NORMATIVE_CHOICE"
        ),
        "register": item["register"],
        "persona_dimension": item["persona_dimension"],
        "source_family": item["source_family"],
        "boundary_question": item["boundary_question"],
        "review_hash": None,
        "completed_at": "2026-08-30T00:00:00.000Z",
        "evidence_class": "OWNER_CORRECTION_EVIDENCE",
        "privacy_review_status": "PENDING",
        "metadata_reconciliation_status": "RECONCILED",
        "profile_inference_allowed": False,
        "gold_admission": False,
        "allowed_for_training": False,
        "training_started": False,
    }
    record["review_hash"] = canonical_review_hash(record)
    return record


def browser_pending_record(item, decision="PREFER_A"):
    record = valid_record(item, decision)
    record.update({
        "context_family": None,
        "register": None,
        "persona_dimension": None,
        "source_family": None,
        "metadata_reconciliation_status": "PENDING_RECONCILIATION",
        "review_hash": None,
    })
    record["review_hash"] = canonical_review_hash(record)
    return record


def browser_owner_write_record(prompt, text="Fixture response"):
    record = {
        "schema_version": "r30j1c-r1.correction-record.v1",
        "status": "OWNER_CORRECTION_EVIDENCE",
        "item_id": prompt["prompt_id"],
        "session_id": "SESSION_5",
        "context_family": None,
        "owner_decision": "OWNER_WRITTEN",
        "owner_condition": "",
        "owner_note": "",
        "owner_written_response": text,
        "acceptable_alternatives": [],
        "fatigue_decision": None,
        "reason_codes": [],
        "normative_strength": "OWNER_WRITTEN_PENDING_PRIVACY_REVIEW",
        "register": None,
        "persona_dimension": None,
        "source_family": None,
        "boundary_question": False,
        "review_hash": None,
        "completed_at": "2026-08-30T00:00:00.000Z",
        "evidence_class": "OWNER_CORRECTION_EVIDENCE",
        "privacy_review_status": "PENDING",
        "metadata_reconciliation_status": "PENDING_RECONCILIATION",
        "profile_inference_allowed": False,
        "gold_admission": False,
        "allowed_for_training": False,
        "training_started": False,
    }
    record["review_hash"] = canonical_review_hash(record)
    return record


def browser_partial_export(pack, session_id, records, session_state=None):
    session = next(row for row in pack["sessions"] if row["session_id"] == session_id)
    total = len(session["owner_write_prompt_ids"] if session_id == "SESSION_5" else session["decision_item_ids"])
    completed = len(records)
    if session_state is None:
        session_state = "NOT_STARTED" if completed == 0 else "COMPLETED" if completed == total else "IN_PROGRESS"
    value = {
        "schema_version": "r30j1c-r1.session-review-export.v1",
        "pack_id": pack["pack_id"],
        "session_id": session_id,
        "manifest_sha": pack["manifest_sha"],
        "session_state": session_state,
        "completed_items": completed,
        "total_items": total,
        "records": records,
        "review_hash": None,
        "completed_at": "2026-08-30T00:00:00.000Z",
        "evidence_class": "OWNER_CORRECTION_EVIDENCE",
        "owner_review_completed": False,
        "profile_inference_allowed": False,
        "profile_frozen": False,
        "gold_admission": False,
        "allowed_for_training": False,
        "training_started": False,
    }
    value["review_hash"] = canonical_review_hash(value)
    return value


def rehash_browser_export(value):
    for record in value["records"]:
        record["review_hash"] = canonical_review_hash(record)
    value["review_hash"] = canonical_review_hash(value)
    return value


class R30J1CR1ContractUITests(unittest.TestCase):
    def test_builder_contract_rejects_unknown_private_payload_fields(self):
        pack = synthetic_pack()
        pack["machine_local_source_path"] = "/synthetic/private/path"
        with self.assertRaisesRegex(ContractError, "pack_fields"):
            validate_pack(pack)
        pack = synthetic_pack()
        pack["decision_items"][0]["raw_source_record"] = {"unexpected": True}
        rehash_pack(pack)
        with self.assertRaisesRegex(ContractError, "decision_item_fields"):
            validate_pack(pack)
        pack = synthetic_pack()
        pack["decision_items"][0]["source_pool_refs"] = ["not-an-opaque-ref"]
        rehash_pack(pack)
        with self.assertRaisesRegex(ContractError, "source_pool_ref_format"):
            validate_pack(pack)

    @classmethod
    def setUpClass(cls):
        cls.pack = synthetic_pack()

    def test_config_fixes_low_burden_zero_training_boundary(self):
        config = load_json("config/r30j1c_r1_owner_correction_pack_v1.json")
        self.assertEqual(config["burden_contract"]["planned_counts"], {
            "SESSION_1": 19,
            "SESSION_2": 15,
            "SESSION_3": 15,
            "SESSION_4": 13,
            "SESSION_5": 15,
        })
        self.assertFalse(config["historical_state_boundary"]["open_r30j1a_heldout"])
        self.assertFalse(config["execution_boundary"]["network_allowed"])
        self.assertFalse(config["training_state"]["training_started"])
        self.assertEqual(config["training_state"]["optimizer_tokens"], 0)

    def test_empty_templates_validate_and_contain_no_owner_values(self):
        pack = load_json("data/personal_judge/templates/r30j1c_r1_correction_pack_v1.empty.json")
        record = load_json("data/personal_judge/templates/r30j1c_r1_correction_record_v1.empty.json")
        VALIDATE_SCHEMA(pack, PACK_SCHEMA)
        VALIDATE_SCHEMA(record, RECORD_SCHEMA)
        validate_pack(pack)
        validate_correction_record(record)
        self.assertEqual(pack["sessions"], [])
        self.assertEqual(pack["decision_items"], [])
        self.assertEqual(pack["owner_write_prompts"], [])

    def test_synthetic_populated_pack_validates_schema_and_contract(self):
        VALIDATE_SCHEMA(self.pack, PACK_SCHEMA)
        validate_pack(self.pack)
        self.assertEqual(len(self.pack["decision_items"]), 62)
        self.assertEqual(len(self.pack["owner_write_prompts"]), 15)
        self.assertEqual(self.pack["coverage"]["blind_repeat_count"], 6)

    def test_pack_manifest_rejects_stimulus_mutation(self):
        value = copy.deepcopy(self.pack)
        value["decision_items"][0]["question_text"] += " mutated"
        with self.assertRaisesRegex(ContractError, "manifest_sha_mismatch"):
            validate_pack(value)

    def test_all_browser_display_surfaces_reject_provenance_markers(self):
        mutations = []

        item_value = copy.deepcopy(self.pack)
        hidden_item = next(
            item for item in item_value["decision_items"] if item["source_identity_hidden"]
        )
        hidden_item["context_text"] = "synthetic_text source disclosure"
        mutations.append((item_value, "display_authenticity_leak"))

        ownership_value = copy.deepcopy(self.pack)
        ownership_item = next(
            item for item in ownership_value["decision_items"] if item["ownership_question"]
        )
        ownership_item["question_text"] = "source_file.jsonl model_probability"
        mutations.append((ownership_value, "display_provenance_leak"))

        session_value = copy.deepcopy(self.pack)
        session_value["sessions"][1]["purpose"] = "DEV split source_file.jsonl"
        mutations.append((session_value, "display_provenance_leak"))

        prompt_value = copy.deepcopy(self.pack)
        prompt_value["owner_write_prompts"][0]["prompt_text"] = "合成文本来源"
        mutations.append((prompt_value, "display_authenticity_leak"))

        for value, code in mutations:
            rehash_pack(value)
            with self.subTest(code=code), self.assertRaisesRegex(ContractError, code):
                validate_pack(value)

    def test_owner_write_minimum_characters_rejects_boolean_zero(self):
        value = copy.deepcopy(self.pack)
        value["owner_write_prompts"][0]["minimum_characters"] = False
        rehash_pack(value)
        with self.assertRaisesRegex(ContractError, "write_minimum_length"):
            validate_pack(value)

    def test_pack_rejects_budget_over_64(self):
        value = copy.deepcopy(self.pack)
        extra = copy.deepcopy(value["decision_items"][0])
        extra["item_id"] = "R30J1C-S1-020"
        extra["canonical_decision_ref"] = local_ref("extra-20")
        extra["context_family"] = "synthetic.extra.020"
        extra["question_text"] = "Fixture extra question 20"
        value["decision_items"].extend([extra, copy.deepcopy(extra), copy.deepcopy(extra)])
        rehash_pack(value)
        with self.assertRaises(ContractError):
            validate_pack(value)

    def test_pack_rejects_session_or_heldout_change(self):
        value = copy.deepcopy(self.pack)
        value["sessions"].pop()
        rehash_pack(value)
        with self.assertRaisesRegex(ContractError, "session_count"):
            validate_pack(value)
        value = copy.deepcopy(self.pack)
        value["decision_items"][0]["heldout_used"] = True
        rehash_pack(value)
        with self.assertRaisesRegex(ContractError, "decision_heldout"):
            validate_pack(value)

    def test_crocodile_frequency_and_blind_repeat_are_bounded(self):
        self.assertGreaterEqual(self.pack["coverage"]["crocodile_related_rate"], 0.15)
        self.assertLessEqual(self.pack["coverage"]["crocodile_related_rate"], 0.20)
        repeats = [item for item in self.pack["decision_items"] if item["blind_repeat"]]
        self.assertEqual(len(repeats), 6)
        self.assertTrue(all(item["repeat_of"] for item in repeats))
        value = copy.deepcopy(self.pack)
        first_repeat = next(item for item in value["decision_items"] if item["blind_repeat"])
        first_repeat["question_text"] = next(item for item in value["decision_items"] if item["item_id"] == first_repeat["repeat_of"])["question_text"]
        rehash_pack(value)
        with self.assertRaisesRegex(ContractError, "repeat_exact_text"):
            validate_pack(value)

    def test_normal_record_needs_no_note(self):
        item = next(item for item in self.pack["decision_items"] if item["item_kind"] == "SHORTCUT_PAIR" and not item["blind_repeat"])
        record = browser_pending_record(item)
        VALIDATE_SCHEMA(record, RECORD_SCHEMA)
        validate_correction_record(record, item)
        self.assertEqual(record["owner_note"], "")

    def test_depends_requires_condition_and_note(self):
        item = next(item for item in self.pack["decision_items"] if item["item_kind"] == "SHORTCUT_PAIR" and not item["blind_repeat"])
        record = valid_record(item, "DEPENDS")
        validate_correction_record(record, item)
        record["owner_condition"] = ""
        with self.assertRaisesRegex(ContractError, "record_condition_required"):
            validate_correction_record(record, item)
        record["owner_condition"] = "Fixture condition"
        record["owner_note"] = ""
        with self.assertRaisesRegex(ContractError, "record_note_required"):
            validate_correction_record(record, item)

    def test_none_rewrite_is_optional_but_note_is_required(self):
        item = next(item for item in self.pack["decision_items"] if item["item_kind"] == "SHORTCUT_PAIR" and not item["blind_repeat"])
        record = valid_record(item, "NONE")
        self.assertEqual(record["owner_written_response"], "")
        validate_correction_record(record, item)
        record["owner_note"] = ""
        with self.assertRaisesRegex(ContractError, "record_note_required"):
            validate_correction_record(record, item)

    def test_edit_and_boundary_note_rules_are_fail_closed(self):
        normal = next(item for item in self.pack["decision_items"] if item["item_kind"] == "SHORTCUT_PAIR" and not item["blind_repeat"])
        edited = valid_record(normal, "EDIT")
        validate_correction_record(edited, normal)
        edited["owner_written_response"] = ""
        with self.assertRaisesRegex(ContractError, "record_edit_required"):
            validate_correction_record(edited, normal)
        boundary = next(item for item in self.pack["decision_items"] if item["session_id"] == "SESSION_2" and not item["blind_repeat"])
        record = valid_record(boundary)
        record["owner_note"] = ""
        with self.assertRaisesRegex(ContractError, "record_note_required"):
            validate_correction_record(record, boundary)

    def test_register_specific_requires_condition(self):
        item = next(item for item in self.pack["decision_items"] if item["item_kind"] == "AUTHENTIC_REPRESENTATIVENESS")
        record = valid_record(item, "REGISTER_SPECIFIC")
        validate_correction_record(record, item)
        record["owner_condition"] = ""
        with self.assertRaisesRegex(ContractError, "record_register_condition_required"):
            validate_correction_record(record, item)

    def test_partial_export_is_session_scoped_not_gold(self):
        item = next(item for item in self.pack["decision_items"] if item["item_kind"] == "SHORTCUT_PAIR" and not item["blind_repeat"])
        record = browser_pending_record(item)
        value = {
            "schema_version": "r30j1c-r1.session-review-export.v1",
            "pack_id": self.pack["pack_id"],
            "session_id": item["session_id"],
            "manifest_sha": self.pack["manifest_sha"],
            "session_state": "IN_PROGRESS",
            "completed_items": 1,
            "total_items": 19,
            "records": [record],
            "review_hash": None,
            "completed_at": "2026-08-30T00:00:00.000Z",
            "evidence_class": "OWNER_CORRECTION_EVIDENCE",
            "owner_review_completed": False,
            "profile_inference_allowed": False,
            "profile_frozen": False,
            "gold_admission": False,
            "allowed_for_training": False,
            "training_started": False,
        }
        value["review_hash"] = canonical_review_hash(value)
        validate_partial_export(value, self.pack)
        wrong_total = copy.deepcopy(value)
        wrong_total["total_items"] = 1
        wrong_total["session_state"] = "VALIDATED"
        with self.assertRaisesRegex(ContractError, "export_total_count"):
            validate_partial_export(wrong_total, self.pack)
        duplicate = copy.deepcopy(value)
        duplicate["records"] = [copy.deepcopy(record), copy.deepcopy(record)]
        duplicate["completed_items"] = 2
        with self.assertRaisesRegex(ContractError, "duplicate"):
            validate_partial_export(duplicate, self.pack)
        value["gold_admission"] = True
        with self.assertRaisesRegex(ContractError, "export_gold"):
            validate_partial_export(value, self.pack)

    def test_session_state_is_explicit(self):
        self.assertEqual(derive_session_state(0, 19), "NOT_STARTED")
        self.assertEqual(derive_session_state(4, 19), "IN_PROGRESS")
        self.assertEqual(derive_session_state(19, 19), "COMPLETED")
        self.assertEqual(derive_session_state(19, 19, validated=True), "VALIDATED")
        with self.assertRaisesRegex(ContractError, "validated_incomplete"):
            derive_session_state(18, 19, validated=True)

    def test_browser_import_is_fail_closed_for_structure_progress_and_record_contract(self):
        item = next(
            row for row in self.pack["decision_items"]
            if row["item_kind"] == "SHORTCUT_PAIR" and not row["blind_repeat"]
        )
        valid = browser_partial_export(
            self.pack,
            item["session_id"],
            [browser_pending_record(item)],
        )
        cases = [{"name": "valid", "value": valid, "accepted": True}]

        def rejected(name, mutate):
            value = copy.deepcopy(valid)
            mutate(value)
            rehash_browser_export(value)
            cases.append({"name": name, "value": value, "accepted": False})

        rejected("extra_outer_field", lambda value: value.update({"unexpected": True}))
        rejected("extra_record_field", lambda value: value["records"][0].update({"unexpected": True}))
        rejected("completed_count_mismatch", lambda value: value.update({"completed_items": 2}))
        rejected("total_count_mismatch", lambda value: value.update({"total_items": 1}))
        rejected("session_state_mismatch", lambda value: value.update({"session_state": "VALIDATED"}))

        duplicate = copy.deepcopy(valid)
        duplicate["records"].append(copy.deepcopy(duplicate["records"][0]))
        duplicate["completed_items"] = 2
        rehash_browser_export(duplicate)
        cases.append({"name": "duplicate_item_id", "value": duplicate, "accepted": False})

        rejected(
            "privacy_not_pending",
            lambda value: value["records"][0].update({"privacy_review_status": "NOT_APPLICABLE"}),
        )
        rejected(
            "reconciliation_not_pending",
            lambda value: value["records"][0].update({"metadata_reconciliation_status": "RECONCILED"}),
        )
        rejected(
            "pending_metadata_not_null",
            lambda value: value["records"][0].update({"context_family": "synthetic.injected"}),
        )
        rejected(
            "decision_from_wrong_domain",
            lambda value: value["records"][0].update({"owner_decision": "STILL_NATURAL"}),
        )
        rejected(
            "unexpected_fatigue_value",
            lambda value: value["records"][0].update({"fatigue_decision": "STILL_NATURAL"}),
        )
        rejected(
            "reason_not_offered",
            lambda value: value["records"][0].update({"reason_codes": ["WRONG_REGISTER"]}),
        )
        rejected(
            "alternative_not_offered",
            lambda value: value["records"][0].update({"acceptable_alternatives": ["Z"]}),
        )
        rejected(
            "text_over_limit",
            lambda value: value["records"][0].update({"owner_note": "x" * 10001}),
        )

        def blank_depends(value):
            value["records"][0].update({
                "owner_decision": "DEPENDS",
                "owner_condition": "",
                "owner_note": "",
                "normative_strength": "CONDITIONAL_NORMATIVE_EVIDENCE",
            })

        rejected("depends_without_condition_or_note", blank_depends)

        write_record = browser_owner_write_record(self.pack["owner_write_prompts"][0], text="")
        blank_write = browser_partial_export(self.pack, "SESSION_5", [write_record])
        cases.append({"name": "blank_owner_write", "value": blank_write, "accepted": False})

        replacement_item = next(
            row for row in self.pack["decision_items"]
            if row["item_kind"] == "SHORTCUT_PAIR"
            and not row["blind_repeat"]
            and row["item_id"] != item["item_id"]
        )
        replacement = browser_partial_export(
            self.pack,
            item["session_id"],
            [browser_pending_record(replacement_item)],
        )

        projection = browser_projection(self.pack)
        review_script = ROOT / "data" / "personal_judge" / "templates" / "r30j1c_r1_review_ui" / "review.js"
        with tempfile.TemporaryDirectory(prefix="r30j1c-r1-import-") as temporary:
            harness = Path(temporary) / "import_harness.cjs"
            harness.write_text(
                "\n".join([
                    '"use strict";',
                    'const fs = require("node:fs");',
                    'const vm = require("node:vm");',
                    "globalThis.window = globalThis;",
                    f"window.R30J1C_R1_CORRECTION_PACK = {json.dumps(projection, ensure_ascii=True, separators=(',', ':'))};",
                    "const elements = new Map();",
                    "function element(id) {",
                    "  if (!elements.has(id)) elements.set(id, {",
                    "    id, dataset: {}, classList: { toggle() {} }, textContent: '', innerHTML: '',",
                    "    hidden: false, disabled: false, value: '', files: [],",
                    "    appendChild() {}, remove() {}, click() {},",
                    "  });",
                    "  return elements.get(id);",
                    "}",
                    "globalThis.document = {",
                    "  getElementById: element,",
                    "  querySelectorAll() { return []; },",
                    "  createElement: element,",
                    "  body: { appendChild() {} },",
                    "};",
                    "globalThis.localStorage = { getItem() { return null; }, setItem() {} };",
                    "window.confirm = () => true;",
                    f"let source = fs.readFileSync({json.dumps(str(review_script))}, 'utf8');",
                    "const marker = '\\n  render();\\n}());';",
                    "if (!source.includes(marker)) throw new Error('test_hook_marker_missing');",
                    "source = source.replace(marker, '\\n  globalThis.__r30Import = importSessionExport; globalThis.__r30State = () => state;\\n}());');",
                    "vm.runInThisContext(source, { filename: 'review.js' });",
                    f"const cases = {json.dumps(cases, ensure_ascii=True, separators=(',', ':'))};",
                    f"const replacement = {json.dumps(replacement, ensure_ascii=True, separators=(',', ':'))};",
                    "(async () => {",
                    "  const results = [];",
                    "  for (const testCase of cases) {",
                    "    try {",
                    "      await globalThis.__r30Import(testCase.value);",
                    "      results.push({ name: testCase.name, accepted: true });",
                    "    } catch (error) {",
                    "      results.push({ name: testCase.name, accepted: false, error: String(error.message) });",
                    "    }",
                    "  }",
                    "  const beforeCancellation = JSON.stringify(globalThis.__r30State());",
                    "  let confirmationCount = 0;",
                    "  window.confirm = () => { confirmationCount += 1; return false; };",
                    "  const cancellationResult = await globalThis.__r30Import(replacement);",
                    "  const afterCancellation = JSON.stringify(globalThis.__r30State());",
                    "  results.push({",
                    "    name: 'cancel_existing_import_preserves_state',",
                    "    accepted: cancellationResult === false",
                    "      && confirmationCount === 1",
                    "      && beforeCancellation === afterCancellation,",
                    "  });",
                    "  process.stdout.write(JSON.stringify(results));",
                    "})().catch((error) => { console.error(error); process.exit(1); });",
                ]) + "\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                ["node", str(harness)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
        observed = {row["name"]: row["accepted"] for row in json.loads(result.stdout)}
        expected = {row["name"]: row["accepted"] for row in cases}
        expected["cancel_existing_import_preserves_state"] = True
        self.assertEqual(observed, expected)

    def test_builder_blocks_ready_ui_until_immutable_anchors_exist(self):
        self.assertFalse(READY_UI_BUILD_AUTHORIZED)
        private_root = ROOT / "artifacts" / "r30j1c" / "owner_correction_pack"
        private_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="r30j1c-r1-ui-", dir=private_root) as temporary:
            root = Path(temporary)
            pack_path = root / "pack.json"
            output = root / "ui"
            output.mkdir()
            for stale_name in ("review_seed.js", "ui_build_receipt.json"):
                (output / stale_name).write_text("stale READY artifact\n", encoding="utf-8")
            pack_path.write_text(json.dumps(self.pack, ensure_ascii=False) + "\n", encoding="utf-8")
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "r30j1c_r1_build_review_ui.py"),
                    "--input",
                    str(pack_path),
                    "--output-dir",
                    str(output),
                ],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("provenance_anchor_unavailable", result.stderr)
            self.assertEqual(list(output.iterdir()), [])

            # The browser projection and zero-network template remain tested
            # as methods, but current unavailable anchors cannot produce a
            # READY owner-review artifact from a fabricated structural pack.
            ui_root = ROOT / "data" / "personal_judge" / "templates" / "r30j1c_r1_review_ui"
            index = (ui_root / "index.html").read_text(encoding="utf-8")
            script = (ui_root / "review.js").read_text(encoding="utf-8")
            self.assertIn("connect-src 'none'", index)
            self.assertIn("localStorage", script)
            self.assertIn("exportSession", script)
            for marker in ("fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon"):
                self.assertNotIn(marker, f"{index}\n{script}")
            subprocess.run(["node", "--check", str(ui_root / "review.js")], check=True, capture_output=True, text=True)
            projection = browser_projection(self.pack)
            self.assertEqual(projection["schema_version"], "r30j1c-r1.browser-review-pack.v1")
            forbidden = {
                "source_kind", "source_pool_refs", "manual_theme_refs",
                "information_gain", "priority_score", "blind_repeat",
                "repeat_of", "canonical_decision_ref", "source_identity_hidden",
                "model_metadata_hidden", "ownership_question", "item_kind",
                "failure_type", "source_family", "context_family", "register",
                "persona_dimension", "elicitation_tags", "surface_variant",
            }
            def keys(value):
                if isinstance(value, dict):
                    return set(value).union(*(keys(child) for child in value.values()))
                if isinstance(value, list):
                    return set().union(*(keys(child) for child in value)) if value else set()
                return set()
            self.assertFalse(keys(projection) & forbidden)
            self.assertNotIn("复测项", script)

    def test_builder_rejects_pack_or_output_outside_ignored_root(self):
        with tempfile.TemporaryDirectory(prefix="r30j1c-r1-external-") as temporary:
            root = Path(temporary)
            pack_path = root / "pack.json"
            pack_path.write_text(json.dumps(self.pack), encoding="utf-8")
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "r30j1c_r1_build_review_ui.py"),
                    "--input", str(pack_path),
                    "--output-dir", str(root / "ui"),
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("local_private_boundary", result.stderr)

    def test_ui_templates_are_empty_public_safe_assets(self):
        ui_root = ROOT / "data" / "personal_judge" / "templates" / "r30j1c_r1_review_ui"
        index = (ui_root / "index.html").read_text(encoding="utf-8")
        script = (ui_root / "review.js").read_text(encoding="utf-8")
        self.assertNotIn("R30J1C_R1_CORRECTION_PACK =", script)
        self.assertIn("review_seed.js", index)
        self.assertIn("connect-src 'none'", index)
        self.assertIn("SESSION_1", script)
        self.assertIn("SESSION_5", script)
        self.assertIn("r30j1c-r1.session-review-export.v1", script)
        self.assertIn("OWNER_CORRECTION_EVIDENCE", script)
        self.assertIn("gold_admission: false", script)
        self.assertIn("window.confirm", script)
        self.assertIn("请先导出 JSON 备份", script)
        self.assertIn("导入会替换当前 session 已填写的答案", script)
        self.assertIn("请先导出当前 session 的 JSON 备份", script)
        self.assertIn("if (!confirmed) return", script)
        self.assertNotIn("profile_frozen: true", script)


if __name__ == "__main__":
    unittest.main()
