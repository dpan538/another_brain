import json
import math
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
GENERATOR = ROOT / "scripts" / "r30j0_p2_build_elicitation_pack.py"
BUILDER = ROOT / "scripts" / "r30j0_p2_build_owner_review_v2.mjs"
TEMPLATE_ROOT = ROOT / "data" / "personal_judge" / "templates" / "persona_review_v2"


class TestR30J0P2OwnerReviewUIContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="r30j0-p2-review-")
        cls.root = Path(cls.temporary.name)
        cls.pack_path = cls.root / "elicitation_pack_v2.json"
        cls.assertion_path = cls.root / "synthetic_owner_governance.json"
        cls.catalog_path = cls.root / "synthetic_target_catalogs"
        cls.ui_path = cls.root / "owner_review_v2"
        cls.assertion_path.write_text(
            json.dumps(
                {
                    "version": "synthetic-test-only",
                    "assertions": [
                        {
                            "persona_seed_id": "SYNTHETIC_PERSONA_SEED",
                            "status": "OWNER_ASSERTED_SEED",
                            "boundary_status": "BOUNDARY_NOT_YET_KNOWN",
                            "owner_review_required": True,
                            "allowed_for_training": False,
                        }
                    ],
                    "label_governance": {
                        "SYNTHETIC_COARSE_LABEL": "DEPRECATED_OVERSIMPLIFIED_LABEL"
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        cls.catalog_path.mkdir()
        synthetic_microtraits = [f"synthetic_microtrait_{index:03d}" for index in range(74)]
        synthetic_modes = ["synthetic_persona_seed", *[f"synthetic_mode_{index:02d}" for index in range(11)]]
        synthetic_antipatterns = [f"synthetic_antipattern_{index:03d}" for index in range(26)]
        synthetic_contradictions = [f"contradiction.synthetic_{index:03d}" for index in range(7)]
        boundary_grammar = [
            "evidence.descriptive_not_normative",
            "exception.explicit_serious_request",
            "exception.factual_stakes",
            "exception.owner_turn_instruction",
            "boundary.no_factual_sacrifice",
            "boundary.real_unknown_is_literal",
            "boundary.unreviewed_modes_do_not_execute",
        ]
        synthetic_catalogs = {
            "persona_microtraits.json": {"entries": [{"microtrait_id": value} for value in synthetic_microtraits]},
            "persona_mode_hypotheses.json": {"modes": [{"mode_id": value} for value in synthetic_modes]},
            "persona_antipatterns.json": {"entries": [{"anti_pattern_id": value} for value in synthetic_antipatterns]},
            "persona_contradiction_ledger.json": {"entries": [{"contradiction_id": value} for value in synthetic_contradictions]},
            "persona_grammar_hypotheses.json": {
                "layers": [{"items": [{"grammar_item_id": value} for value in [*boundary_grammar, *[f"anti.{value}" for value in synthetic_antipatterns]]]}]
            },
        }
        for filename, document in synthetic_catalogs.items():
            (cls.catalog_path / filename).write_text(json.dumps(document) + "\n", encoding="utf-8")
        generated = subprocess.run(
            [
                "python3",
                str(GENERATOR),
                "--output",
                str(cls.pack_path),
                "--owner-assertion-file",
                str(cls.assertion_path),
                "--target-catalog-dir",
                str(cls.catalog_path),
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=60,
            check=False,
        )
        if generated.returncode:
            raise AssertionError(f"generator failed\nstdout={generated.stdout}\nstderr={generated.stderr}")
        cls.pack = json.loads(cls.pack_path.read_text(encoding="utf-8"))
        built = subprocess.run(
            ["node", str(BUILDER), "--input", str(cls.pack_path), "--output-dir", str(cls.ui_path)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=60,
            check=False,
        )
        if built.returncode:
            raise AssertionError(f"builder failed\nstdout={built.stdout}\nstderr={built.stderr}")
        cls.manifest = json.loads((cls.ui_path / "manifest.json").read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_exact_session_and_total_counts(self):
        self.assertEqual(len(self.pack["decision_items"]), 190)
        self.assertEqual(len(self.pack["optional_owner_write_prompts"]), 40)
        self.assertEqual(self.pack["session_targets"], {"A": 40, "B": 40, "C": 40, "D": 40, "E": 30})
        self.assertEqual(self.manifest["session_counts"], {"A": 40, "B": 40, "C": 40, "D": 40, "E": 30})

    def test_battery_coverage_uses_overlapping_tags(self):
        items = self.pack["decision_items"]
        sources = [item for item in items if not item["blind_repeat"]]
        unique_count = lambda tag: len({item["case_id"] for item in sources if tag in item["battery_tags"]})
        self.assertGreaterEqual(unique_count("weird_question"), 40)
        self.assertGreaterEqual(unique_count("crocodile_boundary"), 24)
        self.assertGreaterEqual(unique_count("generic_good_mismatch"), 50)
        self.assertGreaterEqual(unique_count("reverse_control"), 40)
        open_count = sum(item["task_type"] == "open_ended_question" for item in items)
        self.assertGreaterEqual(open_count, 20)
        self.assertLessEqual(open_count, 30)

    def test_blind_repeat_contract(self):
        items = self.pack["decision_items"]
        by_id = {item["item_id"]: item for item in items}
        positions = {item["item_id"]: index for index, item in enumerate(items)}
        repeats = [item for item in items if item["blind_repeat"]]
        self.assertGreaterEqual(len(repeats), math.ceil(len(items) * 0.12))
        for repeat in repeats:
            source = by_id[repeat["repeat_of"]]
            self.assertLess(positions[source["item_id"]], positions[repeat["item_id"]])
            self.assertNotEqual(source["prompt"], repeat["prompt"])
            self.assertFalse(any(marker in repeat["prompt"] for marker in ["重复", "同构", "候选顺序已改变"]))
            self.assertNotEqual(source["surface_variant"], repeat["surface_variant"])
            self.assertEqual(source["underlying_decision_family"], repeat["underlying_decision_family"])
            self.assertEqual(source["case_id"], repeat["case_id"])
            self.assertEqual(source["target_refs"], repeat["target_refs"])
            if "candidates" in repeat:
                self.assertNotEqual(
                    [candidate["canonical_option_id"] for candidate in source["candidates"]],
                    [candidate["canonical_option_id"] for candidate in repeat["candidates"]],
                )
                self.assertEqual(
                    {candidate["canonical_option_id"] for candidate in source["candidates"]},
                    {candidate["canonical_option_id"] for candidate in repeat["candidates"]},
                )
            if "scenario_pair" in repeat:
                self.assertNotEqual(
                    [scenario["canonical_scenario_id"] for scenario in source["scenario_pair"]],
                    [scenario["canonical_scenario_id"] for scenario in repeat["scenario_pair"]],
                )
                self.assertEqual(
                    {scenario["canonical_scenario_id"] for scenario in source["scenario_pair"]},
                    {scenario["canonical_scenario_id"] for scenario in repeat["scenario_pair"]},
                )

    def test_unique_source_case_contract(self):
        sources = [item for item in self.pack["decision_items"] if not item["blind_repeat"]]
        self.assertEqual(len(sources), 166)
        self.assertEqual(len({item["case_id"] for item in sources}), 166)
        coverage = self.pack["coverage"]
        self.assertEqual(coverage["unique_case_count"], 166)
        self.assertEqual(coverage["blind_repeat_case_count"], 24)
        self.assertEqual(coverage["unique_weird_case_count"], 40)
        self.assertEqual(coverage["unique_crocodile_boundary_pair_count"], 24)
        self.assertEqual(coverage["unique_generic_good_case_count"], 50)
        self.assertGreaterEqual(coverage["unique_reverse_control_case_count"], 40)

    def test_weird_and_crocodile_cases_are_genuinely_distinct_and_unambiguous(self):
        sources = [item for item in self.pack["decision_items"] if not item["blind_repeat"]]
        weird = [item for item in sources if "weird_question" in item["battery_tags"]]
        self.assertEqual(len({item["case_id"] for item in weird}), 40)
        scenario_texts = [scenario["text"] for item in weird for scenario in item["scenario_pair"]]
        self.assertEqual(len(scenario_texts), 80)
        self.assertEqual(len(set(scenario_texts)), 80)
        crocodile = [item for item in sources if "crocodile_boundary" in item["battery_tags"]]
        self.assertEqual(len(crocodile), 24)
        for item in crocodile:
            self.assertEqual(item["allowed_decisions"], ["PAIR_DECISION", "NONE_OF_THESE", "IT_DEPENDS"])
            self.assertEqual(item["scenario_decision_options"], ["NORMAL", "CROCODILE", "EITHER", "DEPENDS"])
            self.assertEqual(len({scenario["canonical_scenario_id"] for scenario in item["scenario_pair"]}), 2)

    def test_generic_good_is_unique_acceptable_and_personal_fit_only(self):
        sources = [item for item in self.pack["decision_items"] if not item["blind_repeat"]]
        generic = [item for item in sources if "generic_good_mismatch" in item["battery_tags"]]
        self.assertEqual(len({item["case_id"] for item in generic}), 50)
        self.assertEqual(len({item["prompt"] for item in generic}), 50)
        for item in generic:
            self.assertTrue(item["all_candidates_objectively_acceptable"])
            self.assertTrue(item["personal_fit_only"])
            self.assertEqual(len(item["candidates"]), 3)
            self.assertEqual(len({candidate["canonical_option_id"] for candidate in item["candidates"]}), 3)

    def test_reverse_controls_have_unique_cases_and_plausible_less_personal_winner(self):
        sources = [item for item in self.pack["decision_items"] if not item["blind_repeat"]]
        reverse = [item for item in sources if "reverse_control" in item["battery_tags"]]
        self.assertGreaterEqual(len({item["case_id"] for item in reverse}), 40)
        self.assertGreaterEqual(len({item["prompt"] for item in reverse}), 40)
        self.assertTrue(all(item["reverse_control_plausible_less_personal_winner"] for item in reverse))

    def test_no_owner_answers_labels_or_training_admission(self):
        self.assertFalse(self.pack["owner_answers_present"])
        self.assertFalse(self.pack["owner_labels_present"])
        for item in [*self.pack["decision_items"], *self.pack["optional_owner_write_prompts"]]:
            self.assertFalse(item["owner_response_present"])
            self.assertFalse(item["owner_label_present"])
            self.assertTrue(item["owner_review_required"])
            self.assertFalse(item["allowed_for_training"])
            self.assertTrue(item["public_safe"])
            self.assertEqual(item["stimulus_origin"], "CODEX_SYNTHETIC_PUBLIC_SAFE")

    def test_review_v1_is_explicitly_paused(self):
        self.assertTrue(self.pack["owner_review_v1_paused"])
        self.assertEqual(self.pack["owner_review_v1_item_count"], 174)
        self.assertTrue(self.manifest["owner_review_v1_paused"])
        self.assertEqual(self.manifest["owner_review_v1_item_count"], 174)

    def test_actions_choice_and_condition_contract(self):
        expected_actions = ["ACCEPT", "REJECT", "EDIT", "DEPENDS", "UNSURE"]
        self.assertEqual(self.pack["review_contract"]["actions"], expected_actions)
        task_types = {item["task_type"] for item in self.pack["decision_items"]}
        self.assertTrue({"abc_choice", "ranking", "trigger_boundary", "edit_response", "open_ended_question"}.issubset(task_types))
        for item in self.pack["decision_items"]:
            self.assertEqual(item["review_actions"], expected_actions)
            self.assertIn("NONE_OF_THESE", item["allowed_decisions"])
            self.assertIn("IT_DEPENDS", item["allowed_decisions"])

    def test_edit_and_open_ended_tasks_are_functional(self):
        sources = [item for item in self.pack["decision_items"] if not item["blind_repeat"]]
        edits = [item for item in sources if item["task_type"] == "edit_response"]
        self.assertGreater(len(edits), 0)
        for item in edits:
            self.assertIsNotNone(item["response_to_edit"])
            target = item["response_to_edit"]
            self.assertTrue(any(candidate["canonical_option_id"] == target["canonical_option_id"] and candidate["text"] == target["text"] for candidate in item["candidates"]))
            self.assertEqual(item["allowed_decisions"], ["KEEP_AS_IS", "SUBMIT_EDIT", "NONE_OF_THESE", "IT_DEPENDS"])
        open_items = [item for item in sources if item["task_type"] == "open_ended_question"]
        self.assertGreaterEqual(len(open_items), 20)
        self.assertTrue(all("WRITE_RESPONSE" in item["allowed_decisions"] for item in open_items))

    def test_all_eleven_review_sections_are_indexed(self):
        self.assertEqual(
            self.pack["sections"],
            [
                "microtraits",
                "persona_modes",
                "weird_question_battery",
                "mode_boundary",
                "generic_good_mismatch",
                "reverse_controls",
                "register_differences",
                "antipatterns",
                "open_ended_answers",
                "contradictions",
                "final_grammar_review",
            ],
        )
        self.assertEqual(set(self.manifest["section_counts"]), set(self.pack["sections"]))
        sources = [item for item in self.pack["decision_items"] if not item["blind_repeat"]]
        expected_source_counts = {
            section: sum(item["section"] == section for item in sources)
            for section in self.pack["sections"]
        }
        self.assertEqual(self.manifest["source_section_counts"], expected_source_counts)
        self.assertTrue(all(count > 0 for count in expected_source_counts.values()))
        self.assertGreaterEqual(expected_source_counts["antipatterns"], 8)
        self.assertGreaterEqual(expected_source_counts["register_differences"], 6)
        self.assertGreaterEqual(expected_source_counts["contradictions"], 4)
        self.assertGreaterEqual(expected_source_counts["final_grammar_review"], 2)

    def test_public_safe_target_refs_link_every_decision_to_evidence(self):
        allowed_types = {"microtrait", "mode", "antipattern", "contradiction", "grammar"}
        owner_seed_id = self.pack["owner_asserted_mode_seed"]["mode_id"].casefold()
        actual_counts = {target_type: 0 for target_type in sorted(allowed_types)}
        unique_ids = {target_type: set() for target_type in sorted(allowed_types)}
        for item in self.pack["decision_items"]:
            self.assertGreater(len(item["target_refs"]), 0, item["item_id"])
            keys = set()
            for ref in item["target_refs"]:
                self.assertEqual(set(ref), {"target_type", "target_id"})
                self.assertIn(ref["target_type"], allowed_types)
                self.assertRegex(ref["target_id"], r"^[a-z][a-z0-9_.-]{2,127}$")
                key = (ref["target_type"], ref["target_id"])
                self.assertNotIn(key, keys)
                keys.add(key)
                actual_counts[ref["target_type"]] += 1
                unique_ids[ref["target_type"]].add(ref["target_id"])
        self.assertEqual(self.manifest["linked_decision_item_count"], 190)
        self.assertEqual(self.manifest["target_ref_item_count"], 190)
        self.assertEqual(self.manifest["target_ref_total_count"], sum(actual_counts.values()))
        self.assertEqual(self.manifest["target_ref_counts"], actual_counts)
        self.assertEqual(
            self.manifest["unique_target_ref_counts"],
            {target_type: len(values) for target_type, values in unique_ids.items()},
        )
        self.assertEqual(len(unique_ids["microtrait"]), 74)
        self.assertEqual(len(unique_ids["mode"]), 12)
        self.assertGreaterEqual(len(unique_ids["antipattern"]), 26)
        self.assertGreaterEqual(len(unique_ids["contradiction"]), 7)
        self.assertGreaterEqual(len(unique_ids["grammar"]), 33)
        summary = self.pack["target_ref_summary"]
        for key in [
            "required_high_value_target_counts",
            "covered_high_value_target_counts",
            "uncovered_high_value_target_counts",
        ]:
            self.assertEqual(self.manifest[key], summary[key])
        self.assertEqual(summary["required_high_value_target_counts"], summary["covered_high_value_target_counts"])
        self.assertTrue(all(count == 0 for count in summary["uncovered_high_value_target_counts"].values()))
        self.assertEqual(self.manifest["uncovered_high_value_target_ref_count"], 0)
        sources = [item for item in self.pack["decision_items"] if not item["blind_repeat"]]
        self.assertTrue(
            any(
                ref["target_type"] == "mode" and ref["target_id"].casefold() == owner_seed_id
                for item in sources
                for ref in item["target_refs"]
            )
        )
        source_inventory = {
            target_type: {
                ref["target_id"]
                for item in sources
                for ref in item["target_refs"]
                if ref["target_type"] == target_type
            }
            for target_type in allowed_types
        }
        self.assertEqual(len(source_inventory["microtrait"]), 74)
        self.assertEqual(len(source_inventory["mode"]), 12)
        boundary_sources = [item for item in sources if item.get("scenario_pair")]
        boundary_targets = {
            target_type: {
                ref["target_id"]
                for item in boundary_sources
                for ref in item["target_refs"]
                if ref["target_type"] == target_type
            }
            for target_type in ["microtrait", "mode"]
        }
        self.assertEqual(len(boundary_targets["microtrait"]), 74)
        self.assertEqual(len(boundary_targets["mode"]), 12)

    def test_optional_write_categories_are_balanced(self):
        categories = {}
        for prompt in self.pack["optional_owner_write_prompts"]:
            categories[prompt["category"]] = categories.get(prompt["category"], 0) + 1
        self.assertEqual(
            categories,
            {
                "ordinary": 4,
                "weird": 4,
                "AI-meta": 4,
                "technical": 4,
                "philosophy": 4,
                "light_emotional": 4,
                "project": 4,
                "casual_banter": 4,
                "role-play": 4,
                "deliberately_ambiguous": 4,
            },
        )

    def test_special_seed_and_deprecated_label_are_not_model_outputs(self):
        seed = self.pack["owner_asserted_mode_seed"]
        self.assertEqual(seed["mode_id"], "SYNTHETIC_PERSONA_SEED")
        self.assertEqual(seed["boundary_status"], "BOUNDARY_NOT_YET_KNOWN")
        self.assertFalse(seed["implemented"])
        deprecated = self.pack["deprecated_labels"][0]
        self.assertEqual(deprecated["label"], "SYNTHETIC_COARSE_LABEL")
        self.assertEqual(deprecated["status"], "DEPRECATED_OVERSIMPLIFIED_LABEL")
        self.assertFalse(deprecated["usable_as_model_class"])

    def test_import_sanitizer_constrains_decisions_and_ranks(self):
        script = (TEMPLATE_ROOT / "review.js").read_text(encoding="utf-8")
        self.assertIn("item.allowed_decisions.includes(response.decision)", script)
        self.assertIn('["1", "2", "3"].includes(rank)', script)
        self.assertIn("scenario_decision_options.includes", script)
        self.assertIn('decision === "PAIR_DECISION" && scenarioOptions.includes', script)

    def test_generated_ui_files_and_manifest(self):
        for filename in ["index.html", "review.css", "review.js", "review_seed.js", "initial_review_state.json", "manifest.json", "README.md"]:
            self.assertTrue((self.ui_path / filename).is_file(), filename)
        self.assertEqual(self.manifest["decision_item_count"], 190)
        self.assertEqual(self.manifest["optional_owner_write_prompt_count"], 40)
        self.assertFalse(self.manifest["owner_answers_present"])
        self.assertFalse(self.manifest["owner_labels_present"])
        self.assertFalse(self.manifest["network_required"])

    def test_zero_network_content_security_policy(self):
        html = (TEMPLATE_ROOT / "index.html").read_text(encoding="utf-8")
        script = (TEMPLATE_ROOT / "review.js").read_text(encoding="utf-8")
        self.assertIn("connect-src 'none'", html)
        self.assertIn("default-src 'none'", html)
        for forbidden in ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource"]:
            self.assertNotIn(forbidden, html)
            self.assertNotIn(forbidden, script)

    def test_local_autosave_export_and_condition_validation(self):
        script = (TEMPLATE_ROOT / "review.js").read_text(encoding="utf-8")
        self.assertIn("localStorage.setItem", script)
        self.assertIn("localStorage.getItem", script)
        self.assertIn('response.review_action === "DEPENDS"', script)
        self.assertIn('response.decision === "IT_DEPENDS"', script)
        self.assertIn("NONE_OF_THESE", json.dumps(self.pack, ensure_ascii=False))
        self.assertIn("owner_review_completed = false", script)
        self.assertIn("profile_frozen = false", script)
        self.assertIn("training_authorized = false", script)
        self.assertIn("training_started = false", script)
        self.assertIn("repeatConsistency()", script)
        self.assertIn("canonical_option_id", script)
        self.assertIn("canonical_scenario_id", script)
        self.assertIn('response.decision === "PAIR_DECISION"', script)
        self.assertIn('response.decision === "SUBMIT_EDIT"', script)
        self.assertIn('response.decision !== "PAIR_DECISION"', script)
        self.assertIn("measures the underlying normalized choice/rank/pair outcome only.", script)
        self.assertNotIn("JSON.stringify({ review_action: response.review_action, outcome })", script)

    def test_javascript_syntax(self):
        for path in [BUILDER, TEMPLATE_ROOT / "review.js"]:
            completed = subprocess.run(
                ["node", "--check", str(path)],
                cwd=ROOT,
                text=True,
                capture_output=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)


if __name__ == "__main__":
    unittest.main()
