import json
import subprocess
import unittest
from pathlib import Path

from scripts.r28e1_acceptance_matrix import (
    EXPECTED_SCENARIO_IDS,
    SCENARIOS,
    build_acceptance_matrix,
)


ROOT = Path(__file__).resolve().parents[2]
DOCS = [
    ROOT / "docs/r28/R28E1_ACCEPTANCE_MATRIX.md",
    ROOT / "docs/r28/R28E1_PRELAUNCH_ACCEPTANCE_MATRIX.md",
    ROOT / "docs/r28/R28E1_NON_CLAIMS.md",
]


class R28E1AcceptanceMatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = build_acceptance_matrix()

    def test_matrix_defines_exact_30_scenarios(self):
        self.assertEqual([spec.id for spec in SCENARIOS], EXPECTED_SCENARIO_IDS)
        self.assertEqual(len(SCENARIOS), 30)

    def test_matrix_passes_all_scenarios(self):
        self.assertTrue(self.report["ok"], self.report["scenarios"])
        self.assertEqual(self.report["scenario_count"], 30)
        self.assertEqual(self.report["passed"], 30)
        self.assertEqual(self.report["failed"], 0)

    def test_matrix_preserves_non_claims_and_budget(self):
        self.assertFalse(self.report["non_claims"]["training"])
        self.assertFalse(self.report["non_claims"]["model_assets_committed"])
        self.assertFalse(self.report["non_claims"]["backend_inference"])
        self.assertFalse(self.report["non_claims"]["external_llm"])
        self.assertFalse(self.report["non_claims"]["doubao"])
        self.assertFalse(self.report["non_claims"]["hosted_vector_store"])
        self.assertFalse(self.report["non_claims"]["product_admission"])
        self.assertLess(
            self.report["budget"]["build_output_bytes"],
            self.report["budget"]["max_total_static_bytes"],
        )
        self.assertEqual(self.report["budget"]["model_declared_bytes"], 0)
        self.assertEqual(self.report["budget"]["tokenizer_declared_bytes"], 0)

    def test_cli_emits_machine_readable_json_without_writing_report(self):
        result = subprocess.run(
            ["python3", "scripts/r28e1_acceptance_matrix.py", "--no-write-report"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        payload = json.loads(result.stdout)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["scenario_count"], 30)
        self.assertEqual(payload["passed"], 30)

    def test_docs_cover_every_matrix_scenario(self):
        combined = "\n".join(path.read_text(encoding="utf-8") for path in DOCS)
        for path in DOCS:
            self.assertTrue(path.exists(), path)
            self.assertIn("R28E1", path.read_text(encoding="utf-8"))
        for scenario_id in EXPECTED_SCENARIO_IDS:
            self.assertIn(f"`{scenario_id}`", combined)


if __name__ == "__main__":
    unittest.main()
