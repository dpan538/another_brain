from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]

from src.personal_judge.persona_evidence_contract import (  # noqa: E402
    BEHAVIOUR_CLASSES,
    EPISTEMIC_PERSONA_CLASSES,
    MICROTRAIT_FAMILIES,
    REGISTER_CANDIDATES,
    assert_p2_training_guard,
    deprecated_persona_label,
    evidence_strength,
    normative_preference_established,
    validate_grammar_rule,
    validate_microtrait,
    validate_no_private_excerpt_fields,
    validate_persona_mode,
)


def load_runner():
    path = ROOT / "scripts/r30j0_p2_excavate_persona.py"
    spec = importlib.util.spec_from_file_location("r30j0_p2_excavate_persona", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RUNNER = load_runner()


def load_schema_validator():
    path = ROOT / "tests/r30j0/test_p2_schema_contract.py"
    spec = importlib.util.spec_from_file_location("r30j0_p2_schema_contract_for_evidence", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.validate_jsonschema


def synthetic_owner_seed():
    return {
        "assertion_id": "current.owner.assertion.synthetic-mode",
        "persona_seed_id": "SYNTHETIC_MODE_SEED",
        "mode_id": "synthetic_faux_naive",
        "microtrait_id": "may_use_synthetic_persona_for_weird_question",
        "candidate_behaviour": "Sometimes may use a fictional persona plus performed ignorance for a harmless strange question.",
        "mode_description": "Conditional synthetic persona with performed ignorance.",
        "epistemic_category": "PLAYFUL_FAUX_IGNORANCE",
        "trigger_positive": ["a harmless absurd question invites fictional play"],
        "trigger_negative": ["a factual or urgent answer is required"],
        "compatible_registers": ["weird_question", "absurd_meta_ai", "roleplay"],
        "forbidden_registers": ["technical_explanation", "debugging"],
        "candidate_boundary_examples": {
            "SHOULD_TRIGGER": ["Candidate scenario: a harmless fictional prompt explicitly invites play."],
            "MAY_TRIGGER": ["Candidate scenario: a strange low-stakes prompt has ambiguous tone."],
            "SHOULD_NOT_TRIGGER": ["Candidate scenario: an exact technical answer is requested."],
        },
        "status": "OWNER_ASSERTED_SEED",
        "boundary_status": "BOUNDARY_NOT_YET_KNOWN",
        "evidence_kind": "CURRENT_EXPLICIT_OWNER_ASSERTION",
        "normative": True,
        "owner_review_required": True,
        "allowed_for_training": False,
    }


def synthetic_admitted(count: int = 6):
    features = {
        "all", "compact", "very_compact", "extended", "single_line", "no_bullets",
        "no_question", "no_exclamation", "no_greeting", "no_closing",
        "no_assistant_language", "no_therapy_language", "no_imperative", "imperative",
        "uncertainty", "hedge", "no_hedge", "negation_or_correction", "causal",
        "contrast", "example", "position", "first_person", "open_ending",
        "english_insert", "chinese_dominant", "no_bilingual_repeat",
        "no_explanation_stack", "compressed_judgment", "abstract_reframe",
        "partial_answer", "pressure_resistance", "refuse", "reject_premise",
        "weird_context", "factual_context", "boundary_context", "refuse_or_uncertain",
        "position_and_hedge", "direct_declarative",
    }
    return [
        {
            "source_id": f"psrc.synthetic.{index:03d}",
            "features": set(features),
            "registers": {"ordinary_chat", "weird_question", "philosophy"},
            "answer_mode": "compressed_judgment",
            "stance": "assert",
            "time_bucket": "middle_project",
            "character_count": 20 + index,
        }
        for index in range(count)
    ]


class P2PersonaEvidenceContractTests(unittest.TestCase):
    def test_dimension_families_are_behavioural_and_complete(self):
        self.assertGreaterEqual(len(MICROTRAIT_FAMILIES), 17)
        self.assertIn("epistemic_stance", MICROTRAIT_FAMILIES)
        self.assertIn("weird_question_handling", MICROTRAIT_FAMILIES)
        self.assertIn("ai_self_presentation", MICROTRAIT_FAMILIES)

    def test_text_behaviour_classes_remain_separate(self):
        self.assertEqual(
            set(BEHAVIOUR_CLASSES),
            {"TEXT_SEMANTIC", "TEXT_STYLE", "PRESENTATION", "INTERACTION_POLICY", "ROLEPLAY", "META_AI", "UNKNOWN"},
        )

    def test_epistemic_persona_classes_do_not_collapse(self):
        self.assertEqual(len(EPISTEMIC_PERSONA_CLASSES), 5)
        self.assertIn("REAL_UNCERTAINTY", EPISTEMIC_PERSONA_CLASSES)
        self.assertIn("PLAYFUL_FAUX_IGNORANCE", EPISTEMIC_PERSONA_CLASSES)
        self.assertIn("ROLEPLAYED_IGNORANCE", EPISTEMIC_PERSONA_CLASSES)

    def test_local_legacy_label_is_deprecated_case_insensitively(self):
        labels = ["LEGACY_VAGUE_LABEL"]
        self.assertTrue(deprecated_persona_label("legacy_vague_label", labels))
        self.assertTrue(deprecated_persona_label(" LEGACY_VAGUE_LABEL ", labels))
        self.assertFalse(deprecated_persona_label("deadpan_absurdity"))

    def test_descriptive_evidence_never_becomes_normative(self):
        self.assertEqual(
            evidence_strength(descriptive_items=10_000),
            "DESCRIPTIVE_HYPOTHESIS_ONLY",
        )
        self.assertFalse(normative_preference_established(descriptive_items=10_000))

    def test_explicit_assertion_is_normative_seed(self):
        self.assertEqual(
            evidence_strength(current_explicit_owner_assertions=1),
            "EXPLICIT_OWNER_ASSERTION",
        )
        self.assertTrue(normative_preference_established(current_explicit_owner_assertions=1))

    def test_historical_normative_requires_three_independent_items(self):
        self.assertFalse(normative_preference_established(independent_historical_normative_items=2))
        self.assertTrue(normative_preference_established(independent_historical_normative_items=3))
        self.assertTrue(
            normative_preference_established(
                independent_historical_normative_items=2,
                owner_elicitation_confirmed=True,
            )
        )

    def test_private_excerpt_fields_are_rejected_recursively(self):
        with self.assertRaisesRegex(ValueError, "private_excerpt_field_forbidden"):
            validate_no_private_excerpt_fields({"nested": [{"raw_excerpt": "synthetic"}]})
        validate_no_private_excerpt_fields({"evidence_refs": ["psrc.synthetic.001"], "count": 3})

    def test_microtrait_rejects_vague_label(self):
        record = RUNNER.build_microtraits(synthetic_admitted())[0]
        record = copy.deepcopy(record)
        record["trait_id"] = "quirky"
        with self.assertRaisesRegex(ValueError, "deprecated_or_vague"):
            validate_microtrait(record)

    def test_microtrait_rejects_descriptive_normative_promotion(self):
        record = RUNNER.build_microtraits(synthetic_admitted())[0]
        record = copy.deepcopy(record)
        self.assertEqual(record["claim_status"], "DESCRIPTIVE_HYPOTHESIS_ONLY")
        record["normative_evidence_count"] = 1
        with self.assertRaisesRegex(ValueError, "descriptive_hypothesis"):
            validate_microtrait(record)

    def test_microtrait_catalog_exceeds_minimum_and_has_all_families(self):
        catalog = RUNNER.build_microtraits(synthetic_admitted())
        self.assertGreaterEqual(len(catalog), 40)
        self.assertEqual(set(MICROTRAIT_FAMILIES), {row["family"] for row in catalog})
        self.assertTrue(all(row["owner_review_required"] for row in catalog))
        self.assertTrue(all(row["allowed_for_training"] is False for row in catalog))

    def test_descriptive_signal_or_owner_assertion_candidate_count_exceeds_forty(self):
        catalog = RUNNER.build_microtraits(synthetic_admitted())
        backed = sum(
            row["descriptive_evidence_count"] >= 3 or row["normative_evidence_count"] >= 1
            for row in catalog
        )
        self.assertGreaterEqual(backed, 40)

    def test_only_one_microtrait_uses_current_owner_assertion(self):
        catalog = RUNNER.build_microtraits(synthetic_admitted(), synthetic_owner_seed())
        explicit = [row for row in catalog if row["claim_status"] == "OWNER_ASSERTED_SEED"]
        self.assertEqual(len(explicit), 1)
        self.assertEqual(explicit[0]["normative_evidence_count"], 1)
        self.assertTrue(all(not row["normative_preference_established"] for row in catalog if row not in explicit))

    def test_owner_mode_seed_is_asserted_and_boundary_unknown(self):
        mode = RUNNER.build_owner_asserted_mode_hypothesis(synthetic_owner_seed())
        self.assertEqual(mode["status"], "OWNER_ASSERTED_SEED")
        self.assertEqual(mode["boundary_status"], "BOUNDARY_NOT_YET_KNOWN")
        self.assertEqual(mode["normative_evidence_count"], 1)
        self.assertFalse(mode["implementation_authorized"])
        self.assertFalse(mode["allowed_for_training"])

    def test_owner_mode_boundary_has_all_three_concrete_example_classes(self):
        hypothesis = RUNNER.build_owner_asserted_mode_hypothesis(synthetic_owner_seed())
        examples = hypothesis["candidate_boundary_examples"]
        self.assertEqual(set(examples), {"SHOULD_TRIGGER", "MAY_TRIGGER", "SHOULD_NOT_TRIGGER"})
        self.assertTrue(all("Candidate scenario:" in text for rows in examples.values() for text in rows))
        refs = hypothesis["candidate_boundary_refs"]
        self.assertEqual(set(refs), set(examples))
        self.assertTrue(all(rows for rows in refs.values()))

    def test_owner_seed_mode_links_all_boundary_candidate_classes(self):
        modes = RUNNER.build_modes(synthetic_admitted(), synthetic_owner_seed())
        document = RUNNER.schema_mode_document(modes)
        seeded = [row for row in document["modes"] if row["seed_status"] == "OWNER_ASSERTED_SEED"]
        self.assertEqual(len(seeded), 1)
        self.assertTrue(seeded[0]["should_trigger_refs"])
        self.assertTrue(seeded[0]["may_trigger_refs"])
        self.assertTrue(seeded[0]["should_not_trigger_refs"])

    def test_current_assertion_file_requires_exact_seed_and_deprecation(self):
        fixture = {"assertions": [synthetic_owner_seed()], "label_governance": {"LEGACY_VAGUE_LABEL": "DEPRECATED_OVERSIMPLIFIED_LABEL"}}
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "assertion.json"
            path.write_text(json.dumps(fixture), encoding="utf-8")
            loaded = RUNNER.load_assertion(path)
            self.assertEqual(loaded["assertions"][0]["persona_seed_id"], "SYNTHETIC_MODE_SEED")
            fixture["label_governance"]["LEGACY_VAGUE_LABEL"] = "MODEL_CLASS"
            path.write_text(json.dumps(fixture), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "legacy_label"):
                RUNNER.load_assertion(path)

    def test_modes_all_have_positive_and_negative_boundaries(self):
        modes = RUNNER.build_modes(synthetic_admitted())
        self.assertGreaterEqual(len(modes), 2)
        for mode in modes:
            validate_persona_mode(mode)
            self.assertTrue(mode["trigger_positive"])
            self.assertTrue(mode["trigger_negative"])

    def test_mode_without_negative_boundary_is_rejected(self):
        mode = copy.deepcopy(RUNNER.build_modes(synthetic_admitted())[0])
        mode["trigger_negative"] = []
        with self.assertRaisesRegex(ValueError, "negative_boundary_required"):
            validate_persona_mode(mode)

    def test_deprecated_label_is_not_trait_or_mode(self):
        traits = RUNNER.build_microtraits(synthetic_admitted())
        modes = RUNNER.build_modes(synthetic_admitted())
        self.assertFalse(any(deprecated_persona_label(row["trait_id"]) for row in traits))
        self.assertFalse(any(deprecated_persona_label(row["mode_id"]) for row in modes))

    def test_deprecated_label_decomposition_never_authorizes_class_axis_or_training(self):
        value = RUNNER.build_deprecated_label_decomposition(
            "LEGACY_VAGUE_LABEL", RUNNER.build_microtraits(synthetic_admitted())
        )
        self.assertEqual(value["status"], "DEPRECATED_OVERSIMPLIFIED_LABEL")
        self.assertFalse(value["may_be_model_class"])
        self.assertFalse(value["may_be_persona_axis"])
        self.assertFalse(value["may_be_training_label"])
        self.assertTrue(all(row["allowed_for_training"] is False for row in value["candidate_components"]))

    def test_antipatterns_remain_hypotheses(self):
        records = RUNNER.build_antipatterns(synthetic_admitted())
        self.assertGreaterEqual(len(records), 20)
        self.assertTrue(all(row["normative_preference_established"] is False for row in records))
        self.assertTrue(all(row["owner_review_status"] == "UNREVIEWED" for row in records))

    def test_microtrait_triggers_are_behaviour_specific_and_diverse(self):
        document = RUNNER.schema_microtrait_document(
            RUNNER.build_microtraits(synthetic_admitted(), synthetic_owner_seed())
        )
        positives = {tuple(row["trigger_positive"]) for row in document["entries"]}
        negatives = {tuple(row["trigger_negative"]) for row in document["entries"]}
        self.assertEqual(len(positives), len(document["entries"]))
        self.assertEqual(len(negatives), len(document["entries"]))
        self.assertTrue(all(row["observable_behaviour"] in row["trigger_positive"][0] for row in document["entries"]))
        self.assertTrue(all(row["observable_behaviour"] in row["trigger_negative"][0] for row in document["entries"]))

    def test_antipattern_triggers_are_failure_specific_and_diverse(self):
        document = RUNNER.schema_antipattern_document(
            RUNNER.build_antipatterns(synthetic_admitted())
        )
        contexts = {tuple(row["trigger_contexts"]) for row in document["entries"]}
        self.assertEqual(len(contexts), len(document["entries"]))
        self.assertTrue(all(row["candidate_anti_behaviour"] in row["trigger_contexts"][0] for row in document["entries"]))
        self.assertTrue(all(row["compatible_registers"] for row in document["entries"]))

    def test_elicitation_linkage_resolves_and_backfills_review_refs(self):
        admitted = synthetic_admitted()
        seed = synthetic_owner_seed()
        microtraits = RUNNER.schema_microtrait_document(RUNNER.build_microtraits(admitted, seed))
        modes = RUNNER.schema_mode_document(RUNNER.build_modes(admitted, seed))
        antipatterns = RUNNER.schema_antipattern_document(RUNNER.build_antipatterns(admitted))
        contradictions = RUNNER.schema_contradiction_document(RUNNER.build_contradictions(admitted))
        grammar = RUNNER.schema_grammar_document(
            RUNNER.build_microtraits(admitted, seed),
            RUNNER.build_modes(admitted, seed),
            RUNNER.build_antipatterns(admitted),
            RUNNER.build_grammar(admitted, seed),
        )
        generic_mode = next(row["mode_id"] for row in modes["modes"] if row["seed_status"] != "OWNER_ASSERTED_SEED")
        target_refs = [
            {"target_type": "microtrait", "target_id": microtraits["entries"][0]["microtrait_id"]},
            {"target_type": "mode", "target_id": generic_mode},
            {"target_type": "antipattern", "target_id": antipatterns["entries"][0]["anti_pattern_id"]},
            {"target_type": "contradiction", "target_id": contradictions["entries"][0]["contradiction_id"]},
            {"target_type": "grammar", "target_id": grammar["layers"]["global_boundaries"][0]["grammar_item_id"]},
        ]
        item = {
            "item_id": "P2-A-001", "session": "A", "section": "mode_boundary",
            "task_type": "scenario_pair", "register": "weird_question",
            "blind_repeat": False, "repeat_of": None, "battery_tags": ["reverse_control"],
            "target_refs": target_refs,
        }
        pack = {
            "pack_id": "r30j0-p2-0000000000000000",
            "local_only": True, "network_required": False,
            "owner_answers_present": False, "owner_labels_present": False,
            "owner_review_completed": False, "profile_frozen": False,
            "training_authorized": False, "training_started": False,
            "owner_asserted_mode_seed": {"mode_id": seed["persona_seed_id"]},
            "decision_items": [item],
            "target_ref_summary": {
                "required_high_value_target_counts": {
                    "microtrait": 1, "mode": 1, "antipattern": 1,
                    "contradiction": 1, "grammar": 1,
                }
            },
        }
        linkage = RUNNER.build_elicitation_linkage(
            pack,
            pack_sha256="0" * 64,
            owner_seed=seed,
            microtrait_document=microtraits,
            mode_document=modes,
            antipattern_document=antipatterns,
            contradiction_document=contradictions,
            grammar_document=grammar,
        )
        self.assertEqual(linkage["status"], "OWNER_REVIEW_LINKAGE_READY")
        self.assertEqual(linkage["unresolved_target_refs"], [])
        RUNNER.apply_elicitation_links(linkage, microtraits, modes, antipatterns)
        self.assertTrue(microtraits["entries"][0]["boundary_pair_refs"])
        self.assertTrue(antipatterns["entries"][0]["reverse_control_refs"])
        seeded_mode = next(row for row in modes["modes"] if row["seed_status"] == "OWNER_ASSERTED_SEED")
        self.assertTrue(seeded_mode["should_trigger_refs"])
        self.assertTrue(seeded_mode["may_trigger_refs"])
        self.assertTrue(seeded_mode["should_not_trigger_refs"])
        valid_review_refs = {row["review_ref_id"] for row in linkage["review_items"]}
        self.assertTrue(set(microtraits["entries"][0]["boundary_pair_refs"]) <= valid_review_refs)
        self.assertTrue(set(antipatterns["entries"][0]["reverse_control_refs"]) <= valid_review_refs)

    def test_contradictions_are_preserved_not_averaged(self):
        rows = RUNNER.build_contradictions(synthetic_admitted())
        self.assertGreaterEqual(len(rows), 5)
        self.assertTrue(all(row["owner_question_required"] for row in rows))
        self.assertTrue(all(row["evidence_A_refs"] and row["evidence_B_refs"] for row in rows))

    def test_register_matrix_evaluates_full_candidate_set(self):
        matrix = RUNNER.build_register_matrix(synthetic_admitted())
        self.assertEqual(matrix["register_count"], len(REGISTER_CANDIDATES))
        self.assertEqual({row["register"] for row in matrix["registers"]}, set(REGISTER_CANDIDATES))

    def test_coverage_matrix_does_not_force_supported_cells(self):
        matrix = RUNNER.build_coverage_matrix(
            RUNNER.build_microtraits(synthetic_admitted()),
            RUNNER.build_modes(synthetic_admitted()),
        )
        values = {value for row in matrix["rows"] for value in row["cells"].values()}
        self.assertNotIn("supported", values)
        self.assertIn("needs_owner_review", values)
        self.assertFalse(matrix["complete_coverage_forced"])

    def test_grammar_hypotheses_are_not_owner_approved(self):
        records = RUNNER.build_grammar(synthetic_admitted())
        self.assertGreaterEqual(len(records), 10)
        for record in records:
            validate_grammar_rule(record)
            self.assertEqual(record["owner_review_status"], "UNREVIEWED")
            self.assertFalse(record["allowed_for_training"])

    def test_head_recommendations_do_not_change_architecture(self):
        value = RUNNER.build_head_recommendations()
        self.assertEqual(value["status"], "RECOMMENDATIONS_ONLY_NO_ARCHITECTURE_CHANGE")
        self.assertFalse(value["model_architecture_changed"])
        self.assertFalse(value["r30j1_authorized"])
        deprecated = [row for row in value["recommendations"] if row["output"] == "deprecated_oversimplified_class"]
        self.assertEqual(deprecated[0]["decision"], "DROP")

    def test_training_guard_is_exact(self):
        assert_p2_training_guard(RUNNER.TRAINING_GUARD)
        bad = dict(RUNNER.TRAINING_GUARD, classification_updates=1)
        with self.assertRaisesRegex(ValueError, "classification_updates"):
            assert_p2_training_guard(bad)

    def test_feature_extraction_is_aggregate_only(self):
        row = {"answer_mode": "compressed_judgment", "stance": "reject_premise", "module": "synthetic", "scene": "synthetic", "tags": []}
        features = RUNNER.feature_set(row, "不是这样，因为条件不同。")
        self.assertIn("causal", features)
        self.assertIn("negation_or_correction", features)
        self.assertIn("compressed_judgment", features)
        self.assertIn("reject_premise", features)

    def test_feedback_signal_classes_cover_chinese_and_english(self):
        self.assertIn("EXPLICIT_REJECT", RUNNER.feedback_categories("这个版本太正式"))
        self.assertIn("EXPLICIT_REJECT", RUNNER.feedback_categories("This is too formal"))
        self.assertIn("EXPLICIT_EXCEPTION", RUNNER.feedback_categories("不要解释"))

    def test_owner_edited_content_is_reexamined_but_not_admitted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "identity_pack/cards/synthetic_cards.jsonl"
            path.parent.mkdir(parents=True)
            path.write_text(
                json.dumps({
                    "id": "synthetic-card-001",
                    "safe_answer": "synthetic concise answer",
                    "voice_hint": "synthetic voice hint",
                }) + "\n",
                encoding="utf-8",
            )
            inventory = [{
                "source_id": "psrc.synthetic.edited.001",
                "logical_path": "identity_pack/cards/synthetic_cards.jsonl#card-synthetic-card-001",
                "authorship_class": "OWNER_AUTHORED_EDITED",
                "contains_sensitive_sections": False,
            }]
            records, report = RUNNER.reexamine_edited_secondary(root, inventory)
            self.assertEqual(len(records), 1)
            self.assertEqual(report["content_reexamined_count"], 1)
            self.assertEqual(report["used_as_normative_evidence_count"], 0)
            self.assertEqual(report["used_as_microtrait_evidence_count"], 0)
            self.assertNotIn("safe_answer", json.dumps(report))

    def test_inferred_context_is_candidate_register_not_personality(self):
        row = {"module": "怪问题", "scene": "synthetic", "question_intent": "synthetic", "tags": []}
        self.assertIn("weird_question", RUNNER.infer_registers(row))

    def test_unresolved_questions_are_ranked_and_private_free(self):
        text = RUNNER.unresolved_markdown()
        self.assertGreaterEqual(len(RUNNER.UNRESOLVED_QUESTIONS), 20)
        self.assertIn("owner elicitation required", text)
        machine_user_marker = "/" + "Users" + "/"
        self.assertNotIn(machine_user_marker, text)
        machine_private_marker = "/" + "private" + "/"
        self.assertNotIn(machine_private_marker, text)

    def test_runner_has_no_network_or_training_imports(self):
        source = (ROOT / "scripts/r30j0_p2_excavate_persona.py").read_text(encoding="utf-8")
        for forbidden in ("import requests", "import httpx", "urllib.request", "deepseek", "optimizer.step(", "model.train("):
            self.assertNotIn(forbidden, source.casefold())

    def test_runner_does_not_open_secret_file(self):
        source = (ROOT / "scripts/r30j0_p2_excavate_persona.py").read_text(encoding="utf-8")
        self.assertNotIn(".env.deepseek.local", source)
        self.assertNotIn("authorization", source.casefold())

    def test_default_output_is_ignored_persona_excavation(self):
        source = (ROOT / "scripts/r30j0_p2_excavate_persona.py").read_text(encoding="utf-8")
        self.assertIn('artifacts/r30j0/persona_excavation', source)
        self.assertIn("p2_output_must_remain_under_ignored_persona_excavation", source)

    def test_actual_owner_seed_values_are_not_embedded_in_tracked_runner(self):
        assertion_path = ROOT / "artifacts/r30j0/persona_excavation/source_reanalysis/current_owner_assertions.json"
        if not assertion_path.is_file():
            self.skipTest("ignored local assertion input not present")
        local = json.loads(assertion_path.read_text(encoding="utf-8"))
        tracked = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (
                ROOT / "src/personal_judge/persona_evidence_contract.py",
                ROOT / "scripts/r30j0_p2_excavate_persona.py",
                ROOT / "tests/r30j0/test_p2_evidence_contract.py",
            )
        )
        assertion = local["assertions"][0]
        for value in (assertion["persona_seed_id"], assertion["mode_id"], assertion["microtrait_id"]):
            self.assertNotIn(value, tracked)
        for value in local["label_governance"]:
            self.assertNotIn(value, tracked)

    def test_populated_artifacts_cross_validate_canonical_schemas(self):
        artifact_root = ROOT / "artifacts/r30j0/persona_excavation"
        pairs = (
            ("persona_microtraits.json", "r30j0_p2_persona_microtrait_catalog_v1.schema.json"),
            ("persona_mode_hypotheses.json", "r30j0_p2_persona_mode_boundary_v1.schema.json"),
            ("persona_antipatterns.json", "r30j0_p2_persona_antipattern_map_v1.schema.json"),
            ("persona_contradiction_ledger.json", "r30j0_p2_persona_contradiction_ledger_v1.schema.json"),
            ("persona_coverage_matrix.json", "r30j0_p2_persona_coverage_matrix_v1.schema.json"),
            ("persona_grammar_hypotheses.json", "r30j0_p2_personal_interaction_grammar_v1.schema.json"),
        )
        if not all((artifact_root / artifact).is_file() for artifact, _ in pairs):
            self.skipTest("ignored populated excavation artifacts not present")
        validate_jsonschema = load_schema_validator()
        for artifact, schema_name in pairs:
            value = json.loads((artifact_root / artifact).read_text(encoding="utf-8"))
            schema = json.loads((ROOT / "schemas" / schema_name).read_text(encoding="utf-8"))
            validate_jsonschema(value, schema)

        canonical = json.loads((artifact_root / "persona_contradiction_ledger.json").read_text(encoding="utf-8"))
        projection = [json.loads(line) for line in (artifact_root / "persona_contradictions.jsonl").read_text(encoding="utf-8").splitlines() if line]
        self.assertEqual(projection, canonical["entries"])

    def test_populated_review_linkage_covers_all_persona_hypotheses(self):
        artifact_root = ROOT / "artifacts/r30j0/persona_excavation"
        required_files = (
            "persona_elicitation_linkage.json", "persona_microtraits.json",
            "persona_mode_hypotheses.json", "persona_antipatterns.json",
            "persona_contradiction_ledger.json", "persona_grammar_hypotheses.json",
        )
        if not all((artifact_root / name).is_file() for name in required_files):
            self.skipTest("ignored populated review linkage not present")
        linkage = json.loads((artifact_root / required_files[0]).read_text(encoding="utf-8"))
        documents = [json.loads((artifact_root / name).read_text(encoding="utf-8")) for name in required_files[1:]]
        microtraits, modes, antipatterns, contradictions, grammar = documents
        targets = RUNNER.canonical_target_index(microtraits, modes, antipatterns, contradictions, grammar)
        review_refs = {row["review_ref_id"] for row in linkage["review_items"]}
        self.assertEqual(linkage["status"], "OWNER_REVIEW_LINKAGE_READY")
        self.assertEqual(linkage["unresolved_target_refs"], [])
        self.assertFalse(linkage["owner_review_completed"])
        self.assertFalse(linkage["owner_labels_present"])
        self.assertFalse(linkage["allowed_for_training"])
        linked = {(row["target_type"], row["target_id"]): row for row in linkage["entries"]}
        for target_type in ("microtrait", "mode", "antipattern", "contradiction"):
            self.assertEqual(
                {target_id for kind, target_id in linked if kind == target_type},
                targets[target_type],
            )
        for row in linkage["entries"]:
            self.assertTrue(row["review_item_refs"])
            self.assertTrue(set(row["review_item_refs"]) <= review_refs)
            self.assertTrue(row["owner_review_required"])
            self.assertFalse(row["allowed_for_training"])
        self.assertTrue(all(row["boundary_pair_refs"] for row in microtraits["entries"]))
        self.assertTrue(all(row["may_trigger_refs"] for row in modes["modes"]))
        self.assertTrue(all(row["reverse_control_refs"] for row in antipatterns["entries"]))
        self.assertGreater(linkage["linked_target_counts"]["grammar"], 0)

    def test_summary_contract_contains_required_aggregate_keys(self):
        source = (ROOT / "scripts/r30j0_p2_excavate_persona.py").read_text(encoding="utf-8")
        required = (
            "historical_sources_reexamined", "normative_personal_evidence_count",
            "microtrait_hypothesis_count", "persona_mode_hypothesis_count",
            "register_count", "antipattern_count", "contradiction_count",
            "unresolved_question_count", "elicitation_item_count",
            "crocodile_mode_seed_present", "crocodile_mode_boundary_known",
            "deprecated_wired_label_removed", "owner_review_v2_ready",
        )
        for key in required:
            self.assertIn(f'"{key}"', source)


if __name__ == "__main__":
    unittest.main()
