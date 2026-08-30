from __future__ import annotations

import copy
import unittest

from src.personal_judge.r30j1c_r1_contract import (
    ContractError,
    canonical_review_hash,
    validate_correction_record,
    validate_pack,
    validate_partial_export,
)
from tests.r30j1c_r1.test_contract_ui import (
    PACK_SCHEMA,
    RECORD_SCHEMA,
    VALIDATE_SCHEMA,
    browser_partial_export,
    browser_pending_record,
    rehash_browser_export,
    rehash_pack,
    synthetic_pack,
    valid_record,
)


class R30J1CR1SchemaHardeningTests(unittest.TestCase):
    """Cross-check the tracked schemas and the fail-closed Python contract."""

    @classmethod
    def setUpClass(cls):
        cls.pack = synthetic_pack()

    def assert_pack_rejected_by_both(self, value):
        with self.assertRaises(AssertionError):
            VALIDATE_SCHEMA(value, PACK_SCHEMA)
        with self.assertRaises(ContractError):
            validate_pack(value)

    def assert_record_rejected_by_both(self, value):
        with self.assertRaises(AssertionError):
            VALIDATE_SCHEMA(value, RECORD_SCHEMA)
        with self.assertRaises(ContractError):
            validate_correction_record(value)

    def item(self, pack, kind):
        return next(
            row for row in pack["decision_items"]
            if row["item_kind"] == kind and not row["blind_repeat"]
        )

    def test_kind_session_and_source_mismatches_are_rejected(self):
        wrong_session = copy.deepcopy(self.pack)
        item = self.item(wrong_session, "REGISTER_BOUNDARY")
        item["session_id"] = "SESSION_3"
        item["item_id"] = item["item_id"].replace("-S2-", "-S3-")
        rehash_pack(wrong_session)
        self.assert_pack_rejected_by_both(wrong_session)

        wrong_source = copy.deepcopy(self.pack)
        self.item(wrong_source, "REGISTER_BOUNDARY")["source_kind"] = "J1A_DEV_ERROR"
        rehash_pack(wrong_source)
        self.assert_pack_rejected_by_both(wrong_source)

        wrong_shortcut_source = copy.deepcopy(self.pack)
        self.item(wrong_shortcut_source, "SHORTCUT_PAIR")["source_kind"] = "J1A_DEV_ERROR"
        rehash_pack(wrong_shortcut_source)
        self.assert_pack_rejected_by_both(wrong_shortcut_source)

    def test_comparison_candidate_cardinality_and_ids_are_exact(self):
        no_candidates = copy.deepcopy(self.pack)
        self.item(no_candidates, "REGISTER_BOUNDARY")["candidates"] = []
        rehash_pack(no_candidates)
        self.assert_pack_rejected_by_both(no_candidates)

        duplicate_ids = copy.deepcopy(self.pack)
        candidates = self.item(duplicate_ids, "SHORTCUT_PAIR")["candidates"]
        candidates[1]["option_id"] = "A"
        candidates[1]["response_text"] += " distinct"
        rehash_pack(duplicate_ids)
        self.assert_pack_rejected_by_both(duplicate_ids)

    def test_decision_option_sets_are_exact_not_just_same_length(self):
        for kind in (
            "AUTHENTIC_REPRESENTATIVENESS",
            "GENERIC_FALSE_POSITIVE",
            "REGISTER_CLASSIFICATION",
            "SHORTCUT_PAIR",
        ):
            value = copy.deepcopy(self.pack)
            options = self.item(value, kind)["decision_options"]
            options[-1] = {
                "value": options[0]["value"],
                "label": "Distinct duplicate label",
            }
            rehash_pack(value)
            with self.subTest(kind=kind):
                self.assert_pack_rejected_by_both(value)

        three_way = copy.deepcopy(self.pack)
        item = next(
            row for row in three_way["decision_items"]
            if row["item_kind"] == "REGISTER_BOUNDARY"
            and not row["blind_repeat"]
            and row["item_id"] not in {
                repeat["repeat_of"]
                for repeat in three_way["decision_items"]
                if repeat["blind_repeat"]
            }
        )
        candidate_c = copy.deepcopy(item["candidates"][1])
        candidate_c["option_id"] = "C"
        candidate_c["response_text"] += " C"
        candidate_c["canonical_option_ref"] = candidate_c["canonical_option_ref"][:-1] + "c"
        item["candidates"].append(candidate_c)
        item["decision_options"].insert(2, {"value": "PREFER_C", "label": "Fixture PREFER_C"})
        rehash_pack(three_way)
        VALIDATE_SCHEMA(three_way, PACK_SCHEMA)
        validate_pack(three_way)

        item["decision_options"][2] = {"value": "PREFER_A", "label": "Distinct duplicate A"}
        rehash_pack(three_way)
        self.assert_pack_rejected_by_both(three_way)

    def test_reverse_reason_contract_is_complete_and_linked_to_choices(self):
        wrong_reason_set = copy.deepcopy(self.pack)
        reverse = self.item(wrong_reason_set, "REVERSE_CONTROL")
        reverse["reason_options"][-1] = {
            "value": "WRONG_REGISTER",
            "label": "Distinct duplicate reason",
        }
        rehash_pack(wrong_reason_set)
        self.assert_pack_rejected_by_both(wrong_reason_set)

        missing_requirement = copy.deepcopy(self.pack)
        self.item(missing_requirement, "REVERSE_CONTROL")["reason_required_for"] = []
        rehash_pack(missing_requirement)
        self.assert_pack_rejected_by_both(missing_requirement)

        impossible_requirement = copy.deepcopy(self.pack)
        self.item(impossible_requirement, "REVERSE_CONTROL")["reason_required_for"] = ["PREFER_C"]
        rehash_pack(impossible_requirement)
        self.assert_pack_rejected_by_both(impossible_requirement)

    def test_s5_privacy_category_and_unprimed_contracts_are_fail_closed(self):
        mutations = (
            ("privacy_review_pass", False),
            ("contains_third_party_identity", True),
            ("elicitation_category", "UNKNOWN_CATEGORY"),
            ("candidate_answers_shown", True),
            ("minimum_characters", False),
        )
        for field, replacement in mutations:
            value = copy.deepcopy(self.pack)
            value["owner_write_prompts"][0][field] = replacement
            rehash_pack(value)
            with self.subTest(field=field):
                self.assert_pack_rejected_by_both(value)

    def test_custom_distribution_checks_cover_s2_and_s5(self):
        s2 = copy.deepcopy(self.pack)
        for item in s2["decision_items"]:
            if item["session_id"] == "SESSION_2":
                item["register"] = "CASUAL"
        rehash_pack(s2)
        with self.assertRaisesRegex(ContractError, "session2_.*_distribution"):
            validate_pack(s2)

        s5 = copy.deepcopy(self.pack)
        for prompt in s5["owner_write_prompts"]:
            if prompt["elicitation_category"] == "ORDINARY_CHAT":
                prompt["elicitation_category"] = "PLAYFUL"
        rehash_pack(s5)
        with self.assertRaisesRegex(ContractError, "owner_write_distribution"):
            validate_pack(s5)

    def test_typed_consts_prevent_python_boolean_integer_equivalence(self):
        mutations = (
            (lambda value: value.__setitem__("api_requests", False), "api_requests"),
            (lambda value: value.__setitem__("local_only", 1), "local_only"),
            (
                lambda value: value["training_state"].__setitem__("optimizer_tokens", False),
                "optimizer_tokens",
            ),
        )
        for mutate, name in mutations:
            value = copy.deepcopy(self.pack)
            mutate(value)
            rehash_pack(value)
            with self.subTest(name=name):
                self.assert_pack_rejected_by_both(value)

        record_item = self.item(self.pack, "SHORTCUT_PAIR")
        record = browser_pending_record(record_item)
        record["training_started"] = 0
        record["review_hash"] = None
        record["review_hash"] = canonical_review_hash(record)
        self.assert_record_rejected_by_both(record)

    def test_coverage_and_source_summary_require_exact_integer_types(self):
        for section, field, replacement in (
            ("coverage", "decision_item_count", False),
            ("coverage", "blind_repeat_count", 6.0),
            ("source_summary", "j1a_dev_error_count", False),
            ("source_summary", "distinct_source_family_count", 30.0),
        ):
            value = copy.deepcopy(self.pack)
            value[section][field] = replacement
            rehash_pack(value)
            with self.subTest(section=section, field=field):
                self.assert_pack_rejected_by_both(value)

    def test_standalone_record_binds_item_id_to_session(self):
        item = self.item(self.pack, "SHORTCUT_PAIR")
        record = browser_pending_record(item)
        record["session_id"] = "SESSION_2"
        record["review_hash"] = None
        record["review_hash"] = canonical_review_hash(record)
        self.assert_record_rejected_by_both(record)

    def test_record_and_partial_export_require_strict_utc_and_pending_metadata(self):
        item = self.item(self.pack, "SHORTCUT_PAIR")
        record = browser_pending_record(item)
        record["completed_at"] = "2026-08-30T00:00:00+00:00"
        record["review_hash"] = None
        record["review_hash"] = canonical_review_hash(record)
        self.assert_record_rejected_by_both(record)

        strict_export = browser_partial_export(
            self.pack,
            item["session_id"],
            [browser_pending_record(item)],
        )
        strict_export["completed_at"] = "2026-08-30T00:00:00+00:00"
        rehash_browser_export(strict_export)
        with self.assertRaisesRegex(ContractError, "export_completed_at"):
            validate_partial_export(strict_export, self.pack)

        reconciled = valid_record(item)
        export = browser_partial_export(self.pack, item["session_id"], [reconciled])
        with self.assertRaisesRegex(ContractError, "export_record_reconciled"):
            validate_partial_export(export, self.pack)

    def test_partial_export_revalidates_pack_before_accepting_rehashed_export(self):
        item = self.item(self.pack, "SHORTCUT_PAIR")
        export = browser_partial_export(
            self.pack,
            item["session_id"],
            [browser_pending_record(item)],
        )
        mutated_pack = copy.deepcopy(self.pack)
        self.item(mutated_pack, "SHORTCUT_PAIR")["question_text"] += " changed"
        export["review_hash"] = None
        rehash_browser_export(export)
        with self.assertRaisesRegex(ContractError, "manifest_sha_mismatch"):
            validate_partial_export(export, mutated_pack)

    def test_display_authenticity_markers_are_hidden_except_ownership_scope(self):
        markers = (
            "Synthetic response",
            "authentic response",
            "owner-written response",
            "合成回答",
            "这是本人写的",
        )
        for marker in markers:
            value = copy.deepcopy(self.pack)
            hidden = next(
                row for row in value["decision_items"]
                if row["source_identity_hidden"] and not row["blind_repeat"]
            )
            hidden["context_text"] = marker
            rehash_pack(value)
            with self.subTest(marker=marker), self.assertRaisesRegex(
                ContractError, "display_authenticity_leak"
            ):
                validate_pack(value)

        ownership = copy.deepcopy(self.pack)
        visible = self.item(ownership, "AUTHENTIC_REPRESENTATIVENESS")
        visible["question_text"] = "Is this an authentic response?"
        rehash_pack(ownership)
        validate_pack(ownership)


if __name__ == "__main__":
    unittest.main()
