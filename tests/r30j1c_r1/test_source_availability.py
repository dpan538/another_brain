from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock

from src.personal_judge.r30j1c_r1_source_integrity import (
    SourceIntegrityError,
    validate_j1a_blocker,
    validate_persona_blocker,
)


ROOT = Path(__file__).resolve().parents[2]


def load_script(name: str, relative: str):
    path = ROOT / relative
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


AUDIT = load_script(
    "r30j1c_r1_source_availability_test",
    "scripts/r30j1c_r1_audit_source_availability.py",
)
FINALIZER = load_script(
    "r30j1c_r1_finalizer_binding_test",
    "scripts/r30j1c_r1_finalize_blocked.py",
)


def populate(repo: Path, logical_root: Path, names: tuple[str, ...]) -> None:
    for name in names:
        path = repo / logical_root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("public-safe fixture\n", encoding="utf-8")


class R30J1CR1SourceAvailabilityTests(unittest.TestCase):
    def test_all_fixed_roots_missing_is_honest_blocker(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            audit = AUDIT.audit_source_availability(repo)
            self.assertEqual(audit["status"], AUDIT.BLOCKED)
            self.assertEqual(audit["j1a"]["root"]["state"], "MISSING")
            self.assertFalse(audit["j1a"]["root"]["exists"])
            self.assertEqual(audit["p2"]["safe_regular_file_count"], 0)
            self.assertEqual(audit["manual"]["safe_regular_file_count"], 0)
            j1a = AUDIT._j1a_receipt(audit)
            persona = AUDIT._persona_receipt(audit)
            self.assertIn("J1A_DEV_SOURCE_VAULT_MISSING", j1a["failure_codes"])
            self.assertNotIn("J1A_DEV_SOURCE_VAULT_EMPTY", j1a["failure_codes"])
            validate_j1a_blocker(j1a)
            validate_persona_blocker(persona)

    def test_empty_partial_and_zero_byte_files_are_not_available(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            (repo / AUDIT.J1A_ROOT).mkdir(parents=True)
            empty_audit = AUDIT.audit_source_availability(repo)
            empty_receipt = AUDIT._j1a_receipt(empty_audit)
            self.assertIn("J1A_DEV_SOURCE_VAULT_EMPTY", empty_receipt["failure_codes"])

            manifest = repo / AUDIT.J1A_ROOT / "dataset_manifest.json"
            manifest.touch()
            dev = repo / AUDIT.J1A_ROOT / "dev.jsonl"
            dev.write_text("fixture\n", encoding="utf-8")
            partial = AUDIT.audit_source_availability(repo)
            states = {row["logical_path"]: row["state"] for row in partial["j1a"]["fixed_files"]}
            self.assertEqual(states[(AUDIT.J1A_ROOT / "dataset_manifest.json").as_posix()], "EMPTY_REGULAR")
            self.assertEqual(partial["j1a"]["safe_regular_file_count"], 1)
            self.assertFalse(partial["j1a"]["required_inputs_present"])
            self.assertIn("J1A_DEV_REQUIRED_INPUT_PARTIAL", AUDIT._j1a_receipt(partial)["failure_codes"])

    def test_complete_allowlisted_layout_is_present_but_not_authorized(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            populate(repo, AUDIT.J1A_ROOT, AUDIT.J1A_FIXED_FILES)
            populate(repo, AUDIT.J1A_ROOT, ("dev_predictions_c.jsonl",))
            populate(repo, AUDIT.P2_ROOT, AUDIT.P2_REQUIRED_FILES)
            populate(repo, AUDIT.MANUAL_ROOT, AUDIT.MANUAL_REQUIRED_FILES)
            audit = AUDIT.audit_source_availability(repo)
            self.assertEqual(audit["status"], AUDIT.BLOCKED)
            self.assertEqual(audit["availability_state"], AUDIT.PRESENT)
            self.assertTrue(audit["j1a"]["required_inputs_present"])
            self.assertTrue(audit["p2"]["required_inputs_present"])
            self.assertTrue(audit["manual"]["required_inputs_present"])
            self.assertFalse(audit["ready_path_authorized"])
            j1a = AUDIT._j1a_receipt(audit)
            persona = AUDIT._persona_receipt(audit)
            self.assertEqual(j1a["status"], AUDIT.BLOCKED)
            self.assertIn("J1A_DEV_PROVENANCE_ANCHOR_UNAVAILABLE", j1a["failure_codes"])
            self.assertTrue(j1a["required_inputs_present"])
            self.assertEqual(persona["status"], AUDIT.BLOCKED)
            self.assertEqual(persona["error_code"], "trusted_provenance_anchor_unavailable")
            self.assertFalse(persona["required_input_gap"])
            validate_j1a_blocker(j1a)
            validate_persona_blocker(persona)

    def test_mixed_source_availability_still_emits_valid_bound_blockers(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            populate(repo, AUDIT.J1A_ROOT, AUDIT.J1A_FIXED_FILES)
            populate(repo, AUDIT.J1A_ROOT, ("dev_predictions_c.jsonl",))
            populate(repo, AUDIT.P2_ROOT, AUDIT.P2_REQUIRED_FILES)
            audit = AUDIT.audit_source_availability(repo)
            self.assertTrue(audit["j1a"]["required_inputs_present"])
            self.assertTrue(audit["p2"]["required_inputs_present"])
            self.assertFalse(audit["manual"]["required_inputs_present"])
            j1a = AUDIT._j1a_receipt(audit)
            persona = AUDIT._persona_receipt(audit)
            self.assertEqual(j1a["status"], AUDIT.BLOCKED)
            self.assertEqual(persona["status"], AUDIT.BLOCKED)
            self.assertTrue(persona["required_input_gap"])
            validate_j1a_blocker(j1a)
            validate_persona_blocker(persona)

    def test_symlink_is_recorded_unsafe_and_never_followed(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            root = repo / AUDIT.J1A_ROOT
            root.mkdir(parents=True)
            target = repo / "outside.txt"
            target.write_text("must not be opened\n", encoding="utf-8")
            (root / "dataset_manifest.json").symlink_to(target)
            audit = AUDIT.audit_source_availability(repo)
            self.assertGreater(audit["j1a"]["unsafe_path_count"], 0)
            self.assertIn("J1A_DEV_SOURCE_PATH_UNSAFE", AUDIT._j1a_receipt(audit)["failure_codes"])

    def test_optional_prediction_symlink_blocks_even_when_required_groups_are_satisfied(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            populate(repo, AUDIT.J1A_ROOT, AUDIT.J1A_FIXED_FILES)
            populate(repo, AUDIT.J1A_ROOT, ("dev_predictions_c.jsonl",))
            target = repo / "outside.txt"
            target.write_text("must not be opened\n", encoding="utf-8")
            (repo / AUDIT.J1A_ROOT / "dev_predictions_d.jsonl").symlink_to(target)

            audit = AUDIT.audit_source_availability(repo)
            self.assertEqual(
                audit["j1a"]["satisfied_input_group_count"],
                audit["j1a"]["required_input_group_count"],
            )
            self.assertFalse(audit["j1a"]["required_inputs_present"])
            receipt = AUDIT._j1a_receipt(audit)
            self.assertIn("J1A_DEV_SOURCE_PATH_UNSAFE", receipt["failure_codes"])
            validate_j1a_blocker(receipt)

    def test_audit_does_not_enumerate_or_read_source_content(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            (repo / AUDIT.J1A_ROOT).mkdir(parents=True)
            (repo / AUDIT.J1A_ROOT / "sealed-evaluation-sentinel.bin").write_bytes(b"trap")
            with (
                mock.patch("os.listdir", side_effect=AssertionError("directory enumeration")),
                mock.patch("os.scandir", side_effect=AssertionError("directory enumeration")),
                mock.patch.object(Path, "iterdir", side_effect=AssertionError("directory enumeration")),
                mock.patch.object(Path, "glob", side_effect=AssertionError("directory enumeration")),
                mock.patch.object(Path, "rglob", side_effect=AssertionError("directory enumeration")),
                mock.patch.object(Path, "open", side_effect=AssertionError("source content read")),
                mock.patch.object(Path, "read_text", side_effect=AssertionError("source content read")),
                mock.patch.object(Path, "read_bytes", side_effect=AssertionError("source content read")),
            ):
                audit = AUDIT.audit_source_availability(repo)
            self.assertFalse(audit["source_directory_enumerated"])
            self.assertFalse(audit["source_content_read"])
            self.assertFalse(audit["heldout_path_opened"])

    def test_fixed_writer_permissions_and_arbitrary_output_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            output = repo / "artifacts/r30j1c/owner_correction_pack/source_pool"
            summary = AUDIT.write_fixed_audit(repo, output)
            self.assertEqual(summary["status"], AUDIT.BLOCKED)
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
            for name in (
                "source_availability_audit.json",
                "j1a_source_pool_blocked_receipt.json",
                "source_integrity_blocked.json",
            ):
                self.assertEqual(stat.S_IMODE((output / name).stat().st_mode), 0o600)
            with self.assertRaisesRegex(ValueError, "fixed_ignored"):
                AUDIT.write_fixed_audit(repo, repo / "elsewhere")

    def test_output_parent_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            outside = repo / "outside"
            outside.mkdir()
            (repo / "artifacts").symlink_to(outside, target_is_directory=True)
            output = repo / "artifacts/r30j1c/owner_correction_pack/source_pool"
            with self.assertRaisesRegex(ValueError, "real_directory"):
                AUDIT.write_fixed_audit(repo, output)

    def test_finalizer_repeats_live_audit_and_rejects_stale_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            output = repo / "artifacts/r30j1c/owner_correction_pack/source_pool"
            AUDIT.write_fixed_audit(repo, output)
            old_root, old_output = FINALIZER.ROOT, FINALIZER.DEFAULT_OUTPUT
            try:
                FINALIZER.ROOT = repo
                FINALIZER.DEFAULT_OUTPUT = output.parent
                j1a, persona = FINALIZER._load_live_bound_receipts(output)
                validate_j1a_blocker(j1a)
                validate_persona_blocker(persona)
                changed = repo / AUDIT.J1A_ROOT / "dev.jsonl"
                changed.parent.mkdir(parents=True)
                changed.write_text("appeared later\n", encoding="utf-8")
                with self.assertRaisesRegex(SourceIntegrityError, "stale_or_mutated"):
                    FINALIZER._load_live_bound_receipts(output)
            finally:
                FINALIZER.ROOT, FINALIZER.DEFAULT_OUTPUT = old_root, old_output

    def test_fixed_cli_has_no_source_or_output_arguments(self):
        source = (ROOT / "scripts/r30j1c_r1_audit_source_availability.py").read_text(encoding="utf-8")
        self.assertNotIn("add_argument", source)
        self.assertNotIn("iterdir(", source)
        self.assertNotIn("rglob(", source)
        self.assertNotIn("os.listdir", source)
        self.assertNotIn("os.scandir", source)


if __name__ == "__main__":
    unittest.main()
