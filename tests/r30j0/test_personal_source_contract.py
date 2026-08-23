import hashlib
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "r30j0_source_evidence_contract",
    ROOT / "src" / "personal_judge" / "source_evidence_contract.py",
)
assert SPEC and SPEC.loader
CONTRACT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTRACT)
DISCOVERY_SPEC = importlib.util.spec_from_file_location(
    "r30j0_discover_personal_sources",
    ROOT / "scripts" / "r30j0_discover_personal_sources.py",
)
assert DISCOVERY_SPEC and DISCOVERY_SPEC.loader
DISCOVERY = importlib.util.module_from_spec(DISCOVERY_SPEC)
DISCOVERY_SPEC.loader.exec_module(DISCOVERY)


def load_json(relative: str):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


class TestR30J0PersonalSourceContract(unittest.TestCase):
    def test_exact_authorship_taxonomy(self):
        self.assertEqual(
            CONTRACT.AUTHORSHIP_CLASSES,
            (
                "OWNER_AUTHORED_HIGH_CONFIDENCE",
                "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE",
                "OWNER_AUTHORED_EDITED",
                "MIXED_OWNER_AI",
                "AI_OR_CODEX_GENERATED",
                "THIRD_PARTY",
                "UNKNOWN",
            ),
        )

    def test_exact_source_type_taxonomy(self):
        self.assertEqual(
            CONTRACT.SOURCE_TYPES,
            (
                "casual_chinese",
                "casual_english",
                "spoken_answer_chinese",
                "spoken_answer_english",
                "reflective_writing",
                "project_explanation",
                "academic_writing",
                "formal_email_or_message",
                "short_message",
                "caption_or_microcopy",
                "creative_writing",
                "other",
            ),
        )

    def test_filename_is_not_authorship_evidence(self):
        digest = hashlib.sha256(b"synthetic public-safe fixture").hexdigest()
        self.assertEqual(CONTRACT.authorship_from_provenance(None, digest), "UNKNOWN")
        self.assertEqual(
            CONTRACT.discovery_exclusion_reason("private_sources/owner_writing.txt"),
            None,
        )

    def test_hash_bound_owner_transcript_provenance(self):
        digest = hashlib.sha256(b"synthetic public-safe owner answer").hexdigest()
        provenance = {
            "subject_sha256": digest,
            "authorship_class": "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE",
            "source_type": "spoken_answer_chinese",
            "attestation_kind": "TRANSCRIPT_PROCESS_RECORD",
            "review_status": "OWNER_APPROVED",
            "reviewed_by_role": "OWNER",
        }
        self.assertEqual(
            CONTRACT.authorship_from_provenance(provenance, digest),
            "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE",
        )
        self.assertEqual(CONTRACT.authorship_from_provenance(provenance, "0" * 64), "UNKNOWN")

    def test_sensitive_detection_returns_boolean_only(self):
        self.assertIs(CONTRACT.contains_sensitive_content("联系 synthetic@example.test"), True)
        self.assertIs(CONTRACT.contains_sensitive_content("公开安全的合成句子。"), False)

    def test_sensitive_or_unknown_sources_never_enter_training(self):
        sensitive = CONTRACT.selection_decision(
            "OWNER_AUTHORED_HIGH_CONFIDENCE",
            contains_sensitive_sections=True,
            review_status="OWNER_APPROVED",
        )
        unknown = CONTRACT.selection_decision(
            "UNKNOWN",
            contains_sensitive_sections=False,
            review_status="REVIEW_REQUIRED",
        )
        self.assertEqual(sensitive["personalization_priority"], "EXCLUDE")
        self.assertFalse(sensitive["allowed_for_style_analysis"])
        self.assertFalse(sensitive["allowed_for_training_candidate"])
        self.assertEqual(unknown["personalization_priority"], "QUARANTINE")
        self.assertFalse(unknown["allowed_for_training_candidate"])

    def test_literal_style_wrapper_contract(self):
        source = "如果条件成立，结论保持不变。"
        self.assertTrue(
            CONTRACT.style_wrapper_preserves_source(
                source,
                "简要说：" + source,
                "简要说：",
            )
        )
        self.assertFalse(
            CONTRACT.style_wrapper_preserves_source(
                source,
                "简要说：结论改变。",
                "简要说：",
            )
        )
        self.assertFalse(
            CONTRACT.style_wrapper_preserves_source(
                source,
                "不要说：" + source,
                "不要说：",
            )
        )

    def test_inventory_schema_forbids_training_and_raw_text(self):
        schema = load_json("schemas/personal_source_inventory_v1.schema.json")
        source = schema["$defs"]["source"]
        self.assertFalse(source["additionalProperties"])
        self.assertEqual(source["properties"]["allowed_for_training_candidate"]["const"], False)
        self.assertNotIn("raw_text", source["properties"])
        self.assertNotIn("excerpt", source["properties"])

    def test_evidence_ledger_exact_row_contract(self):
        schema = load_json("schemas/personal_preference_evidence_ledger_v1.schema.json")
        row = schema.get("$defs", {}).get("record") or schema.get("items") or schema
        required = {
            "evidence_id",
            "source_id",
            "evidence_type",
            "domain",
            "language",
            "proposed_dimension",
            "proposed_value",
            "confidence",
            "source_type",
            "owner_review_required",
            "sensitive_content_removed",
            "notes",
        }
        self.assertTrue(required.issubset(set(row["required"])))
        self.assertEqual(
            row["properties"]["evidence_type"]["enum"],
            [
                "descriptive_style",
                "explicit_preference",
                "explicit_rejection",
                "explicit_acceptance",
                "contrast_preference",
            ],
        )

    def test_register_profile_requires_six_registers(self):
        schema = load_json("schemas/personal_register_profile_v1.schema.json")
        self.assertEqual(
            schema["properties"]["registers"]["required"],
            [
                "ordinary_chat",
                "practical_answer",
                "logic_explanation",
                "philosophical_reflection",
                "project_discussion",
                "formal_message",
            ],
        )
        self.assertFalse(schema["properties"]["registers"]["additionalProperties"])

    def test_hypothesis_axis_values_are_dimension_bound(self):
        schema = load_json("schemas/personal_preference_hypotheses_v1.schema.json")
        item = schema["properties"]["hypotheses"]["items"]
        by_dimension = {
            rule["if"]["properties"]["dimension"]["const"]:
            set(rule["then"]["properties"]["candidate_value"]["enum"])
            for rule in item["allOf"]
        }
        self.assertEqual(by_dimension["response_density"], {"sparse", "compact", "moderate", None})
        self.assertNotIn("analytic", by_dimension["response_density"])
        self.assertEqual(by_dimension["philosophy_style"], {"concise_open", "dialectical", "analytic", None})

    def test_review_pack_has_defensive_sensitive_category_patterns(self):
        builder = (ROOT / "scripts" / "r30j0_build_personal_source_review_pack.mjs").read_text(encoding="utf-8")
        for marker in ("病史", "政治立场", "性取向", "犯罪记录", "银行账号", "第三方隐私", "员工编号"):
            self.assertIn(marker, builder)
        self.assertIn("(?:\\+?\\d[\\s().-]?){8,15}", builder)

    def test_future_baselines_are_distinct(self):
        baseline = load_json("config/r30j0_generic_baseline_v1.json")
        matrix = baseline["future_comparison_matrix"]
        self.assertEqual([row["arm"] for row in matrix], ["A", "B", "C", "D"])
        self.assertEqual(matrix[0]["name"], "generic_quality_rules")
        self.assertEqual(matrix[1]["name"], "generic_commercial_response_classifier")
        self.assertFalse(matrix[0]["owner_profile_access"])
        self.assertFalse(matrix[1]["owner_profile_access"])

    def test_r26_compound_gate_includes_split_duplicate_and_provenance(self):
        passed, evidence = DISCOVERY.transcript_process_evidence_ok()
        self.assertTrue(passed)
        self.assertEqual(evidence["split_counts"], {"dev": 10, "heldout": 10, "train": 78})
        self.assertEqual(evidence["normalized_target_duplicate_group_count"], 0)
        self.assertEqual(evidence["external_llm_false_count"], 98)
        self.assertEqual(evidence["provenance_private_false_count"], 98)
        self.assertEqual(evidence["training_allowed_count"], 98)

    def test_discovery_audits_full_current_tree(self):
        inventory, admitted, report = DISCOVERY.discover_repository_tree_candidates()
        self.assertGreater(report["repository_tree_files_seen"], 1000)
        self.assertGreater(report["inventory_candidate_count"], 0)
        self.assertEqual(report["read_error_count"], 0)
        self.assertTrue(report["full_tree_discovery_complete"])
        self.assertTrue(report["ignored_files_in_scope"])
        self.assertIsInstance(inventory, list)
        self.assertIsInstance(admitted, list)


if __name__ == "__main__":
    unittest.main()
