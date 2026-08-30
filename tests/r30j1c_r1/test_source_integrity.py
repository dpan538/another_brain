from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from src.personal_judge.r30j1c_r1_source_integrity import (
    SourceIntegrityError,
    build_blocked_reports,
    validate_j1a_blocker,
    validate_persona_blocker,
)


ROOT = Path(__file__).resolve().parents[2]


def load_finalizer():
    path = ROOT / "scripts" / "r30j1c_r1_finalize_blocked.py"
    spec = importlib.util.spec_from_file_location("r30j1c_r1_finalizer_test", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


FINALIZER = load_finalizer()


def j1a_blocker() -> dict:
    return {
        "schema_version": "r30j1c-r1.j1a-source-pool-blocked-receipt.v1",
        "status": "BLOCKED_SOURCE_INTEGRITY",
        "failure_codes": [
            "J1A_DEV_SOURCE_VAULT_EMPTY",
            "J1A_DEV_REQUIRED_INPUT_GAP",
            "J1A_DEV_PROVENANCE_ANCHOR_UNAVAILABLE",
        ],
        "source_scope": "J1A_TRAIN_DEV_DIAGNOSTIC_ONLY",
        "logical_source_root": "artifacts/r30j1a/dataset",
        "audit_method": "FIXED_LOGICAL_PATH_LSTAT_ONLY",
        "source_vault_exists": True,
        "source_root_state": "SAFE_DIRECTORY",
        "source_directory_enumerated": False,
        "required_input_group_count": 4,
        "satisfied_input_group_count": 0,
        "required_inputs_present": False,
        "provenance_anchor_available": False,
        "ready_path_authorized": False,
        "available_counts": None,
        "safe_regular_file_count_observed": 0,
        "unsafe_path_count_observed": 0,
        "selected_counts": {
            "AUTHENTIC_OWNER_FALSE_NEGATIVE": 0,
            "CONTROLLED_GENERIC_FALSE_POSITIVE": 0,
            "REGISTER_CONFUSION": 0,
            "SHORTCUT_PAIR": 0,
        },
        "selected_total": 0,
        "source_rows_written": False,
        "source_content_read": False,
        "heldout_path_opened": False,
        "heldout_content_read": False,
        "heldout_content_read_claim": "NO_HELDOUT_PATH_OR_CONTENT_OPENED",
        "heldout_used": False,
        "heldout_derived_content_used": False,
        "sealed_evaluation_used": False,
        "private_owner_text_reported": False,
        "allowed_for_training": False,
        "model_rerun_performed": False,
        "training_started": False,
        "optimizer_tokens": 0,
        "classification_updates": 0,
        "assistant_target_tokens": 0,
        "api_requests": 0,
        "gold_admission": False,
    }


def persona_blocker() -> dict:
    return {
        "version": "r30j1c-r1.persona-source-integrity-block.v1",
        "status": "BLOCKED_SOURCE_INTEGRITY",
        "error_code": "required_populated_source_unavailable",
        "audit_method": "FIXED_LOGICAL_PATH_LSTAT_ONLY",
        "p2_logical_source_root": "artifacts/r30j0/persona_excavation",
        "p2_source_root_state": "SAFE_DIRECTORY",
        "p2_source_vault_exists": True,
        "p2_required_file_count": 8,
        "p2_populated_file_count": 0,
        "p2_unsafe_path_count": 0,
        "manual_logical_source_root": "artifacts/r30j1c/manual_owner_evidence/current",
        "manual_source_root_state": "SAFE_DIRECTORY",
        "manual_source_vault_exists": True,
        "manual_required_file_count": 7,
        "manual_populated_file_count": 0,
        "manual_unsafe_path_count": 0,
        "source_directory_enumerated": False,
        "p2_required_inputs_present": False,
        "manual_required_inputs_present": False,
        "required_input_gap": True,
        "provenance_anchors_available": False,
        "ready_path_authorized": False,
        "validation_failed": False,
        "source_content_read": False,
        "heldout_content_read": False,
        "heldout_content_read_claim": "NO_SOURCE_CONTENT_OPENED_BEFORE_INPUT_GAP",
        "source_rows_written": 0,
        "heldout_used": False,
        "api_requests": 0,
        "training_started": False,
        "optimizer_tokens": 0,
        "classification_updates": 0,
        "assistant_target_tokens": 0,
        "gold_admission": False,
    }


def governance_gate() -> dict:
    return {
        "schema_version": "r30j1c-r1.no-production-change-gate.v1",
        "passed": True,
        "branch": "main",
        "base_is_ancestor": True,
        "changed_path_count": 20,
        "unexpected_path_count": 0,
        "production_surface_diff_count": 0,
        "forbidden_path_count": 0,
        "unsafe_change_status_count": 0,
        "private_absolute_path_count": 0,
        "secret_material_count": 0,
        "network_call_code_count": 0,
        "unsafe_file_type_count": 0,
        "oversized_public_contract_file_count": 0,
        "historical_state_diff_count": 0,
        "package_contract": {"passed": True},
    }


class R30J1CR1SourceIntegrityTests(unittest.TestCase):
    def test_missing_counts_remain_unknown(self):
        reports = build_blocked_reports(
            j1a_blocker(), persona_blocker(),
            git_state={
                "head": "a" * 40,
                "origin_main": "a" * 40,
                "head_equals_origin_main": True,
                "worktree_clean": True,
            },
            governance_gate=governance_gate(),
            created_at="2026-08-30T00:00:00Z",
        )
        integrity = reports["source_integrity_report.json"]
        receipt = reports["pack_receipt.json"]
        self.assertIsNone(integrity["j1a"]["real_dev_error_count_available"])
        self.assertIsNone(integrity["p2"]["unresolved_high_information_item_count_available"])
        self.assertFalse(receipt["pack_created"])
        self.assertEqual(receipt["planned_total_decision_items"], 62)
        self.assertEqual(receipt["total_decision_items"], 0)
        self.assertFalse(reports["reports/final_terminal.json"]["heldout_content_read"])

    def test_j1a_absence_cannot_be_reported_as_observed_zero(self):
        bad = copy.deepcopy(j1a_blocker())
        bad["available_counts"] = {"real_errors": 0}
        with self.assertRaisesRegex(SourceIntegrityError, "unknown"):
            validate_j1a_blocker(bad)

    def test_j1a_blocker_rejects_heldout_or_rerun(self):
        for key in (
            "heldout_used", "heldout_path_opened", "heldout_content_read",
            "heldout_derived_content_used", "sealed_evaluation_used",
            "private_owner_text_reported", "model_rerun_performed",
        ):
            bad = copy.deepcopy(j1a_blocker())
            bad[key] = True
            with self.assertRaises(SourceIntegrityError, msg=key):
                validate_j1a_blocker(bad)

    def test_persona_sources_are_counted_independently(self):
        validate_persona_blocker(persona_blocker())
        bad = copy.deepcopy(persona_blocker())
        bad["p2_populated_file_count"] = bad["p2_required_file_count"]
        bad["p2_required_inputs_present"] = True
        validate_persona_blocker(bad)
        bad["manual_populated_file_count"] = bad["manual_required_file_count"]
        bad["manual_required_inputs_present"] = True
        bad["required_input_gap"] = False
        bad["error_code"] = "trusted_provenance_anchor_unavailable"
        bad["heldout_content_read_claim"] = "NO_SOURCE_CONTENT_OPENED_DURING_PROVENANCE_BLOCK"
        bad["validation_failed"] = False
        validate_persona_blocker(bad)
        bad["required_input_gap"] = True
        with self.assertRaisesRegex(SourceIntegrityError, "input_gap"):
            validate_persona_blocker(bad)

    def test_blocker_counts_and_zero_boundaries_reject_booleans_or_conflicts(self):
        bad = copy.deepcopy(j1a_blocker())
        bad["api_requests"] = False
        with self.assertRaisesRegex(SourceIntegrityError, "api_requests"):
            validate_j1a_blocker(bad)
        bad = copy.deepcopy(j1a_blocker())
        bad["selected_counts"]["REGISTER_CONFUSION"] = 1
        with self.assertRaisesRegex(SourceIntegrityError, "selected_counts"):
            validate_j1a_blocker(bad)
        bad_persona = copy.deepcopy(persona_blocker())
        bad_persona["p2_populated_file_count"] = 8
        bad_persona["p2_required_inputs_present"] = True
        bad_persona["required_input_gap"] = False
        with self.assertRaisesRegex(SourceIntegrityError, "input_gap_mismatch"):
            validate_persona_blocker(bad_persona)
        bad_persona = copy.deepcopy(persona_blocker())
        bad_persona["source_content_read"] = True
        bad_persona["heldout_content_read"] = None
        bad_persona["heldout_content_read_claim"] = "NOT_ASSERTED_AFTER_SOURCE_READ"
        with self.assertRaisesRegex(SourceIntegrityError, "source_content_was_read"):
            validate_persona_blocker(bad_persona)

    def test_partial_block_is_not_training_or_gold(self):
        reports = build_blocked_reports(
            j1a_blocker(), persona_blocker(),
            git_state={
                "head": "b" * 40,
                "origin_main": "b" * 40,
                "head_equals_origin_main": True,
                "worktree_clean": True,
            },
            governance_gate=governance_gate(),
            created_at="2026-08-30T00:00:00Z",
        )
        for report in reports.values():
            self.assertFalse(report["training_started"])
            self.assertEqual(report["optimizer_tokens"], 0)
            self.assertFalse(report["gold_admission"])

    def test_terminal_governance_claims_require_independent_gate_counts(self):
        reports = build_blocked_reports(
            j1a_blocker(), persona_blocker(),
            git_state={
                "head": "c" * 40,
                "origin_main": "c" * 40,
                "head_equals_origin_main": True,
                "worktree_clean": True,
            },
            governance_gate=governance_gate(),
            created_at="2026-08-30T00:00:00Z",
        )
        terminal = reports["reports/final_terminal.json"]
        self.assertTrue(terminal["no_private_source_committed"])
        self.assertTrue(terminal["no_production_change"])
        self.assertTrue(terminal["no_deployment"])
        bad = governance_gate()
        bad["production_surface_diff_count"] = 1
        with self.assertRaisesRegex(SourceIntegrityError, "production_surface"):
            build_blocked_reports(
                j1a_blocker(), persona_blocker(),
                git_state={
                    "head": "c" * 40,
                    "origin_main": "c" * 40,
                    "head_equals_origin_main": True,
                    "worktree_clean": True,
                },
                governance_gate=bad,
                created_at="2026-08-30T00:00:00Z",
            )

    def test_finalizer_preflights_exact_receipts_before_read(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            original_root, original_output = FINALIZER.ROOT, FINALIZER.DEFAULT_OUTPUT
            try:
                FINALIZER.ROOT = base
                FINALIZER.DEFAULT_OUTPUT = base / "owner_correction_pack"
                source_pool = FINALIZER.DEFAULT_OUTPUT / "source_pool"
                source_pool.mkdir(parents=True)
                outside = base / "sealed-private.json"
                outside.write_text("NOT JSON AND MUST NOT BE READ", encoding="utf-8")
                with self.assertRaisesRegex(SourceIntegrityError, "not_allowlisted"):
                    FINALIZER._preflight_receipt(
                        outside, "j1a_source_pool_blocked_receipt.json",
                    )
                real = base / "real.json"
                real.write_text(json.dumps(j1a_blocker()), encoding="utf-8")
                symlink = source_pool / "j1a_source_pool_blocked_receipt.json"
                symlink.symlink_to(real)
                with self.assertRaisesRegex(SourceIntegrityError, "symlink"):
                    FINALIZER._preflight_receipt(
                        symlink, "j1a_source_pool_blocked_receipt.json",
                    )
            finally:
                FINALIZER.ROOT, FINALIZER.DEFAULT_OUTPUT = original_root, original_output

    def test_finalizer_output_outside_repository_is_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            outside = Path(directory) / "owner_correction_pack"
            original_root, original_output = FINALIZER.ROOT, FINALIZER.DEFAULT_OUTPUT
            try:
                FINALIZER.ROOT = ROOT
                FINALIZER.DEFAULT_OUTPUT = outside
                with self.assertRaisesRegex(SourceIntegrityError, "outside_repository"):
                    FINALIZER._assert_local_output(outside)
            finally:
                FINALIZER.ROOT, FINALIZER.DEFAULT_OUTPUT = original_root, original_output


if __name__ == "__main__":
    unittest.main()
