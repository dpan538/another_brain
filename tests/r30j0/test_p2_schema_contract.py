import copy
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]

SCHEMA_TEMPLATE_PAIRS = {
    "schemas/r30j0_p2_personal_interaction_grammar_v1.schema.json":
        "data/personal_judge/templates/r30j0_p2_personal_interaction_grammar_v1.empty.json",
    "schemas/r30j0_p2_persona_microtrait_catalog_v1.schema.json":
        "data/personal_judge/templates/r30j0_p2_persona_microtrait_catalog_v1.empty.json",
    "schemas/r30j0_p2_persona_antipattern_map_v1.schema.json":
        "data/personal_judge/templates/r30j0_p2_persona_antipattern_map_v1.empty.json",
    "schemas/r30j0_p2_persona_contradiction_ledger_v1.schema.json":
        "data/personal_judge/templates/r30j0_p2_persona_contradiction_ledger_v1.empty.json",
    "schemas/r30j0_p2_persona_mode_boundary_v1.schema.json":
        "data/personal_judge/templates/r30j0_p2_persona_mode_boundary_v1.empty.json",
    "schemas/r30j0_p2_persona_coverage_matrix_v1.schema.json":
        "data/personal_judge/templates/r30j0_p2_persona_coverage_matrix_v1.empty.json",
    "schemas/r30j0_p2_owner_persona_elicitation_v2.schema.json":
        "data/personal_judge/templates/r30j0_p2_owner_persona_elicitation_v2.empty.json",
    "schemas/r30j0_p2_owner_persona_review_export_v2.schema.json":
        "data/personal_judge/templates/r30j0_p2_owner_persona_review_export_v2.empty.json",
}


def load_json(relative: str):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def walk(value):
    yield value
    if isinstance(value, dict):
        for nested in value.values():
            yield from walk(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from walk(nested)


def property_keys(value):
    keys = set()
    if isinstance(value, dict):
        properties = value.get("properties")
        if isinstance(properties, dict):
            keys.update(properties)
        for nested in value.values():
            keys.update(property_keys(nested))
    elif isinstance(value, list):
        for nested in value:
            keys.update(property_keys(nested))
    return keys


class SchemaValidationError(AssertionError):
    pass


def _type_matches(value, expected):
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    raise SchemaValidationError(f"unsupported schema type: {expected}")


def validate_jsonschema(instance, schema, root=None, path="$"):
    """Validate the Draft 2020-12 subset used by the tracked P2 contracts.

    The project intentionally has no runtime JSON Schema dependency. This
    deterministic test validator covers every keyword used by these schemas
    and validates real generator/UI output, rather than merely inspecting
    schema text.
    """

    root = schema if root is None else root
    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/"):
            raise SchemaValidationError(f"{path}: external ref forbidden: {ref}")
        target = root
        for token in ref[2:].split("/"):
            target = target[token.replace("~1", "/").replace("~0", "~")]
        validate_jsonschema(instance, target, root, path)

    if "allOf" in schema:
        for index, branch in enumerate(schema["allOf"]):
            validate_jsonschema(instance, branch, root, f"{path}.allOf[{index}]")
    if "anyOf" in schema:
        if not any(_schema_is_valid(instance, branch, root) for branch in schema["anyOf"]):
            raise SchemaValidationError(f"{path}: no anyOf branch matched")
    if "not" in schema and _schema_is_valid(instance, schema["not"], root):
        raise SchemaValidationError(f"{path}: forbidden by not")
    if "if" in schema:
        branch = schema.get("then") if _schema_is_valid(instance, schema["if"], root) else schema.get("else")
        if branch is not None:
            validate_jsonschema(instance, branch, root, f"{path}.conditional")

    expected_type = schema.get("type")
    if expected_type is not None:
        types = expected_type if isinstance(expected_type, list) else [expected_type]
        if not any(_type_matches(instance, value) for value in types):
            raise SchemaValidationError(f"{path}: expected {types}, got {type(instance).__name__}")
    if "const" in schema and instance != schema["const"]:
        raise SchemaValidationError(f"{path}: const mismatch")
    if "enum" in schema and instance not in schema["enum"]:
        raise SchemaValidationError(f"{path}: value not in enum")

    if isinstance(instance, dict):
        required = schema.get("required", [])
        missing = [key for key in required if key not in instance]
        if missing:
            raise SchemaValidationError(f"{path}: missing required {missing}")
        if len(instance) < schema.get("minProperties", 0):
            raise SchemaValidationError(f"{path}: too few properties")
        if "maxProperties" in schema and len(instance) > schema["maxProperties"]:
            raise SchemaValidationError(f"{path}: too many properties")
        properties = schema.get("properties", {})
        pattern_properties = schema.get("patternProperties", {})
        property_names = schema.get("propertyNames")
        for key, value in instance.items():
            if property_names is not None:
                validate_jsonschema(key, property_names, root, f"{path}.<propertyName>")
            matched = False
            if key in properties:
                validate_jsonschema(value, properties[key], root, f"{path}.{key}")
                matched = True
            for pattern, contract in pattern_properties.items():
                if re.search(pattern, key):
                    validate_jsonschema(value, contract, root, f"{path}.{key}")
                    matched = True
            if not matched and "additionalProperties" in schema:
                additional = schema["additionalProperties"]
                if additional is False:
                    raise SchemaValidationError(f"{path}: unexpected property {key}")
                if isinstance(additional, dict):
                    validate_jsonschema(value, additional, root, f"{path}.{key}")

    if isinstance(instance, list):
        if len(instance) < schema.get("minItems", 0):
            raise SchemaValidationError(f"{path}: too few items")
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            raise SchemaValidationError(f"{path}: too many items")
        if schema.get("uniqueItems"):
            canonical = [json.dumps(value, ensure_ascii=False, sort_keys=True) for value in instance]
            if len(canonical) != len(set(canonical)):
                raise SchemaValidationError(f"{path}: duplicate items")
        if "items" in schema:
            for index, value in enumerate(instance):
                validate_jsonschema(value, schema["items"], root, f"{path}[{index}]")
        if "contains" in schema and not any(_schema_is_valid(value, schema["contains"], root) for value in instance):
            raise SchemaValidationError(f"{path}: contains requirement not met")

    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            raise SchemaValidationError(f"{path}: string too short")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            raise SchemaValidationError(f"{path}: string too long")
        if "pattern" in schema and re.search(schema["pattern"], instance) is None:
            raise SchemaValidationError(f"{path}: pattern mismatch")

    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if instance < schema.get("minimum", instance):
            raise SchemaValidationError(f"{path}: below minimum")
        if "maximum" in schema and instance > schema["maximum"]:
            raise SchemaValidationError(f"{path}: above maximum")


def _schema_is_valid(instance, schema, root):
    try:
        validate_jsonschema(instance, schema, root)
        return True
    except SchemaValidationError:
        return False


class TestR30J0P2SchemaContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = load_json("config/r30j0_p2_persona_excavation_v1.json")
        cls.schemas = {name: load_json(name) for name in SCHEMA_TEMPLATE_PAIRS}
        cls.templates = {
            name: load_json(template)
            for name, template in SCHEMA_TEMPLATE_PAIRS.items()
        }
        cls._temporary_directory = tempfile.TemporaryDirectory(prefix="r30j0-p2-schema-")
        temporary_root = Path(cls._temporary_directory.name)
        assertion_path = temporary_root / "synthetic_owner_governance.json"
        assertion_path.write_text(
            json.dumps(
                {
                    "assertions": [
                        {
                            "persona_seed_id": "SYNTHETIC_MODE_SEED",
                            "status": "OWNER_ASSERTED_SEED",
                            "boundary_status": "BOUNDARY_NOT_YET_KNOWN",
                            "owner_review_required": True,
                            "allowed_for_training": False,
                        }
                    ],
                    "label_governance": {
                        "SYNTHETIC_BROAD_LABEL": "DEPRECATED_OVERSIMPLIFIED_LABEL"
                    },
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        target_catalog_dir = temporary_root / "synthetic_target_catalogs"
        target_catalog_dir.mkdir()
        microtraits = [f"synthetic_microtrait_{index:03d}" for index in range(74)]
        modes = ["synthetic_mode_seed", *[f"synthetic_mode_{index:02d}" for index in range(11)]]
        antipatterns = [f"synthetic_antipattern_{index:03d}" for index in range(26)]
        contradictions = [f"contradiction.synthetic_{index:03d}" for index in range(7)]
        boundary_grammar = [
            "evidence.descriptive_not_normative",
            "exception.explicit_serious_request",
            "exception.factual_stakes",
            "exception.owner_turn_instruction",
            "boundary.no_factual_sacrifice",
            "boundary.real_unknown_is_literal",
            "boundary.unreviewed_modes_do_not_execute",
        ]
        target_documents = {
            "persona_microtraits.json": {"entries": [{"microtrait_id": value} for value in microtraits]},
            "persona_mode_hypotheses.json": {"modes": [{"mode_id": value} for value in modes]},
            "persona_antipatterns.json": {"entries": [{"anti_pattern_id": value} for value in antipatterns]},
            "persona_contradiction_ledger.json": {"entries": [{"contradiction_id": value} for value in contradictions]},
            "persona_grammar_hypotheses.json": {
                "layers": [{"items": [{"grammar_item_id": value} for value in [*boundary_grammar, *[f"anti.{value}" for value in antipatterns]]]}]
            },
        }
        for filename, document in target_documents.items():
            (target_catalog_dir / filename).write_text(json.dumps(document) + "\n", encoding="utf-8")
        cls.generated_pack_path = temporary_root / "elicitation_pack_v2.json"
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "r30j0_p2_build_elicitation_pack.py"),
                "--owner-assertion-file",
                str(assertion_path),
                "--target-catalog-dir",
                str(target_catalog_dir),
                "--output",
                str(cls.generated_pack_path),
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        cls.generated_pack = json.loads(cls.generated_pack_path.read_text(encoding="utf-8"))
        cls.generated_ui_root = temporary_root / "owner_review_v2"
        subprocess.run(
            [
                "node",
                str(ROOT / "scripts" / "r30j0_p2_build_owner_review_v2.mjs"),
                "--input",
                str(cls.generated_pack_path),
                "--output-dir",
                str(cls.generated_ui_root),
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        cls.generated_initial_review = json.loads(
            (cls.generated_ui_root / "initial_review_state.json").read_text(encoding="utf-8")
        )

    @classmethod
    def tearDownClass(cls):
        cls._temporary_directory.cleanup()

    def test_all_schema_and_template_files_parse(self):
        self.assertEqual(len(self.schemas), 8)
        self.assertEqual(len(self.templates), 8)
        for schema in self.schemas.values():
            self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
            self.assertFalse(schema["additionalProperties"])

    def test_all_empty_templates_validate_against_jsonschema(self):
        for name, schema in self.schemas.items():
            validate_jsonschema(self.templates[name], schema)

    def test_real_generator_pack_validates_against_jsonschema(self):
        schema = self.schemas["schemas/r30j0_p2_owner_persona_elicitation_v2.schema.json"]
        validate_jsonschema(self.generated_pack, schema)
        self.assertEqual(self.generated_pack["owner_asserted_mode_seed"]["mode_id"], "SYNTHETIC_MODE_SEED")
        self.assertEqual(len(self.generated_pack["decision_items"]), 190)
        self.assertEqual(len(self.generated_pack["optional_owner_write_prompts"]), 40)
        self.assertEqual(self.generated_pack["coverage"]["unique_case_count"], 166)
        self.assertEqual(self.generated_pack["coverage"]["blind_repeat_case_count"], 24)
        self.assertTrue(all(item["owner_review_required"] for item in self.generated_pack["decision_items"]))
        self.assertTrue(
            all(
                "canonical_option_id" in candidate
                for item in self.generated_pack["decision_items"]
                for candidate in item.get("candidates", [])
            )
        )
        self.assertTrue(all(item["target_refs"] for item in self.generated_pack["decision_items"]))
        summary = self.generated_pack["target_ref_summary"]
        self.assertEqual(
            summary["required_high_value_target_counts"],
            {"antipattern": 26, "contradiction": 7, "grammar": 33, "microtrait": 74, "mode": 12},
        )
        self.assertEqual(summary["covered_high_value_target_counts"], summary["required_high_value_target_counts"])
        self.assertEqual(summary["uncovered_high_value_target_ref_count"], 0)
        section_counts = {
            section: sum(item["section"] == section for item in self.generated_pack["decision_items"])
            for section in self.generated_pack["sections"]
        }
        self.assertTrue(all(count > 0 for count in section_counts.values()))

    def test_real_ui_initial_export_validates_against_jsonschema(self):
        schema = self.schemas["schemas/r30j0_p2_owner_persona_review_export_v2.schema.json"]
        validate_jsonschema(self.generated_initial_review, schema)

    def test_synthetic_ui_export_cross_validates_and_depends_requires_condition(self):
        schema = self.schemas["schemas/r30j0_p2_owner_persona_review_export_v2.schema.json"]
        value = copy.deepcopy(self.generated_initial_review)
        item_id = self.generated_pack["decision_items"][0]["item_id"]
        value["responses"][item_id] = {
            "review_action": "DEPENDS",
            "decision": "IT_DEPENDS",
            "ranks": {"A": "", "B": "", "C": ""},
            "scenario_decisions": {"A": "", "B": ""},
            "condition": "synthetic public-safe condition",
            "edit_text": "",
            "open_response": "",
            "notes": "",
        }
        value["progress"] = {
            "completed_decisions": 1,
            "total_decisions": 190,
            "optional_owner_written_completed": 0,
            "optional_owner_written_total": 40,
        }
        value["repeat_consistency"] = {
            "eligible_pair_count": 24,
            "completed_pair_count": 1,
            "consistent_pair_count": 1,
            "consistency_rate": 1.0,
            "per_trait_family": {
                "synthetic_trait": {
                    "completed_pair_count": 1,
                    "consistent_pair_count": 1,
                    "consistency_rate": 1.0,
                }
            },
        }
        value["export_contract"] = {
            "local_only": True,
            "contains_owner_review_data": True,
            "must_remain_ignored": True,
            "authorizes_training": False,
        }
        validate_jsonschema(value, schema)
        value["responses"][item_id]["condition"] = "   "
        with self.assertRaises(SchemaValidationError):
            validate_jsonschema(value, schema)
        value["responses"][item_id].update(
            {
                "review_action": "ACCEPT",
                "decision": "PAIR_DECISION",
                "scenario_decisions": {"A": "DEPENDS", "B": "NORMAL"},
                "condition": "",
            }
        )
        with self.assertRaises(SchemaValidationError):
            validate_jsonschema(value, schema)
        value["responses"][item_id]["condition"] = "synthetic pair condition"
        validate_jsonschema(value, schema)

    def test_all_internal_schema_refs_resolve(self):
        for name, schema in self.schemas.items():
            for node in walk(schema):
                if not isinstance(node, dict) or "$ref" not in node:
                    continue
                ref = node["$ref"]
                self.assertTrue(ref.startswith("#/"), (name, ref))
                target = schema
                for token in ref[2:].split("/"):
                    target = target[token.replace("~1", "/").replace("~0", "~")]
                self.assertIsNotNone(target)

    def test_empty_templates_match_root_required_and_constants(self):
        for name, schema in self.schemas.items():
            template = self.templates[name]
            self.assertEqual(set(template), set(schema["required"]), name)
            for key, value in template.items():
                contract = schema["properties"][key]
                if "const" in contract:
                    self.assertEqual(value, contract["const"], (name, key))
                if "enum" in contract:
                    self.assertIn(value, contract["enum"], (name, key))

    def test_tracked_templates_are_empty_and_contain_no_owner_values(self):
        grammar = self.templates["schemas/r30j0_p2_personal_interaction_grammar_v1.schema.json"]
        self.assertTrue(all(value == [] for value in grammar["layers"].values()))
        for template in self.templates.values():
            for key in (
                "entries",
                "modes",
                "rows",
                "sections",
                "decision_items",
                "optional_owner_write_prompts",
            ):
                if key in template:
                    self.assertEqual(template[key], [], key)
            for key in ("responses", "owner_written_responses"):
                if key in template:
                    self.assertEqual(template[key], {}, key)
            self.assertFalse(template["owner_review_completed"])
            if "allowed_for_training" in template:
                self.assertFalse(template["allowed_for_training"])
            else:
                self.assertFalse(template["training_authorized"])

    def test_personal_interaction_grammar_has_exact_eight_layers(self):
        expected = [
            "global_boundaries",
            "register_preferences",
            "microtraits",
            "persona_modes",
            "trigger_rules",
            "anti_patterns",
            "exceptions",
            "confidence_owner_evidence",
        ]
        self.assertEqual(self.config["persona_interaction_grammar_layers"], expected)
        schema = self.schemas["schemas/r30j0_p2_personal_interaction_grammar_v1.schema.json"]
        self.assertEqual(schema["properties"]["layers"]["required"], expected)
        self.assertEqual(list(schema["properties"]["layers"]["properties"]), expected)

    def test_epistemic_persona_categories_are_exact_and_distinct(self):
        expected = [
            "REAL_UNCERTAINTY",
            "PLAYFUL_FAUX_IGNORANCE",
            "ROLEPLAYED_IGNORANCE",
            "REFUSAL_TO_OVEREXPLAIN",
            "DEADPAN_MISDIRECTION",
        ]
        self.assertEqual(self.config["epistemic_persona_categories"], expected)
        self.assertTrue(self.config["epistemic_categories_must_remain_distinct"])
        for schema_name in (
            "schemas/r30j0_p2_personal_interaction_grammar_v1.schema.json",
            "schemas/r30j0_p2_persona_microtrait_catalog_v1.schema.json",
            "schemas/r30j0_p2_persona_mode_boundary_v1.schema.json",
        ):
            enum = self.schemas[schema_name]["$defs"]["epistemicCategory"]["enum"]
            self.assertEqual(enum[:-1], expected)
            self.assertIsNone(enum[-1])

    def test_deprecated_label_is_never_a_class_or_value(self):
        documents = [self.config, *self.templates.values(), *self.schemas.values()]
        for document in documents:
            for node in walk(document):
                if not isinstance(node, dict):
                    continue
                values = []
                if "const" in node:
                    values.append(node["const"])
                values.extend(node.get("enum", []))
                for value in values:
                    if isinstance(value, str):
                        self.assertNotEqual(value.casefold(), "wired")
        policy = self.config["deprecated_oversimplified_label_policy"]
        self.assertTrue(all(value is False for key, value in policy.items() if key.startswith("may_be_")))

    def test_no_owner_asserted_seed_is_instantiated_in_tracked_data(self):
        self.assertEqual(self.config["execution_boundary"]["owner_asserted_seed_records"], "ignored_actual_data_only")
        mode_template = self.templates["schemas/r30j0_p2_persona_mode_boundary_v1.schema.json"]
        self.assertEqual(mode_template["modes"], [])
        grammar = self.templates["schemas/r30j0_p2_personal_interaction_grammar_v1.schema.json"]
        self.assertEqual(grammar["layers"]["persona_modes"], [])

    def test_microtrait_families_are_exact_and_behavioral_catalog_has_floor(self):
        expected = [
            "RESPONSE_SHAPE",
            "SOCIAL_STANCE",
            "EPISTEMIC_STANCE",
            "HUMOUR_STRATEGY",
            "ROLEPLAY_PERSONA",
            "SERIOUSNESS_SWITCHING",
            "EXPLANATION_STRATEGY",
            "AGREEMENT_DISAGREEMENT",
            "EMOTIONAL_RESPONSE_STYLE",
            "PHILOSOPHICAL_RESPONSE_STYLE",
            "TECHNICAL_RESPONSE_STYLE",
            "ABSURD_WEIRD_QUESTION_HANDLING",
            "LANGUAGE_CODE_SWITCHING",
            "OPENING_CLOSING_BEHAVIOUR",
            "INTERACTION_RHYTHM",
            "AI_SELF_PRESENTATION",
            "ANTI_PATTERNS",
        ]
        self.assertEqual(self.config["microtrait_dimension_families"], expected)
        schema = self.schemas["schemas/r30j0_p2_persona_microtrait_catalog_v1.schema.json"]
        self.assertEqual(schema["$defs"]["family"]["enum"], expected)
        self.assertEqual(schema["allOf"][0]["then"]["properties"]["entries"]["minItems"], 40)
        fields = schema["$defs"]["microtrait"]["required"]
        self.assertIn("observable_behaviour", fields)
        self.assertIn("trigger_positive", fields)
        self.assertIn("trigger_negative", fields)

    def test_microtrait_evidence_routes_enforce_normative_thresholds(self):
        schema = self.schemas["schemas/r30j0_p2_persona_microtrait_catalog_v1.schema.json"]
        rules = schema["$defs"]["microtrait"]["allOf"]
        keyed = {
            rule["if"]["properties"]["evidence_route"]["const"]: rule["then"]
            for rule in rules
        }
        self.assertEqual(
            keyed["THREE_INDEPENDENT_HISTORICAL_NORMATIVE_ITEMS"]["properties"]["independent_normative_evidence_count"]["minimum"],
            3,
        )
        two_plus = keyed["TWO_ITEMS_PLUS_OWNER_ELICITATION"]["properties"]
        self.assertEqual(two_plus["independent_normative_evidence_count"]["minimum"], 2)
        self.assertTrue(two_plus["elicitation_confirmed"]["const"])

    def test_mode_boundary_requires_positive_and_negative_conditions(self):
        schema = self.schemas["schemas/r30j0_p2_persona_mode_boundary_v1.schema.json"]
        mode = schema["$defs"]["mode"]
        required = set(mode["required"])
        contractual = {
            "trigger_positive",
            "trigger_negative",
            "minimum_confidence",
            "compatible_registers",
            "forbidden_registers",
            "maximum_intensity",
            "fallback_mode",
            "evidence_count",
            "contradiction_count",
        }
        self.assertTrue(contractual.issubset(required))
        self.assertEqual(mode["properties"]["trigger_positive"]["minItems"], 1)
        self.assertEqual(mode["properties"]["trigger_negative"]["minItems"], 1)
        self.assertNotIn("minItems", mode["properties"]["forbidden_registers"])
        self.assertTrue(self.config["mode_boundary_contract"]["mode_without_negative_boundary_rejected"])
        self.assertFalse(schema["properties"]["implementation_authorized"]["const"])

    def test_register_coverage_is_expanded_but_sparse(self):
        registers = self.config["expanded_registers_to_evaluate"]
        self.assertEqual(len(registers), 15)
        coverage = self.schemas["schemas/r30j0_p2_persona_coverage_matrix_v1.schema.json"]
        self.assertEqual(coverage["$defs"]["register"]["enum"], registers)
        self.assertFalse(coverage["properties"]["complete_coverage_required"]["const"])
        self.assertEqual(
            coverage["$defs"]["coverageCell"]["properties"]["coverage"]["enum"],
            ["supported", "contradicted", "unknown", "not_applicable", "needs_owner_review"],
        )

    def test_antipatterns_require_caricature_boundary_and_reverse_control(self):
        schema = self.schemas["schemas/r30j0_p2_persona_antipattern_map_v1.schema.json"]
        record = schema["$defs"]["antiPattern"]
        self.assertIn("failure_transition", record["required"])
        self.assertIn("reverse_control_refs", record["required"])
        self.assertEqual(
            record["properties"]["failure_transition"]["required"],
            ["useful_behaviour", "becomes_harmful_when", "harmful_result"],
        )

    def test_contradictions_preserve_both_sides_and_time_drift(self):
        schema = self.schemas["schemas/r30j0_p2_persona_contradiction_ledger_v1.schema.json"]
        record = schema["$defs"]["contradiction"]
        for field in (
            "trait",
            "evidence_A",
            "evidence_B",
            "possible_register_explanation",
            "possible_context_explanation",
            "time_drift_possible",
            "owner_question_required",
        ):
            self.assertIn(field, record["required"])
        self.assertTrue(record["properties"]["owner_question_required"]["const"])

    def test_all_persona_records_are_review_gated_and_non_training(self):
        record_defs = [
            ("schemas/r30j0_p2_personal_interaction_grammar_v1.schema.json", "baseItem"),
            ("schemas/r30j0_p2_persona_microtrait_catalog_v1.schema.json", "microtrait"),
            ("schemas/r30j0_p2_persona_antipattern_map_v1.schema.json", "antiPattern"),
            ("schemas/r30j0_p2_persona_contradiction_ledger_v1.schema.json", "contradiction"),
            ("schemas/r30j0_p2_persona_mode_boundary_v1.schema.json", "mode"),
            ("schemas/r30j0_p2_persona_coverage_matrix_v1.schema.json", "coverageCell"),
            ("schemas/r30j0_p2_persona_coverage_matrix_v1.schema.json", "coverageRow"),
            ("schemas/r30j0_p2_owner_persona_elicitation_v2.schema.json", "decisionItem"),
            ("schemas/r30j0_p2_owner_persona_elicitation_v2.schema.json", "ownerWritePrompt"),
        ]
        for schema_name, def_name in record_defs:
            record = self.schemas[schema_name]["$defs"][def_name]
            self.assertIn("owner_review_required", record["required"], (schema_name, def_name))
            self.assertIn("allowed_for_training", record["required"], (schema_name, def_name))
            self.assertTrue(record["properties"]["owner_review_required"]["const"])
            self.assertFalse(record["properties"]["allowed_for_training"]["const"])

    def test_text_behavior_classes_are_explicit(self):
        expected = [
            "TEXT_SEMANTIC",
            "TEXT_STYLE",
            "PRESENTATION",
            "INTERACTION_POLICY",
            "ROLEPLAY",
            "META_AI",
            "UNKNOWN",
        ]
        self.assertEqual(self.config["text_behavior_classes"], expected)
        microtraits = self.schemas["schemas/r30j0_p2_persona_microtrait_catalog_v1.schema.json"]
        self.assertEqual(microtraits["$defs"]["behaviourClass"]["enum"], expected)

    def test_elicitation_supports_required_interactions_and_battery_sizes(self):
        contract = self.config["elicitation_contract"]
        self.assertEqual(contract["allowed_actions"], ["ACCEPT", "REJECT", "EDIT", "DEPENDS", "UNSURE"])
        self.assertTrue(contract["depends_requires_condition_text"])
        self.assertTrue(contract["none_of_these_supported"])
        self.assertGreaterEqual(contract["blind_repeat_minimum_fraction"], 0.12)
        self.assertGreaterEqual(contract["weird_question_prompt_minimum"], 40)
        self.assertGreaterEqual(contract["mode_boundary_pair_minimum"], 24)
        self.assertGreaterEqual(contract["generic_good_mismatch_minimum"], 50)
        self.assertGreaterEqual(contract["reverse_control_minimum"], 40)
        self.assertGreaterEqual(contract["owner_authored_answer_prompt_minimum"], 30)
        self.assertLessEqual(contract["owner_authored_answer_prompt_maximum"], 50)
        schema = self.schemas["schemas/r30j0_p2_owner_persona_elicitation_v2.schema.json"]
        review = schema["$defs"]["reviewContract"]["properties"]
        self.assertTrue(review["none_of_these_supported"]["const"])
        self.assertTrue(review["depends_requires_condition"]["const"])
        self.assertTrue(review["it_depends_requires_condition"]["const"])
        decisions = schema["$defs"]["decisionItem"]["properties"]["allowed_decisions"]
        self.assertEqual(decisions["allOf"][0]["contains"]["const"], "NONE_OF_THESE")
        self.assertEqual(decisions["allOf"][1]["contains"]["const"], "IT_DEPENDS")

    def test_review_export_requires_condition_for_depends(self):
        schema = self.schemas["schemas/r30j0_p2_owner_persona_review_export_v2.schema.json"]
        response = schema["$defs"]["response"]
        depends = response["allOf"][0]
        self.assertEqual(depends["if"]["properties"]["review_action"]["const"], "DEPENDS")
        self.assertEqual(depends["then"]["properties"]["condition"]["$ref"], "#/$defs/nonBlankOwnerText")
        self.assertFalse(schema["properties"]["profile_frozen"]["const"])
        self.assertFalse(schema["properties"]["training_authorized"]["const"])

    def test_schema_contracts_do_not_offer_raw_excerpt_or_personal_fact_fields(self):
        forbidden = {"raw_text", "excerpt", "private_excerpt", "personal_fact", "owner_profile_value"}
        for name, schema in self.schemas.items():
            self.assertTrue(forbidden.isdisjoint(property_keys(schema)), name)

    def test_no_training_architecture_api_or_deployment_authority(self):
        state = self.config["training_state"]
        self.assertFalse(state["training_started"])
        self.assertEqual(state["classification_updates"], 0)
        self.assertEqual(state["optimizer_tokens"], 0)
        self.assertIsNone(state["checkpoint"])
        self.assertIsNone(state["candidate"])
        self.assertFalse(state["r30j1_authorized"])
        execution = self.config["execution_boundary"]
        self.assertEqual(execution["api_requests"], 0)
        self.assertFalse(execution["deployment_allowed"])
        self.assertFalse(execution["model_architecture_change_allowed"])

    def test_methodology_states_safety_and_non_freeze_contract(self):
        text = (ROOT / "docs" / "R30J0_P2_PERSONA_EXCAVATION_METHOD.md").read_text(encoding="utf-8")
        for marker in (
            "Eight-layer",
            "REAL_UNCERTAINTY",
            "PLAYFUL_FAUX_IGNORANCE",
            "ROLEPLAYED_IGNORANCE",
            "REFUSAL_TO_OVEREXPLAIN",
            "DEADPAN_MISDIRECTION",
            "A mode without a negative boundary is invalid",
            "allowed_for_training=false",
            "R30J1",
        ):
            self.assertIn(marker, text)
        self.assertIn("must not infer psychological type", text)


if __name__ == "__main__":
    unittest.main()
