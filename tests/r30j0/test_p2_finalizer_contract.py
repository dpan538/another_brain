from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "r30j0_p2_finalize.py"


def load_module():
    spec = importlib.util.spec_from_file_location("r30j0_p2_finalize", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class P2FinalizerContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module()

    def complete_summary(self) -> dict[str, object]:
        return {
            "historical_sources_reexamined": 1_152,
            "normative_personal_evidence_count": 1,
            "microtrait_hypothesis_count": 40,
            "persona_mode_hypothesis_count": 1,
            "register_count": 15,
            "antipattern_count": 1,
            "contradiction_count": 1,
            "unresolved_question_count": 1,
            "elicitation_item_count": 190,
            "crocodile_mode_seed_present": True,
            "crocodile_mode_boundary_known": False,
            "deprecated_wired_label_removed": True,
            "owner_review_v2_ready": True,
            "retained_microtrait_count": 0,
            "review_linked_microtrait_count": 40,
            "review_linked_mode_count": 1,
            "review_linked_antipattern_count": 1,
            "review_linked_contradiction_count": 1,
            "unresolved_review_target_ref_count": 0,
            "microtrait_positive_trigger_unique_count": 40,
            "microtrait_negative_trigger_unique_count": 40,
            "antipattern_trigger_context_unique_count": 1,
        }

    def test_valid_aggregate_summary_passes(self) -> None:
        self.module.require_summary_contract(self.complete_summary())

    def test_descriptive_volume_cannot_replace_microtrait_floor(self) -> None:
        summary = self.complete_summary()
        summary["historical_sources_reexamined"] = 10_000
        summary["microtrait_hypothesis_count"] = 39
        with self.assertRaisesRegex(ValueError, "microtrait_hypothesis_floor_not_met"):
            self.module.require_summary_contract(summary)

    def test_unreviewed_hypotheses_cannot_be_retained_as_preferences(self) -> None:
        summary = self.complete_summary()
        summary["retained_microtrait_count"] = 1
        with self.assertRaisesRegex(ValueError, "unreviewed_microtrait_was_retained"):
            self.module.require_summary_contract(summary)

    def test_finalizer_writes_only_inside_p2_artifact_root(self) -> None:
        self.assertEqual(
            self.module.P2_ROOT,
            ROOT / "artifacts" / "r30j0" / "persona_excavation",
        )
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn('ARTIFACT_ROOT / "campaign_state.json"', source)
        self.assertNotIn('REPORT_ROOT = ARTIFACT_ROOT / "reports"', source)

    def test_double_terminal_is_review_required_not_training_authority(self) -> None:
        self.assertEqual(
            self.module.PHASE_TERMINAL,
            "R30J0_P2_PERSONA_EXCAVATION_READY",
        )
        self.assertEqual(
            self.module.NEXT_STATE,
            "HUMAN_PERSONA_ELICITATION_REQUIRED",
        )
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn('"r30j1_authorized": False', source)
        self.assertIn('"training_started": False', source)


if __name__ == "__main__":
    unittest.main()
