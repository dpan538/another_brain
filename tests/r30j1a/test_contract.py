from __future__ import annotations

import json
from pathlib import Path
import re
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


class R30J1AContractTests(unittest.TestCase):
    def test_authorization_is_descriptive_only(self):
        config = json.loads((ROOT / "config/r30j1a_personal_representation_bootstrap_v1.json").read_text())
        self.assertTrue(config["authorization"]["descriptive_representation_bootstrap"])
        for key in (
            "normative_persona_training", "final_persona_training", "personal_fit_training",
            "persona_mode_training", "crocodile_classifier_training", "answer_generation", "product_admission",
        ):
            self.assertFalse(config["authorization"][key])

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


if __name__ == "__main__":
    unittest.main()
