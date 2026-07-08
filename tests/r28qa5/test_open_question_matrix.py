import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "artifacts" / "r28qa5" / "reports" / "open_question_matrix.json"


class R28QA5OpenQuestionMatrixTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            [sys.executable, "scripts/r28qa5_open_question_matrix.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        cls.output = result.stdout + result.stderr
        cls.returncode = result.returncode

    def load_report(self):
        self.assertEqual(self.returncode, 0, self.output)
        self.assertTrue(REPORT.exists())
        return json.loads(REPORT.read_text(encoding="utf-8"))

    def test_matrix_passes_all_rows(self):
        payload = self.load_report()
        self.assertEqual(payload["status"], "pass")
        self.assertEqual(len(payload["rows"]), 10)
        self.assertEqual(payload["merge_blockers"], [])
        self.assertTrue(all(row["pass"] for row in payload["rows"]))

    def test_open_questions_show_q4_attempt_and_tokens_or_timeout(self):
        payload = self.load_report()
        open_rows = [row for row in payload["rows"] if row["kind"] not in {"micro"}]
        self.assertTrue(open_rows)
        self.assertTrue(all(row["q4_attempted"] for row in open_rows))
        self.assertTrue(any(row["tokens_generated"] > 0 for row in open_rows))
        timeout_rows = [row for row in open_rows if row["generation_status"] == "timeout"]
        self.assertEqual(len(timeout_rows), 1)
        self.assertIn("q4_generation_timeout", timeout_rows[0]["fallback_reason"])

    def test_identity_and_greeting_are_fast_router_surfaces(self):
        payload = self.load_report()
        micro_rows = [row for row in payload["rows"] if row["kind"] == "micro"]
        self.assertEqual(len(micro_rows), 4)
        for row in micro_rows:
            self.assertFalse(row["q4_attempted"], row)
            self.assertLess(row["response_time_ms"], 1500, row)
            self.assertEqual(row["answer_source"], "router_surface", row)

    def test_required_columns_exist(self):
        payload = self.load_report()
        required = {
            "pass",
            "q4_attempted",
            "tokens_generated",
            "fallback_reason",
            "response_time_ms",
            "answer_source",
            "quality_flag",
        }
        for row in payload["rows"]:
            self.assertTrue(required.issubset(row), row)


if __name__ == "__main__":
    unittest.main()
