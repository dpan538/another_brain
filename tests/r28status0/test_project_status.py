import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "r28status0_project_status.py"


class R28Status0ProjectStatusTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["python3", str(SCRIPT)],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        cls.report = json.loads(result.stdout)

    def test_required_outputs_exist(self):
        outputs = self.report["specific_outputs"]
        for key in [
            "model_has_lora",
            "model_has_static_q4_assets",
            "model_runtime_forward",
            "model_text_decode",
            "frontend_calls_model",
            "rag_status",
            "anchors_training_allowed_count",
            "old_excluded_rows_blocked",
            "release_readiness_label",
        ]:
            self.assertIn(key, outputs)

    def test_static_q4_and_no_lora_truth(self):
        outputs = self.report["specific_outputs"]
        self.assertFalse(outputs["model_has_lora"])
        self.assertTrue(outputs["model_has_static_q4_assets"])
        self.assertEqual(outputs["model_text_decode"], "exact")

    def test_anchor_boundary_and_no_answer_bank(self):
        sections = self.report["sections"]
        self.assertGreaterEqual(self.report["specific_outputs"]["anchors_training_allowed_count"], 1)
        self.assertTrue(self.report["specific_outputs"]["old_excluded_rows_blocked"])
        self.assertFalse(sections["answer_surface_router"]["answer_bank_present"])

    def test_docs_written(self):
        for rel in [
            "docs/r28/R28STATUS0_PROJECT_PROGRESS.md",
            "docs/r28/R28STATUS0_BLOCKER_LEDGER.md",
            "docs/r28/R28STATUS0_NEXT_ACTIONS.md",
        ]:
            path = ROOT / rel
            self.assertTrue(path.exists(), rel)
            text = path.read_text(encoding="utf-8")
            self.assertIn("R28STATUS0", text)

    def test_non_claims(self):
        non_claims = self.report["non_claims"]
        self.assertTrue(non_claims["not_product_model"])
        self.assertTrue(non_claims["not_product_admission"])
        self.assertTrue(non_claims["no_training"])
        self.assertTrue(non_claims["no_backend_inference"])
        self.assertTrue(non_claims["no_external_llm_api"])


if __name__ == "__main__":
    unittest.main()
