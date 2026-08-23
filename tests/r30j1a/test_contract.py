from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]

from src.training.mlx.r30j1a_contract import (  # noqa: E402
    CONTROLLED_MUTATIONS,
    DOMAIN_LABELS,
    MECHANICS_LABELS,
    apply_controlled_mutation,
    deterministic_group_splits,
    protected_content_equal,
    validate_source_split_integrity,
)
from src.training.mlx.r30j1a_supervision import (  # noqa: E402
    build_failed_segment_receipt,
    incomplete_segments_without_parent_decision,
    parse_memory_pressure,
    parse_swap_usage,
    resource_stop_reason,
    safe_failure_code,
    validate_resource_snapshot,
)


class R30J1AContractTests(unittest.TestCase):
    def test_authorization_is_descriptive_only(self):
        config = json.loads((ROOT / "config/r30j1a_personal_representation_bootstrap_v1.json").read_text())
        self.assertTrue(config["authorization"]["descriptive_representation_bootstrap"])
        for key in (
            "normative_persona_training", "final_persona_training", "personal_fit_training",
            "persona_mode_training", "crocodile_classifier_training", "answer_generation", "product_admission",
        ):
            self.assertFalse(config["authorization"][key])
        self.assertTrue(config["resource"]["resource_telemetry_fail_closed"])
        self.assertEqual(config["resource"]["memory_pressure_warning_free_percent"], 10)
        self.assertEqual(config["resource"]["memory_pressure_critical_free_percent"], 5)

    def test_historical_states_are_not_rewritten(self):
        states = json.loads((ROOT / "config/r30j1a_personal_representation_bootstrap_v1.json").read_text())["historical_states_preserved"]
        self.assertEqual(states["r30j0_p"], "PERSONAL_SOURCE_EVIDENCE_READY")
        self.assertEqual(states["r30j0"], "HUMAN_OWNER_REVIEW_REQUIRED")
        self.assertEqual(states["r30j0_p2"], "R30J0_P2_PERSONA_EXCAVATION_READY")
        self.assertEqual(states["r30j0_p2_expected_next"], "HUMAN_PERSONA_ELICITATION_REQUIRED")

    def test_exact_descriptive_head_taxonomies(self):
        self.assertEqual(DOMAIN_LABELS, (
            "AUTHENTIC_OWNER", "CONTROLLED_OWNER_STYLE_VARIANT", "GENERIC_ASSISTANT", "OTHER_PUBLIC_SAFE",
        ))
        self.assertEqual(len(MECHANICS_LABELS), 10)
        forbidden = re.compile(r"personal[_-]?fit|persona[_-]?mode|croc|wired|preference|generation", re.I)
        self.assertFalse(any(forbidden.search(value) for value in (*DOMAIN_LABELS, *MECHANICS_LABELS)))

    def test_all_controlled_mutations_preserve_protected_content(self):
        source = "如果周一有20个杯子，就不能删掉“蓝色方案”，结论是否定。"
        for mutation in CONTROLLED_MUTATIONS:
            candidate = apply_controlled_mutation(source, mutation)
            self.assertIn(source, candidate)
            self.assertTrue(protected_content_equal(source, candidate))

    def test_mutation_guard_rejects_number_condition_and_negation_changes(self):
        source = "如果周一有20个杯子，就不能提交。"
        for candidate in (
            "如果周一有30个杯子，就不能提交。",
            "周一有20个杯子，就不能提交。",
            "如果周一有20个杯子，就可以提交。",
        ):
            self.assertFalse(protected_content_equal(source, candidate))

    def test_split_assignment_is_whole_group_and_stratified(self):
        groups = {
            "ordinary_chat": [f"ordinary-{index}" for index in range(10)],
            "philosophy": [f"philosophy-{index}" for index in range(8)],
        }
        assigned = deterministic_group_splits(groups)
        self.assertEqual(set(assigned), set(sum(groups.values(), [])))
        for register, values in groups.items():
            self.assertEqual({assigned[value] for value in values}, {"train", "dev", "heldout"}, register)

    def test_split_validator_rejects_semantic_leakage(self):
        base = {
            "source_group_id": "source-a", "semantic_family_id": "idea-a", "mutation_family_id": "mutation-a",
        }
        with self.assertRaisesRegex(ValueError, "source_split_leakage"):
            validate_source_split_integrity([
                base | {"example_id": "a", "split": "train"},
                base | {"example_id": "b", "split": "dev"},
            ])

    def test_model_source_has_no_lm_head_or_decode_path(self):
        source = (ROOT / "src/training/mlx/r30j1a_model.py").read_text()
        self.assertIn("self.lm_head_absent = True", source)
        self.assertIn("self.autoregressive_decode = False", source)
        self.assertNotRegex(source, r"self\.lm_head\s*=")
        self.assertNotIn("def incremental(", source)
        self.assertNotIn("def generate(", source)

    def test_exact_parameter_arithmetic(self):
        projection = 2 * 896 + 896 * 768 + 768 + 768 * 512 + 512 + 2 * 512
        heads = (512 * 4 + 4) + (512 * 8 + 8) + (512 * 10 + 10)
        probe = 256 * 896 + projection + heads
        block = 2 * 2 * 896 + 3 * 896 * 896 + 3 * 896 + 896 * 896 + 896 + 2 * 896 * 4 * 896 + 4 * 896 + 896
        self.assertEqual(projection, 1_085_440)
        self.assertEqual(heads, 11_286)
        self.assertEqual(probe, 1_326_102)
        self.assertEqual(block, 9_645_440)
        self.assertEqual(probe + 2 * block + 2 * 896, 20_618_774)

    def test_foreground_segment_contract_has_no_detached_execution(self):
        source = (ROOT / "scripts/r30j1a_run_foreground_segment.py").read_text()
        for fragment in ("subprocess.Popen", "os.fork(", "start_new_session", "daemon=True"):
            self.assertNotIn(fragment, source)
        self.assertIn('"background_training": False', source)
        self.assertIn('"parent_decision_pending": True', source)

    def test_heldout_can_only_be_opened_explicitly(self):
        training = (ROOT / "src/training/mlx/r30j1a_training.py").read_text()
        runner = (ROOT / "scripts/r30j1a_run_foreground_segment.py").read_text()
        self.assertIn("open_heldout: bool = False", training)
        self.assertIn("load_dataset(args.dataset_root, open_heldout=False)", runner)
        self.assertNotIn("heldout.sealed.jsonl", runner)

    def test_dataset_builder_excludes_p2_and_normative_labels(self):
        source = (ROOT / "scripts/r30j1a_build_dataset.py").read_text()
        self.assertIn("p2_elicitation_examples", source)
        self.assertIn("future_owner_correction_examples", source)
        self.assertIn('"normative_persona_labels": 0', source)
        self.assertIn('"personal_fit_labels": 0', source)
        self.assertIn('"lm_generation_targets": 0', source)

    def test_no_network_or_deepseek_in_training_sources(self):
        for path in (
            ROOT / "scripts/r30j1a_build_dataset.py",
            ROOT / "scripts/r30j1a_run_foreground_segment.py",
            ROOT / "src/training/mlx/r30j1a_training.py",
        ):
            source = path.read_text().casefold()
            self.assertNotIn("api.deepseek.com", source)
            self.assertNotIn("authorization header", source)
            self.assertNotIn("requests.post", source)
            self.assertNotIn("urlopen(", source)

    def test_swap_parser_accepts_realistic_macos_units(self):
        parsed = parse_swap_usage("total = 16.00G  used = 12288.00M  free = 4.00G  (encrypted)")
        self.assertEqual(parsed["total_bytes"], 16 * 1024**3)
        self.assertEqual(parsed["used_bytes"], 12 * 1024**3)
        self.assertEqual(parsed["free_bytes"], 4 * 1024**3)

    def test_swap_parser_fails_closed(self):
        for value in (
            "",
            "total = 16.00G used = 12.00G",
            "total = 16.00G used = 12.00G free = 4.00G used = 12.00G",
            "total = 16.00G used = 14.00G free = 4.00G",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_swap_usage(value)

    def test_memory_pressure_parser_and_resource_gate(self):
        normal = parse_memory_pressure("System-wide memory free percentage: 78%")
        warning = parse_memory_pressure("System-wide memory free percentage: 10%")
        critical = parse_memory_pressure("System-wide memory free percentage: 5%")
        self.assertEqual((normal["state"], warning["state"], critical["state"]), ("normal", "warning", "critical"))
        before = {
            "system_ram_bytes": 16_000_000_000,
            "available_ram_bytes": 8_000_000_000,
            "process_rss_bytes": 100_000_000,
            "free_disk_bytes": 20_000_000_000,
            "mlx_active_memory_bytes": 0,
            "mlx_peak_memory_bytes": 0,
            "swap": {"total_bytes": 16_000_000_000, "used_bytes": 10_000_000_000, "free_bytes": 6_000_000_000},
            "memory_pressure": normal,
        }
        validate_resource_snapshot(before)
        self.assertIsNone(resource_stop_reason(before, before))
        self.assertEqual(resource_stop_reason(before, before | {"memory_pressure": warning}), "j1a_memory_pressure_not_normal")
        swap_high = before | {"swap": before["swap"] | {"used_bytes": 11_000_000_001, "free_bytes": 4_999_999_999}}
        self.assertEqual(resource_stop_reason(before, swap_high), "j1a_swap_growth_stop")
        with self.assertRaisesRegex(ValueError, "resource_telemetry_invalid"):
            validate_resource_snapshot(before | {"process_rss_bytes": 0})

    def test_failed_segment_receipt_accounts_attempted_not_durable_update(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            pressure = parse_memory_pressure("System-wide memory free percentage: 70%")
            resource = {
                "system_ram_bytes": 16_000_000_000,
                "available_ram_bytes": 6_000_000_000,
                "process_rss_bytes": 100_000_000,
                "free_disk_bytes": 20_000_000_000,
                "mlx_active_memory_bytes": 0,
                "mlx_peak_memory_bytes": 0,
                "swap": {"total_bytes": 16_000_000_000, "used_bytes": 10_000_000_000, "free_bytes": 6_000_000_000},
                "memory_pressure": pressure,
            }
            manifest = {
                "campaign_id": "r30j1a_personal_representation_bootstrap_v1",
                "segment_id": "synthetic-failure",
                "phase": "RESOURCE_REHEARSAL",
                "planned_steps": 10,
                "starting_global_optimizer_step": 0,
                "starting_training_state": {
                    "global_optimizer_step": 0, "examples_seen": 0, "optimizer_tokens": 0,
                    "representation_target_examples": 0, "assistant_target_tokens": 0,
                },
                "resource_before": resource,
            }
            (root / "segment_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            event = {
                "global_optimizer_step": 1, "examples_seen": 4, "optimizer_tokens": 615,
                "representation_target_examples": 4, "assistant_target_tokens": 0,
                "process_rss_bytes": 200_000_000, "MLX_peak_memory_bytes": 640_000_000,
            }
            (root / "train_events.jsonl").write_text(json.dumps(event) + "\n", encoding="utf-8")
            after = resource | {"process_rss_bytes": 200_000_000, "mlx_peak_memory_bytes": 640_000_000}
            (root / "resource_events.jsonl").write_text(json.dumps(after) + "\n", encoding="utf-8")
            receipt = build_failed_segment_receipt(
                segment_root=root,
                error=KeyError("mlx_peak_memory_bytes"),
                failure_source="synthetic_test",
            )
            self.assertFalse(receipt["completed"])
            self.assertEqual(receipt["attempted_optimizer_updates"], 1)
            self.assertEqual(receipt["durable_global_optimizer_step"], 0)
            self.assertEqual(receipt["discarded_uncheckpointed_optimizer_updates"], 1)
            self.assertEqual(receipt["attempted_training_state"]["optimizer_tokens"], 615)
            self.assertFalse(receipt["checkpoint_verified"])
            self.assertFalse(receipt["resume_allowed"])
            self.assertNotIn(str(root), json.dumps(receipt))

    def test_pending_parent_decision_blocks_next_segment(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            pending = root / "pending"
            reviewed = root / "reviewed"
            pending.mkdir(); reviewed.mkdir()
            (reviewed / "parent_decision.json").write_text("{}\n", encoding="utf-8")
            self.assertEqual(incomplete_segments_without_parent_decision([pending, reviewed]), ["pending"])

    def test_failed_segment_audit_rejects_continue_and_accepts_named_adjustment(self):
        with tempfile.TemporaryDirectory() as temporary:
            artifact = Path(temporary)
            segment = artifact / "training_flight_recorder/segments/failed"
            segment.mkdir(parents=True)
            receipt = {
                "completed": False, "failed": True, "parent_decision_pending": True,
                "resume_allowed": False, "checkpoint": None, "checkpoint_created": False,
                "checkpoint_verified": False, "heldout_opened": False, "swap_delta_bytes": None,
                "resource_telemetry_complete": False, "peak_mlx_memory_bytes": 640_000_000,
                "background_training": False, "failure_code": "telemetry_schema_mismatch",
            }
            (segment / "segment_receipt.json").write_text(json.dumps(receipt), encoding="utf-8")
            (artifact / "campaign_state.json").write_text(json.dumps({"campaign_id": "test"}), encoding="utf-8")
            base = [
                "python3", str(ROOT / "scripts/r30j1a_record_segment_audit.py"),
                "--artifact-root", str(artifact), "--segment-id", "failed",
                "--metrics-status", "INCONCLUSIVE", "--shortcut-status", "WARN", "--integrity-status", "FAIL",
                "--reason", "synthetic",
            ]
            rejected = subprocess.run(base + ["--decision", "CONTINUE"], capture_output=True, text=True)
            self.assertNotEqual(rejected.returncode, 0)
            accepted = subprocess.run(base + [
                "--decision", "ADJUST_ONE_VARIABLE", "--next-change", "foreground_supervisor_integrity",
            ], capture_output=True, text=True)
            self.assertEqual(accepted.returncode, 0, accepted.stderr)
            decision = json.loads((segment / "parent_decision.json").read_text(encoding="utf-8"))
            self.assertFalse(decision["checkpoint_verified"])
            self.assertTrue(decision["all_synchronous_auditors_returned"])

    def test_supervisor_uses_canonical_resource_key_and_failure_accounting(self):
        runner = (ROOT / "scripts/r30j1a_run_foreground_segment.py").read_text(encoding="utf-8")
        self.assertIn('resource["mlx_peak_memory_bytes"]', runner)
        self.assertNotIn('resource["MLX_peak_memory_bytes"]', runner)
        self.assertIn("persist_failure", runner)
        self.assertIn("incomplete_segments_without_parent_decision", runner)
        self.assertEqual(safe_failure_code(RuntimeError("contains /local/path")), "RuntimeError")

    def test_finalizer_preserves_audited_failed_segments(self):
        source = (ROOT / "scripts/r30j1a_finalize.py").read_text(encoding="utf-8")
        self.assertIn("failed_segments", source)
        self.assertIn("discarded_uncheckpointed_optimizer_updates", source)
        self.assertIn("failed_segments_audited", source)
        self.assertIn("completed_segments", source)


if __name__ == "__main__":
    unittest.main()
