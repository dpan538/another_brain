import subprocess
import unittest
from pathlib import Path

from scripts.r27e0_acceptance_check import SCENARIOS, build_acceptance_report


ROOT = Path(__file__).resolve().parents[2]
DOCS = [
    ROOT / "docs/r27/R27E0_48H_DEMO_RUNBOOK.md",
    ROOT / "docs/r27/R27E0_ACCEPTANCE_CRITERIA.md",
    ROOT / "docs/r27/R27E0_MANUAL_QA_SCRIPT.md",
]


class R27E0AcceptanceDocsTests(unittest.TestCase):
    def test_docs_exist_and_cover_every_acceptance_scenario(self):
        combined = "\n".join(path.read_text(encoding="utf-8") for path in DOCS)
        for path in DOCS:
            self.assertTrue(path.exists(), path)
            self.assertIn("R27E0", path.read_text(encoding="utf-8"))
        for spec in SCENARIOS:
            self.assertIn(f"`{spec.id}`", combined)
            self.assertIn(spec.name, combined)

    def test_runbook_contains_required_acceptance_commands(self):
        runbook = DOCS[0].read_text(encoding="utf-8")
        for command in (
            "npm run test:r27e0",
            "npm run build:vercel",
            "python3 scripts/r27e0_acceptance_check.py",
            "git diff --check",
            "git diff --cached --check",
            "git show --check HEAD",
        ):
            self.assertIn(command, runbook)

    def test_acceptance_checker_reports_all_scenarios_green(self):
        report = build_acceptance_report()
        self.assertTrue(report["ok"], report["scenarios"])
        self.assertEqual(report["scenario_count"], 15)
        self.assertEqual(report["passed"], 15)
        self.assertFalse(report["non_claims"]["training"])
        self.assertFalse(report["non_claims"]["model_admission"])

    def test_acceptance_checker_cli_is_json_and_passes(self):
        result = subprocess.run(
            ["python3", "scripts/r27e0_acceptance_check.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn('"ok": true', result.stdout)
        self.assertIn('"scenario_count": 15', result.stdout)


if __name__ == "__main__":
    unittest.main()
