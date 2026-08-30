from __future__ import annotations

import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import random
import sys
import tempfile
import unittest
from unittest import mock


from src.personal_judge import r30j1c_r1_error_selection as selection_module
from src.personal_judge.r30j1c_r1_error_selection import (
    DEFAULT_TARGET_COUNTS,
    SelectionError,
    build_candidates,
    build_receipt,
    load_source_inputs,
    reject_forbidden_source_path,
    select_session1_source_pool,
    validate_prediction,
    validate_selected_pool,
    validate_shortcut_pair,
    write_source_pool,
)


def _dev_row(index: int, *, domain: str, register: str, kind: str) -> dict:
    return {
        "schema_version": "r30j1a.descriptive-example.v1",
        "example_id": f"synthetic_example_{index:03d}",
        "source_kind": kind,
        "source_ref": f"synthetic.source.{index:03d}",
        "source_group_id": f"synthetic_group_{index:03d}",
        "semantic_family_id": f"synthetic_semantic_{index:03d}",
        "mutation_family_id": f"synthetic_mutation_{index:03d}",
        "mutation_id": "original",
        "admission_class": "TRAINING_PUBLIC_SAFE",
        "domain_label": domain,
        "register_label": register,
        "mechanics_labels": [0] * 10,
        "context": f"合成上下文 {index}",
        "response": f"合成回答 {index}。",
        "serialized_text": f"合成上下文 {index} 合成回答 {index}。",
        "input_ids": [1, 2, 3],
        "original_tokens": 3,
        "selected_tokens": 3,
        "window_method": "full_source_no_window",
        "semantic_cut_detected": False,
        "public_safe": True,
        "normative_label": False,
        "personal_fit_label": False,
        "persona_mode_label": False,
        "allowed_for_training": True,
    }


def _prediction(
    row: dict,
    *,
    arm: str,
    domain_predicted: str | None = None,
    register_predicted: str | None = None,
    confidence: float = 0.91,
) -> dict:
    return {
        "schema_version": "r30j1a.dev-prediction.v1",
        "split": "dev",
        "heldout_opened": False,
        "heldout_used": False,
        "derived_from_heldout": False,
        "source_role": "J1A_DEV_DIAGNOSTIC",
        "source_arm": arm,
        "example_id": row["example_id"],
        "domain_truth": row["domain_label"],
        "domain_predicted": domain_predicted or row["domain_label"],
        "domain_confidence": confidence,
        "register_truth": row["register_label"],
        "register_predicted": register_predicted or row["register_label"],
        "register_confidence": confidence,
        "shortcut_suspicion": 0.7,
        "historical_evidence_conflict": 0.4,
    }


def _shortcut(index: int, family: str, row: dict) -> dict:
    return {
        "schema_version": "r30j1a.dev-shortcut-pair.v1",
        "split": "dev",
        "heldout_opened": False,
        "heldout_used": False,
        "derived_from_heldout": False,
        "source_role": "J1A_SHORTCUT_AUDIT",
        "source_arm": "D",
        "pair_id": f"synthetic_pair_{index:03d}",
        "example_id": row["example_id"],
        "source_group_id": row["source_group_id"],
        "semantic_family_id": row["semantic_family_id"],
        "mutation_family_id": row["mutation_family_id"],
        "register_label": row["register_label"],
        "shortcut_family": family,
        "context": row["context"],
        "response_a": row["response"],
        "response_b": row["response"].rstrip("。") + "!",
        "model_prediction_changed": True,
        "confidence_delta": 0.8 - index * 0.03,
        "shortcut_audit_supported": True,
        "semantic_preservation_validated": True,
        "factual_compatibility_validated": True,
        "protected_values_preserved": True,
        "only_shortcut_dimension_differs": True,
        "public_safe": True,
        "contains_third_party_identity": False,
        "third_party_text_used_as_owner_prose": False,
    }


def _pool_inputs() -> tuple[list[dict], list[dict], list[dict]]:
    dev: list[dict] = []
    predictions: list[dict] = []
    index = 0
    for _ in range(7):
        row = _dev_row(index, domain="AUTHENTIC_OWNER", register="ordinary_chat", kind="owner_transcript")
        dev.append(row)
        predictions.append(_prediction(row, arm="D", domain_predicted="GENERIC_ASSISTANT", confidence=0.99 - index * 0.01))
        index += 1
    for _ in range(7):
        row = _dev_row(index, domain="GENERIC_ASSISTANT", register="technical_explanation", kind="public_controlled_generic")
        dev.append(row)
        predictions.append(_prediction(row, arm="C", domain_predicted="AUTHENTIC_OWNER", confidence=0.99 - index * 0.01))
        index += 1
    for _ in range(6):
        row = _dev_row(index, domain="OTHER_PUBLIC_SAFE", register="philosophy", kind="public_safe_dialogue")
        dev.append(row)
        predictions.append(_prediction(row, arm="B", register_predicted="formal_message", confidence=0.96 - index * 0.005))
        index += 1
    shortcut_rows = []
    for _ in range(4):
        row = _dev_row(index, domain="OTHER_PUBLIC_SAFE", register="ordinary_chat", kind="public_safe_dialogue")
        dev.append(row)
        predictions.append(_prediction(row, arm="D", confidence=0.6))
        shortcut_rows.append(row)
        index += 1
    shortcuts = [
        _shortcut(i, family, shortcut_rows[i])
        for i, family in enumerate((
            "LENGTH", "PUNCTUATION", "BULLET_USE", "GENERIC_ASSISTANT_PHRASING"
        ))
    ]
    return dev, predictions, shortcuts


def _jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


class R30J1CR1ErrorSelectionTests(unittest.TestCase):
    def test_selects_exact_diverse_19_item_session1_pool(self):
        dev, predictions, shortcuts = _pool_inputs()
        candidates = build_candidates(dev, predictions, shortcuts)
        selected = select_session1_source_pool(candidates)
        self.assertEqual(len(selected), 19)
        counts = {kind: sum(row["item_kind"] == kind for row in selected) for kind in DEFAULT_TARGET_COUNTS}
        self.assertEqual(counts, DEFAULT_TARGET_COUNTS)
        self.assertEqual(len({row["semantic_family"] for row in selected}), 19)
        self.assertTrue(all(row["heldout_used"] is False for row in selected))
        self.assertTrue(all(row["gold_admission"] is False for row in selected))
        self.assertTrue(all(row["allowed_for_training"] is False for row in selected))
        self.assertTrue(all(set(row["information_gain_components"]) == {
            "model_confidence", "model_error_severity", "shortcut_suspicion",
            "persona_uncertainty", "register_boundary",
            "historical_evidence_conflict", "potential_training_value",
        } for row in selected))

    def test_selection_is_deterministic_under_input_order(self):
        dev, predictions, shortcuts = _pool_inputs()
        expected = [row["selection_id"] for row in select_session1_source_pool(build_candidates(dev, predictions, shortcuts))]
        random.Random(31).shuffle(dev)
        random.Random(32).shuffle(predictions)
        random.Random(33).shuffle(shortcuts)
        actual = [row["selection_id"] for row in select_session1_source_pool(build_candidates(dev, predictions, shortcuts))]
        self.assertEqual(actual, expected)

    def test_prediction_must_be_dev_and_not_heldout_derived(self):
        dev, predictions, _ = _pool_inputs()
        bad = copy.deepcopy(predictions[0])
        bad["derived_from_heldout"] = True
        with self.assertRaisesRegex(SelectionError, "derived_from_heldout"):
            validate_prediction(bad, dev[0])
        bad = copy.deepcopy(predictions[0])
        bad["split"] = "train"
        with self.assertRaisesRegex(SelectionError, "split_must_be_dev"):
            validate_prediction(bad, dev[0])

    def test_forbidden_path_is_rejected_before_read(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "heldout.sealed.jsonl"
            path.write_text("THIS_MUST_NOT_BE_READ", encoding="utf-8")
            with self.assertRaisesRegex(SelectionError, "forbidden_source_path"):
                reject_forbidden_source_path(path)

    def test_shortcut_pair_requires_semantic_and_fact_preservation(self):
        row = _dev_row(1, domain="OTHER_PUBLIC_SAFE", register="ordinary_chat", kind="public_safe_dialogue")
        pair = _shortcut(1, "PUNCTUATION", row)
        pair["semantic_preservation_validated"] = False
        with self.assertRaisesRegex(SelectionError, "semantic_preservation"):
            validate_shortcut_pair(pair)
        pair = _shortcut(1, "PUNCTUATION", row)
        pair["protected_values_preserved"] = False
        with self.assertRaisesRegex(SelectionError, "protected_values"):
            validate_shortcut_pair(pair)
        pair = _shortcut(1, "PUNCTUATION", row)
        pair["contains_third_party_identity"] = True
        with self.assertRaisesRegex(SelectionError, "third_party_identity"):
            validate_shortcut_pair(pair)

    def test_manifest_binds_exact_dev_file(self):
        dev, predictions, shortcuts = _pool_inputs()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dev_path = root / "dev.jsonl"
            pred_path = root / "dev_predictions.jsonl"
            shortcut_path = root / "dev_shortcut_pairs.jsonl"
            manifest_path = root / "dataset_manifest.json"
            _jsonl(dev_path, dev)
            _jsonl(pred_path, predictions)
            _jsonl(shortcut_path, shortcuts)
            manifest = {
                "schema_version": "r30j1a.dataset-manifest.v1",
                "permanent_heldout_opened": False,
                "heldout_used_for_architecture_selection": False,
                "heldout_used_for_early_stopping": False,
                "files": {"dev.jsonl": {"bytes": dev_path.stat().st_size, "sha256": hashlib.sha256(dev_path.read_bytes()).hexdigest()}},
                "diagnostic_files": {
                    "dev_predictions.jsonl": {
                        "bytes": pred_path.stat().st_size,
                        "sha256": hashlib.sha256(pred_path.read_bytes()).hexdigest(),
                        "source_role": "J1A_DEV_DIAGNOSTIC",
                        "split": "dev",
                        "heldout_opened": False,
                        "heldout_used": False,
                        "derived_from_heldout": False,
                        "producer_campaign": "R30J1A",
                        "producer_checkpoint_refs": ["local.synthetic.checkpoint"],
                        "architecture_id": "r30j1a.synthetic_test_architecture",
                    },
                    "dev_shortcut_pairs.jsonl": {
                        "bytes": shortcut_path.stat().st_size,
                        "sha256": hashlib.sha256(shortcut_path.read_bytes()).hexdigest(),
                        "source_role": "J1A_SHORTCUT_AUDIT",
                        "split": "dev",
                        "heldout_opened": False,
                        "heldout_used": False,
                        "derived_from_heldout": False,
                        "producer_campaign": "R30J1A",
                        "producer_checkpoint_refs": ["local.synthetic.checkpoint"],
                        "architecture_id": "r30j1a.synthetic_test_architecture",
                    },
                },
            }
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            trusted_manifest_sha = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
            loaded = load_source_inputs(
                manifest_path=manifest_path,
                dev_path=dev_path,
                prediction_paths=[pred_path],
                shortcut_pair_path=shortcut_path,
                trusted_manifest_sha256=trusted_manifest_sha,
            )
            self.assertEqual((len(loaded[0]), len(loaded[1]), len(loaded[2])), (24, 24, 4))
            dev_path.write_text(dev_path.read_text(encoding="utf-8") + "\n", encoding="utf-8")
            with self.assertRaisesRegex(SelectionError, "dev_bytes_mismatch"):
                load_source_inputs(
                    manifest_path=manifest_path,
                    dev_path=dev_path,
                    prediction_paths=[pred_path],
                    shortcut_pair_path=shortcut_path,
                    trusted_manifest_sha256=trusted_manifest_sha,
                )

    def test_each_source_is_content_read_exactly_once(self):
        dev, predictions, shortcuts = _pool_inputs()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dev_path = root / "dev.jsonl"
            pred_path = root / "dev_predictions.jsonl"
            shortcut_path = root / "dev_shortcut_pairs.jsonl"
            manifest_path = root / "dataset_manifest.json"
            _jsonl(dev_path, dev)
            _jsonl(pred_path, predictions)
            _jsonl(shortcut_path, shortcuts)
            manifest = {
                "schema_version": "r30j1a.dataset-manifest.v1",
                "permanent_heldout_opened": False,
                "heldout_used_for_architecture_selection": False,
                "heldout_used_for_early_stopping": False,
                "files": {
                    "dev.jsonl": {
                        "bytes": dev_path.stat().st_size,
                        "sha256": hashlib.sha256(dev_path.read_bytes()).hexdigest(),
                    }
                },
                "diagnostic_files": {
                    "dev_predictions.jsonl": {
                        "bytes": pred_path.stat().st_size,
                        "sha256": hashlib.sha256(pred_path.read_bytes()).hexdigest(),
                        "source_role": "J1A_DEV_DIAGNOSTIC",
                        "split": "dev",
                        "heldout_opened": False,
                        "heldout_used": False,
                        "derived_from_heldout": False,
                        "producer_campaign": "R30J1A",
                        "producer_checkpoint_refs": ["local.fixture.checkpoint"],
                        "architecture_id": "r30j1a.fixture_architecture",
                    },
                    "dev_shortcut_pairs.jsonl": {
                        "bytes": shortcut_path.stat().st_size,
                        "sha256": hashlib.sha256(shortcut_path.read_bytes()).hexdigest(),
                        "source_role": "J1A_SHORTCUT_AUDIT",
                        "split": "dev",
                        "heldout_opened": False,
                        "heldout_used": False,
                        "derived_from_heldout": False,
                        "producer_campaign": "R30J1A",
                        "producer_checkpoint_refs": ["local.fixture.checkpoint"],
                        "architecture_id": "r30j1a.fixture_architecture",
                    },
                },
            }
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            trusted_manifest_sha = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
            original = selection_module._read_source_snapshot
            calls: list[str] = []

            def counted(path: Path):
                calls.append(Path(path).name)
                return original(path)

            with mock.patch.object(selection_module, "_read_source_snapshot", side_effect=counted):
                load_source_inputs(
                    manifest_path=manifest_path,
                    dev_path=dev_path,
                    prediction_paths=[pred_path],
                    shortcut_pair_path=shortcut_path,
                    trusted_manifest_sha256=trusted_manifest_sha,
                )
            self.assertEqual(
                calls,
                ["dataset_manifest.json", "dev.jsonl", "dev_predictions.jsonl", "dev_shortcut_pairs.jsonl"],
            )

    def test_unanchored_self_signed_manifest_is_rejected(self):
        dev, predictions, shortcuts = _pool_inputs()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dev_path = root / "dev.jsonl"
            prediction_path = root / "dev_predictions.jsonl"
            shortcut_path = root / "dev_shortcut_pairs.jsonl"
            manifest_path = root / "dataset_manifest.json"
            _jsonl(dev_path, dev)
            _jsonl(prediction_path, predictions)
            _jsonl(shortcut_path, shortcuts)
            manifest_path.write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(SelectionError, "anchor_missing"):
                load_source_inputs(
                    manifest_path=manifest_path,
                    dev_path=dev_path,
                    prediction_paths=[prediction_path],
                    shortcut_pair_path=shortcut_path,
                    trusted_manifest_sha256="",
                )

    def test_shortcut_pair_must_bind_to_manifest_dev_row(self):
        dev, predictions, shortcuts = _pool_inputs()
        bad = copy.deepcopy(shortcuts)
        bad[0]["example_id"] = "synthetic_injected_dev_claim"
        with self.assertRaisesRegex(SelectionError, "unknown_dev_example"):
            build_candidates(dev, predictions, bad)
        bad = copy.deepcopy(shortcuts)
        bad[0]["context"] = "Injected context"
        with self.assertRaisesRegex(SelectionError, "context_dev_mismatch"):
            build_candidates(dev, predictions, bad)

    def test_parent_symlink_cannot_escape_into_forbidden_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            forbidden = root / "sealed-heldout"
            forbidden.mkdir()
            source = forbidden / "dev.jsonl"
            source.write_text("{}\n", encoding="utf-8")
            alias = root / "safe"
            alias.symlink_to(forbidden, target_is_directory=True)
            with self.assertRaisesRegex(SelectionError, "symlink|forbidden"):
                reject_forbidden_source_path(alias / "dev.jsonl")

    def test_grandparent_symlink_is_rejected_without_explicit_source_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            real = root / "real"
            nested = real / "nested"
            nested.mkdir(parents=True)
            (nested / "dev.jsonl").write_text("{}\n", encoding="utf-8")
            alias = root / "alias"
            alias.symlink_to(real, target_is_directory=True)
            with self.assertRaisesRegex(SelectionError, "source_symlink_forbidden"):
                reject_forbidden_source_path(alias / "nested" / "dev.jsonl")

    def test_cli_blocks_before_source_read_and_invalidates_stale_ready_outputs(self):
        repository_root = Path(__file__).resolve().parents[2]
        script_path = repository_root / "scripts" / "r30j1c_r1_select_j1a_errors.py"
        spec = importlib.util.spec_from_file_location("r30j1c_r1_select_cli_fixture", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output_root = root / "source_pool"
            output_root.mkdir()
            stale_rows = output_root / "j1a_selected_source_rows.jsonl"
            stale_receipt = output_root / "j1a_source_pool_receipt.json"
            stale_rows.write_text("stale", encoding="utf-8")
            stale_receipt.write_text("stale", encoding="utf-8")
            config_path = root / "config.json"
            config_path.write_text(json.dumps({
                "source_pool": {
                    "r30j1a_diagnostic_provenance": {
                        "anchor_status": "UNAVAILABLE_SOURCE_CLEANED"
                    }
                }
            }), encoding="utf-8")
            cli.LOCAL_ARTIFACT_ROOT = root.resolve()
            cli.CONFIG_PATH = config_path
            source_loader = mock.Mock(side_effect=AssertionError("source content must not be read"))
            cli.load_source_inputs = source_loader
            argv = [
                str(script_path),
                "--dataset-manifest", str(root / "missing_manifest.json"),
                "--dev", str(root / "missing_dev.jsonl"),
                "--predictions", str(root / "missing_predictions.jsonl"),
                "--shortcut-pairs", str(root / "missing_shortcuts.jsonl"),
                "--output-root", str(output_root),
            ]
            stdout = io.StringIO()
            with mock.patch.object(sys, "argv", argv), mock.patch("sys.stdout", stdout):
                status = cli.main()
            self.assertEqual(status, 2)
            self.assertFalse(stale_rows.exists())
            self.assertFalse(stale_receipt.exists())
            source_loader.assert_not_called()
            result = json.loads(stdout.getvalue())
            self.assertEqual(result["error_code"], "trusted_producer_manifest_anchor_unavailable")

            # A failure after the trusted-anchor gate must also invalidate an
            # earlier READY pair rather than leaving it available to consumers.
            stale_rows.write_text("stale", encoding="utf-8")
            stale_receipt.write_text("stale", encoding="utf-8")
            config_path.write_text(json.dumps({
                "source_pool": {
                    "r30j1a_diagnostic_provenance": {
                        "anchor_status": "VERIFIED_IMMUTABLE_SOURCE",
                        "trusted_manifest_sha256": "a" * 64,
                    }
                }
            }), encoding="utf-8")
            source_loader.reset_mock(side_effect=True)
            source_loader.side_effect = SelectionError("fixture_late_failure")
            stdout = io.StringIO()
            with mock.patch.object(sys, "argv", argv), mock.patch("sys.stdout", stdout):
                status = cli.main()
            self.assertEqual(status, 2)
            self.assertFalse(stale_rows.exists())
            self.assertFalse(stale_receipt.exists())
            source_loader.assert_not_called()
            self.assertEqual(
                json.loads(stdout.getvalue())["error_code"],
                "ready_adapter_not_authorized_this_revision",
            )

            # Simulate a future reviewed revision enabling the adapter and
            # prove that a later selection failure still clears stale files.
            stale_rows.write_text("stale", encoding="utf-8")
            stale_receipt.write_text("stale", encoding="utf-8")
            stdout = io.StringIO()
            with (
                mock.patch.object(cli, "_READY_ADAPTER_AUTHORIZED", True),
                mock.patch.object(sys, "argv", argv),
                mock.patch("sys.stdout", stdout),
            ):
                status = cli.main()
            self.assertEqual(status, 2)
            self.assertFalse(stale_rows.exists())
            self.assertFalse(stale_receipt.exists())
            source_loader.assert_called_once()
            self.assertEqual(json.loads(stdout.getvalue())["error_code"], "fixture_late_failure")

    def test_insufficient_diverse_candidates_fails_closed(self):
        dev, predictions, shortcuts = _pool_inputs()
        for row in dev:
            row["source_group_id"] = "one_source_family"
        for pair in shortcuts:
            pair["source_group_id"] = "one_source_family"
        candidates = build_candidates(dev, predictions, shortcuts)
        with self.assertRaisesRegex(SelectionError, "insufficient_diverse_candidates"):
            select_session1_source_pool(candidates)

    def test_receipt_is_aggregate_only_and_outputs_are_private(self):
        dev, predictions, shortcuts = _pool_inputs()
        candidates = build_candidates(dev, predictions, shortcuts)
        selected = select_session1_source_pool(candidates)
        receipt = build_receipt(
            candidates=candidates,
            selected=selected,
            source_hashes={"dev_sha256": "a" * 64},
            maximum_per_source_family=2,
        )
        serialized_receipt = json.dumps(receipt, ensure_ascii=False)
        self.assertNotIn("合成回答", serialized_receipt)
        self.assertFalse(receipt["heldout_used"])
        self.assertFalse(receipt["training_started"])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "source_pool"
            write_source_pool(output, selected, receipt)
            for path in output.iterdir():
                self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            self.assertEqual(os.stat(output).st_mode & 0o777, 0o700)

    def test_selected_pool_rejects_training_or_gold_promotion(self):
        dev, predictions, shortcuts = _pool_inputs()
        selected = select_session1_source_pool(build_candidates(dev, predictions, shortcuts))
        bad = copy.deepcopy(selected)
        bad[0]["allowed_for_training"] = True
        with self.assertRaisesRegex(SelectionError, "training_forbidden"):
            validate_selected_pool(bad)
        bad = copy.deepcopy(selected)
        bad[0]["gold_admission"] = True
        with self.assertRaisesRegex(SelectionError, "gold_admission_forbidden"):
            validate_selected_pool(bad)
        bad = copy.deepcopy(selected)
        bad[0]["raw_source_path"] = "synthetic/private/path"
        with self.assertRaisesRegex(SelectionError, "selected_fields_invalid"):
            validate_selected_pool(bad)


if __name__ == "__main__":
    unittest.main()
