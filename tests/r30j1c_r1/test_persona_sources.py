from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]

from src.personal_judge.r30j1c_r1_persona_sources import (  # noqa: E402
    PersonaSourceIntegrityError,
    aggregate_counts,
    information_signals,
    opaque_ref,
    validate_pool_document,
    validate_source_row,
)


def load_runner():
    path = ROOT / "scripts" / "r30j1c_r1_prepare_persona_sources.py"
    spec = importlib.util.spec_from_file_location("r30j1c_r1_persona_source_runner", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RUNNER = load_runner()
FAMILY = "local." + "a" * 24
MESSAGE = "local." + "b" * 24
PEER_EVIDENCE = "local." + "c" * 24
HYPOTHESIS_BASE = "local." + "d" * 16


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows), encoding="utf-8")


def manual_source_envelope():
    value = json.loads(
        (ROOT / "data/personal_judge/templates/r30j1c_manual_owner_evidence_source_v1.empty.json").read_text(encoding="utf-8")
    )
    value["status"] = "OWNER_CORRECTION_PENDING"
    value["contains_owner_specific_values"] = True
    value["source_family"] = {
        "source_family_ref": FAMILY,
        "document_group_ref": FAMILY,
        "idea_group_ref": FAMILY,
        "family_group_ref": FAMILY,
    }
    value["evidence_class_counts"] = {
        "current_explicit_owner_assertion": 1,
        "owner_chat_direct": 1,
        "peer_reception": 1,
        "peer_playful_mythology": 0,
    }
    value["privacy_receipt"]["deidentification_complete"] = True
    value["privacy_receipt"]["quote_blocks_separated"] = True
    value["privacy_receipt"]["third_party_identifiers_removed"] = True
    value["authorship_receipt"]["owner_attestation_present"] = True
    value["authorship_receipt"]["direct_body_attribution_pass"] = True
    value["correction_pack_receipt"]["correction_item_count"] = 9
    return value


def manual_message():
    return {
        "message_id": MESSAGE,
        "sequence_index": 1,
        "turn_cluster_ref": opaque_ref("cluster"),
        "source_family_ref": FAMILY,
        "speaker": "OWNER",
        "speaker_role": "OWNER",
        "body": "合成 owner 文本。",
        "quoted_speaker": "PEER_001",
        "quoted_body": "合成引用。",
        "quoted_body_owner_style_admissible": False,
        "body_provenance": "DIRECT_MESSAGE_BODY",
        "message_kind": "TEXT",
        "privacy_status": "PASS",
        "raw_username_present": False,
        "avatar_present": False,
        "exact_timestamp_present": False,
        "evidence_class": "OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE",
        "owner_style_admissible": True,
        "peer_reception_analysis_eligible": False,
        "normative_evidence": False,
        "owner_identity_truth": False,
        "owner_review_required": True,
        "allowed_for_training": False,
    }


def manual_peer_evidence():
    return {
        "evidence_id": PEER_EVIDENCE,
        "source_family_ref": FAMILY,
        "source_message_ref": MESSAGE,
        "anonymous_speaker_ref": "PEER_001",
        "evidence_class": "PEER_RECEPTION_EVIDENCE",
        "claim_code": "synthetic_reception",
        "convergence_cluster_ref": opaque_ref("convergence"),
        "independent_speaker_count": 2,
        "descriptive_confidence": 0.8,
        "normative_confidence": 0.0,
        "owner_authored": False,
        "owner_identity_truth": False,
        "owner_preference_gold": False,
        "hypothesis_context_allowed": True,
        "anti_caricature_context_allowed": False,
        "raw_excerpt_present": False,
        "owner_review_required": True,
        "allowed_for_training": False,
    }


def manual_hypothesis(index: int):
    return {
        "hypothesis_id": opaque_ref("manual-hypothesis", str(index)),
        "source_family_ref": FAMILY,
        "latent_family_ref": opaque_ref("latent"),
        "behaviour_code": f"synthetic_behaviour_{index}",
        "claim_status": "DESCRIPTIVE_HYPOTHESIS_ONLY",
        "evidence_basis": "MIXED_DESCRIPTIVE",
        "evidence_refs": [PEER_EVIDENCE],
        "authorship_confidence": 1.0,
        "descriptive_confidence": 0.7,
        "normative_confidence": 0.0,
        "generalization_scope": "single_conversation_observation",
        "topic_slice_ref": opaque_ref("topic"),
        "positive_boundary": ["Synthetic low-stakes context."],
        "negative_boundary": ["Synthetic serious boundary."],
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


def manual_correction(index: int):
    return {
        "version": "r30j1c.owner-correction-item.v1",
        "status": "OWNER_REVIEW_REQUIRED",
        "local_only": True,
        "must_remain_ignored": True,
        "correction_id": "local.correction." + hashlib_hex(index),
        "source_family_ref": FAMILY,
        "split_family_ref": FAMILY,
        "target_hypothesis_refs": [opaque_ref("manual-hypothesis", str(index))],
        "evidence_refs": [PEER_EVIDENCE],
        "information_goal": f"synthetic_boundary_{index}",
        "question_family": f"synthetic_condition_{index}",
        "register_context": "ordinary_chat",
        "topic_slice_ref": opaque_ref("topic"),
        "question_text_local": f"合成条件问题 {index}？",
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


def hashlib_hex(index: int) -> str:
    return f"{index + 1:016x}"


def write_manual_root(root: Path) -> None:
    hypotheses = [manual_hypothesis(index) for index in range(9)]
    corrections = [manual_correction(index) for index in range(9)]
    write_json(root / "source_envelope.json", manual_source_envelope())
    write_jsonl(root / "deidentified_messages.jsonl", [manual_message()])
    write_jsonl(root / "peer_evidence_ledger.jsonl", [manual_peer_evidence()])
    write_jsonl(root / "hypothesis_candidates.jsonl", hypotheses)
    write_jsonl(root / "correction_items.jsonl", corrections)
    write_json(
        root / "privacy_and_split_receipt.json",
        {
            "source_family_count": 1,
            "quoted_blocks_separated": True,
            "third_party_usernames_excluded_from_derived_text": True,
            "all_owner_messages_same_family": True,
            "all_peer_annotations_same_family": True,
            "future_corrections_must_share_family": True,
            "allowed_for_training": False,
        },
    )
    write_json(
        root / "reports/intake_summary.json",
        {
            "candidate_hypothesis_count": 9,
            "correction_question_count": 9,
            "source_family_count": 1,
            "owner_review_completed": False,
            "gold_admitted": False,
            "allowed_for_training": False,
            "all_peer_evidence_normative_weight_zero": True,
        },
    )


def p2_microtrait(index: int):
    return {
        "microtrait_id": f"synthetic_microtrait_{index:03d}",
        "behaviour_code": f"synthetic_behaviour_{index:03d}",
        "dimension_family": f"family_{index % 12:02d}",
        "observable_behaviour": "Synthetic observable behaviour.",
        "trigger_positive": ["Synthetic positive trigger."],
        "trigger_negative": ["Synthetic negative boundary."],
        "compatible_registers": ["ordinary_chat"],
        "forbidden_registers": ["formal_message"],
        "epistemic_category": None,
        "evidence_refs": [f"synthetic.evidence.{index:03d}"],
        "confidence": 0.8 - index / 1000,
        "owner_review_status": "UNREVIEWED",
        "owner_review_required": True,
        "allowed_for_training": False,
        "contains_raw_excerpt": False,
    }


def p2_mode(index: int):
    return {
        "mode_id": f"synthetic_mode_{index:03d}",
        "mode_code": f"synthetic_mode_code_{index:03d}",
        "mode_description": "Synthetic bounded mode.",
        "seed_status": "OWNER_ASSERTED_SEED" if index == 0 else "HYPOTHESIS_REQUIRES_OWNER_REVIEW",
        "boundary_status": "BOUNDARY_NOT_YET_KNOWN" if index == 0 else "BOUNDARY_PARTIALLY_KNOWN",
        "trigger_positive": [{"dimension": "context", "condition": "Synthetic positive."}],
        "trigger_negative": [{"dimension": "stakes", "condition": "Synthetic negative."}],
        "compatible_registers": ["weird_question" if index == 0 else "ordinary_chat"],
        "forbidden_registers": ["technical_explanation"],
        "epistemic_category": "PLAYFUL_FAUX_IGNORANCE" if index == 0 else None,
        "fallback_mode": "normal_direct",
        "evidence_refs": [f"synthetic.mode.evidence.{index:03d}"],
        "contradiction_count": index % 2,
        "owner_review_status": "UNREVIEWED",
        "owner_review_required": True,
        "allowed_for_training": False,
    }


def p2_antipattern(index: int):
    return {
        "anti_pattern_id": f"synthetic_antipattern_{index:03d}",
        "candidate_anti_behaviour": "Synthetic excessive behaviour.",
        "behaviour_class": f"TEXT_STYLE_{index % 3}",
        "trigger_contexts": ["Synthetic trigger."],
        "compatible_registers": ["ordinary_chat"],
        "forbidden_registers": ["technical_explanation"],
        "failure_transition": "Synthetic useful behaviour becomes excessive.",
        "evidence_refs": [f"synthetic.anti.evidence.{index:03d}"],
        "contradiction_count": index % 2,
        "confidence": 0.7,
        "owner_review_status": "UNREVIEWED",
        "owner_review_required": True,
        "allowed_for_training": False,
        "contains_raw_excerpt": False,
    }


def p2_contradiction(index: int):
    return {
        "contradiction_id": f"synthetic_contradiction_{index:03d}",
        "trait": f"synthetic_trait_{index:03d}",
        "evidence_A": {"evidence_refs": [f"synthetic.a.{index:03d}"]},
        "evidence_B": {"evidence_refs": [f"synthetic.b.{index:03d}"]},
        "possible_register_explanation": "Synthetic register explanation.",
        "possible_context_explanation": "Synthetic context explanation.",
        "time_drift_possible": True,
        "owner_question": "Which synthetic condition applies?",
        "owner_review_status": "UNREVIEWED",
        "owner_review_required": True,
        "allowed_for_training": False,
    }


def write_p2_root(root: Path) -> None:
    microtraits = [p2_microtrait(index) for index in range(40)]
    modes = [p2_mode(index) for index in range(4)]
    antipatterns = [p2_antipattern(index) for index in range(8)]
    contradictions = [p2_contradiction(index) for index in range(7)]
    write_json(root / "reports/final_terminal.json", {"phase_terminal_state": "R30J0_P2_PERSONA_EXCAVATION_READY"})
    write_json(
        root / "reports/persona_excavation_summary.json",
        {
            "microtrait_hypothesis_count": len(microtraits),
            "persona_mode_hypothesis_count": len(modes),
            "antipattern_count": len(antipatterns),
            "contradiction_count": len(contradictions),
            "unresolved_question_count": 6,
            "training_started": False,
            "owner_review_completed": False,
            "profile_frozen": False,
            "descriptive_promoted_to_normative_count": 0,
        },
    )
    write_json(root / "persona_microtraits.json", {"entries": microtraits})
    write_json(root / "persona_mode_hypotheses.json", {"modes": modes})
    write_json(root / "persona_antipatterns.json", {"entries": antipatterns})
    write_json(root / "persona_contradiction_ledger.json", {"entries": contradictions})

    linkage_entries = []
    for kind, items, key in (
        ("microtrait", microtraits, "microtrait_id"),
        ("mode", modes, "mode_id"),
        ("antipattern", antipatterns, "anti_pattern_id"),
        ("contradiction", contradictions, "contradiction_id"),
    ):
        for item in items:
            linkage_entries.append(
                {
                    "target_type": kind,
                    "target_id": item[key],
                    "review_item_refs": [f"synthetic.review.{kind}.{item[key]}"],
                    "owner_review_required": True,
                    "allowed_for_training": False,
                }
            )
    write_json(
        root / "persona_elicitation_linkage.json",
        {
            "status": "OWNER_REVIEW_LINKAGE_READY",
            "unresolved_target_refs": [],
            "uncovered_high_value_target_counts": {
                "microtrait": 0,
                "mode": 0,
                "antipattern": 0,
                "contradiction": 0,
                "grammar": 0,
            },
            "entries": linkage_entries,
        },
    )
    decision_items = [
        {
            "item_id": f"synthetic_open_{index:03d}",
            "blind_repeat": False,
            "owner_review_required": True,
            "allowed_for_training": False,
            "task_type": "open_ended",
            "section": "high_information",
            "register": "ordinary_chat",
            "information_gain_rank": index + 1,
            "target_refs": [{"target_type": "microtrait", "target_id": microtraits[index]["microtrait_id"]}],
            "underlying_decision_family": f"synthetic_decision_{index:03d}",
            "discriminates": ["synthetic_boundary"],
            "prompt": "Synthetic public-safe prompt.",
            "candidates": [],
        }
        for index in range(6)
    ]
    write_json(root / "elicitation_pack_v2.json", {"decision_items": decision_items})


class PersonaSourceContractTests(unittest.TestCase):
    def test_ready_persona_adapter_is_retired_in_this_blocked_revision(self):
        self.assertFalse(RUNNER.READY_PERSONA_SOURCE_ADAPTER_AUTHORIZED)

    def test_source_row_is_opaque_unresolved_and_no_training(self):
        signals = information_signals(
            persona_uncertainty=0.9,
            register_boundary=0.8,
            historical_evidence_conflict=0.1,
            potential_training_value=0.9,
        )
        row = RUNNER._base_row(
            source_kind="P2_MICROTRAIT",
            source_bundle_ref=opaque_ref("bundle"),
            source_identifier="synthetic_target",
            source_family_refs=[opaque_ref("family")],
            eligible_sessions=["SESSION_2"],
            register_codes=["ordinary_chat"],
            dimension_codes=["synthetic_dimension"],
            review_refs=[opaque_ref("review")],
            signals=signals,
            local_review_payload={"synthetic": True},
            contains_private_text=False,
        )
        validate_source_row(row)
        self.assertFalse(row["gold_admission"])
        self.assertFalse(row["allowed_for_training"])
        self.assertFalse(row["heldout_eligible"])

    def test_heldout_reference_is_rejected_before_source_read(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            with self.assertRaisesRegex(PersonaSourceIntegrityError, "heldout"):
                RUNNER._assert_source_roots(base / "sealed-heldout", base / "manual")

    def test_missing_populated_vaults_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            p2 = base / "p2"
            manual = base / "manual"
            p2.mkdir()
            manual.mkdir()
            with self.assertRaisesRegex(PersonaSourceIntegrityError, "required_p2_source_missing"):
                RUNNER.prepare_persona_sources(
                    p2,
                    manual,
                    base / "output",
                    trusted_p2_manifest_sha256="a" * 64,
                    trusted_manual_manifest_sha256="b" * 64,
                )
            self.assertFalse((base / "output/source_rows.jsonl").exists())
            receipt = RUNNER.blocked_receipt(p2, manual)
            self.assertEqual(receipt["status"], "BLOCKED_SOURCE_INTEGRITY")
            self.assertEqual(receipt["p2_populated_file_count"], 0)
            self.assertEqual(receipt["manual_populated_file_count"], 0)
            self.assertTrue(receipt["required_input_gap"])

    def test_synthetic_sources_build_bounded_pool_and_preserve_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            p2 = base / "p2"
            manual = base / "manual"
            output = base / "output"
            write_p2_root(p2)
            write_manual_root(manual)
            before = {
                path.relative_to(base).as_posix(): path.read_bytes()
                for path in [*p2.rglob("*"), *manual.rglob("*")] if path.is_file()
            }
            receipt = RUNNER.prepare_persona_sources(
                p2,
                manual,
                output,
                trusted_p2_manifest_sha256=RUNNER.source_manifest_sha(p2, RUNNER.P2_REQUIRED_FILES),
                trusted_manual_manifest_sha256=RUNNER.source_manifest_sha(manual, RUNNER.MANUAL_REQUIRED_FILES),
            )
            after = {
                path.relative_to(base).as_posix(): path.read_bytes()
                for path in [*p2.rglob("*"), *manual.rglob("*")] if path.is_file()
            }
            self.assertEqual(before, after)
            self.assertEqual(receipt["status"], "SOURCE_POOL_READY")
            self.assertEqual(receipt["manual_hypothesis_row_count"], 9)
            self.assertEqual(receipt["manual_correction_theme_count"], 9)
            self.assertEqual(receipt["manual_contextual_target_count"], 5)
            document = json.loads((output / "persona_source_pool.json").read_text(encoding="utf-8"))
            validate_pool_document(document)
            self.assertLessEqual(document["manual_compression"]["contextual_target_count"], 6)
            self.assertEqual(document["p2_audit"]["microtrait_count"], 40)
            self.assertEqual(document["p2_audit"]["contradiction_count"], 7)
            self.assertFalse(document["heldout_used"])

    def test_every_output_is_mode_0600_and_directory_0700(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            p2 = base / "p2"
            manual = base / "manual"
            output = base / "output"
            write_p2_root(p2)
            write_manual_root(manual)
            RUNNER.prepare_persona_sources(
                p2,
                manual,
                output,
                trusted_p2_manifest_sha256=RUNNER.source_manifest_sha(p2, RUNNER.P2_REQUIRED_FILES),
                trusted_manual_manifest_sha256=RUNNER.source_manifest_sha(manual, RUNNER.MANUAL_REQUIRED_FILES),
            )
            self.assertEqual(output.stat().st_mode & 0o777, 0o700)
            for path in output.iterdir():
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_manual_compression_covers_each_theme_once(self):
        with tempfile.TemporaryDirectory() as directory:
            manual = Path(directory)
            write_manual_root(manual)
            rows, audit, compression, locators = RUNNER.load_manual_source_pool(manual)
            clusters = [row for row in rows if row["source_kind"] == "MANUAL_CORRECTION_CLUSTER"]
            self.assertEqual(audit["hypothesis_count"], 9)
            self.assertEqual(audit["correction_theme_count"], 9)
            self.assertEqual(len(clusters), 5)
            self.assertEqual(sum(row["local_review_payload"]["source_theme_count"] for row in clusters), 9)
            self.assertTrue(compression["all_input_themes_covered_once"])
            self.assertEqual(len(rows), len(locators))

    def test_manual_quote_privacy_and_single_family_are_required(self):
        with tempfile.TemporaryDirectory() as directory:
            manual = Path(directory)
            write_manual_root(manual)
            receipt_path = manual / "privacy_and_split_receipt.json"
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            receipt["quoted_blocks_separated"] = False
            write_json(receipt_path, receipt)
            with self.assertRaisesRegex(PersonaSourceIntegrityError, "quote_separation"):
                RUNNER.load_manual_source_pool(manual)

    def test_manual_peer_evidence_cannot_become_normative(self):
        with tempfile.TemporaryDirectory() as directory:
            manual = Path(directory)
            write_manual_root(manual)
            peer = manual_peer_evidence()
            peer["normative_confidence"] = 0.2
            write_jsonl(manual / "peer_evidence_ledger.jsonl", [peer])
            with self.assertRaisesRegex(ValueError, "normative_confidence"):
                RUNNER.load_manual_source_pool(manual)

    def test_p2_review_linkage_must_resolve(self):
        with tempfile.TemporaryDirectory() as directory:
            p2 = Path(directory)
            write_p2_root(p2)
            linkage_path = p2 / "persona_elicitation_linkage.json"
            linkage = json.loads(linkage_path.read_text(encoding="utf-8"))
            linkage["unresolved_target_refs"] = [{"target_type": "microtrait", "target_id": "synthetic_missing"}]
            write_json(linkage_path, linkage)
            with self.assertRaisesRegex(PersonaSourceIntegrityError, "unresolved"):
                RUNNER.load_p2_source_pool(p2)

    def test_p2_descriptive_hypothesis_cannot_be_promoted(self):
        with tempfile.TemporaryDirectory() as directory:
            p2 = Path(directory)
            write_p2_root(p2)
            summary_path = p2 / "reports/persona_excavation_summary.json"
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
            summary["descriptive_promoted_to_normative_count"] = 1
            write_json(summary_path, summary)
            with self.assertRaisesRegex(PersonaSourceIntegrityError, "promotion"):
                RUNNER.load_p2_source_pool(p2)

    def test_pool_constraints_cap_manual_targets_and_crocodile_share(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            p2 = base / "p2"
            manual = base / "manual"
            write_p2_root(p2)
            write_manual_root(manual)
            p2_rows, p2_audit, _ = RUNNER.load_p2_source_pool(p2)
            manual_rows, manual_audit, compression, _ = RUNNER.load_manual_source_pool(manual)
            document = RUNNER.build_pool_document(p2_rows, p2_audit, manual_rows, manual_audit, compression)
            self.assertEqual(document["pack_constraints"]["crocodile_decision_fraction_minimum"], 0.15)
            self.assertEqual(document["pack_constraints"]["crocodile_decision_fraction_maximum"], 0.20)
            self.assertEqual(document["pack_constraints"]["manual_contextual_target_maximum"], 6)
            for key in ("api_requests", "optimizer_tokens"):
                invalid = copy.deepcopy(document)
                invalid[key] = False
                with self.subTest(key=key), self.assertRaisesRegex(
                    PersonaSourceIntegrityError, f"{key}_(?:type|must_be_zero)",
                ):
                    validate_pool_document(invalid)

    def test_kind_and_session_aggregates_are_exact(self):
        rows = [
            {
                "source_kind": "P2_MICROTRAIT",
                "eligible_sessions": ["SESSION_2", "SESSION_4"],
            },
            {
                "source_kind": "MANUAL_CORRECTION_CLUSTER",
                "eligible_sessions": ["SESSION_3"],
            },
        ]
        kinds, sessions = aggregate_counts(rows)
        self.assertEqual(kinds["P2_MICROTRAIT"], 1)
        self.assertEqual(kinds["MANUAL_CORRECTION_CLUSTER"], 1)
        self.assertEqual(sessions["SESSION_2"], 1)
        self.assertEqual(sessions["SESSION_3"], 1)
        self.assertEqual(sessions["SESSION_4"], 1)
        self.assertEqual(sessions["SESSION_5"], 0)

    def test_persona_source_manifest_requires_independent_anchor_match(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            p2 = base / "p2"
            manual = base / "manual"
            write_p2_root(p2)
            write_manual_root(manual)
            with self.assertRaisesRegex(PersonaSourceIntegrityError, "p2_manifest_anchor_mismatch"):
                RUNNER.prepare_persona_sources(
                    p2,
                    manual,
                    base / "output",
                    trusted_p2_manifest_sha256="a" * 64,
                    trusted_manual_manifest_sha256=RUNNER.source_manifest_sha(
                        manual, RUNNER.MANUAL_REQUIRED_FILES,
                    ),
                )

    def test_parent_symlink_source_tree_is_rejected_before_content_read(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            real = base / "real"
            p2 = real / "p2"
            write_p2_root(p2)
            alias = base / "alias"
            alias.symlink_to(real, target_is_directory=True)
            with self.assertRaisesRegex(PersonaSourceIntegrityError, "symlink"):
                RUNNER._preflight_source_tree(
                    alias / "p2", RUNNER.P2_REQUIRED_FILES, require_all=True,
                )

    def test_blocked_receipt_only_claims_no_heldout_read_before_source_read(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            p2 = base / "p2"
            manual = base / "manual"
            p2.mkdir()
            manual.mkdir()
            safe = RUNNER.blocked_receipt(
                p2, manual, validation_failed=True, source_content_read=False,
            )
            self.assertFalse(safe["heldout_content_read"])
            self.assertEqual(
                safe["heldout_content_read_claim"],
                "NO_SOURCE_CONTENT_OPENED_BEFORE_INPUT_GAP",
            )
            uncertain = RUNNER.blocked_receipt(
                p2, manual, validation_failed=True, source_content_read=True,
            )
            self.assertIsNone(uncertain["heldout_content_read"])
            self.assertEqual(
                uncertain["heldout_content_read_claim"],
                "NOT_ASSERTED_AFTER_SOURCE_READ",
            )

    def test_legacy_blocked_receipt_requires_a_real_input_gap(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            p2 = base / "p2"
            manual = base / "manual"
            write_p2_root(p2)
            write_manual_root(manual)
            with self.assertRaisesRegex(PersonaSourceIntegrityError, "requires_input_gap"):
                RUNNER.blocked_receipt(p2, manual, source_content_read=False)

    def test_stale_ready_cleanup_preserves_fixed_source_blocker(self):
        with tempfile.TemporaryDirectory() as directory:
            original_parent = RUNNER.LOCAL_OUTPUT_PARENT
            try:
                RUNNER.LOCAL_OUTPUT_PARENT = Path(directory).resolve()
                output = RUNNER.LOCAL_OUTPUT_PARENT / "source_pool"
                output.mkdir(parents=True)
                blocker = output / "source_integrity_blocked.json"
                blocker.write_text('{"status":"BLOCKED_SOURCE_INTEGRITY"}\n', encoding="utf-8")
                stale = output / "source_pool_receipt.json"
                stale.write_text('{"status":"SOURCE_POOL_READY"}\n', encoding="utf-8")
                RUNNER.remove_stale_ready_outputs(output)
                self.assertFalse(stale.exists())
                self.assertTrue(blocker.exists())
            finally:
                RUNNER.LOCAL_OUTPUT_PARENT = original_parent


if __name__ == "__main__":
    unittest.main()
