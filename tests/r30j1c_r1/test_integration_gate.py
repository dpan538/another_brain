from __future__ import annotations

import json
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]
BASE = "175e7d30490728bab2ec9bd6b3fce08875ed8694"


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=False)


class R30J1CR1IntegrationGateTests(unittest.TestCase):
    def test_no_production_change_gate(self):
        result = subprocess.run(
            ["node", "scripts/r30j1c_r1_no_production_change_gate.mjs"],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        report = json.loads(result.stdout)
        self.assertEqual(report["base_revision"], BASE)
        self.assertTrue(report["base_is_ancestor"])
        self.assertTrue(report["passed"])
        for key in (
            "unexpected_path_count",
            "production_surface_diff_count",
            "forbidden_path_count",
            "unsafe_change_status_count",
            "private_absolute_path_count",
            "secret_material_count",
            "network_call_code_count",
            "unsafe_file_type_count",
            "oversized_public_contract_file_count",
            "historical_state_diff_count",
        ):
            self.assertEqual(report[key], 0, key)
        self.assertTrue(report["package_contract"]["passed"])
        self.assertEqual(report["package_contract"]["added_script_count"], 5)

    def test_historical_contract_files_unchanged(self):
        protected = (
            "config/r30j0_personal_source_discovery_v1.json",
            "config/r30j0_p2_persona_excavation_v1.json",
            "config/r30j1a_personal_representation_bootstrap_v1.json",
            "docs/R30J0_PERSONAL_SOURCE_EVIDENCE_METHOD.md",
            "docs/R30J0_P2_PERSONA_EXCAVATION_METHOD.md",
            "docs/R30J1A_DESCRIPTIVE_PERSONAL_REPRESENTATION_BOOTSTRAP.md",
        )
        result = git("diff", "--quiet", BASE, "--", *protected)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_private_artifacts_are_ignored_and_untracked(self):
        artifact = "artifacts/r30j1c/owner_correction_pack"
        ignored = git("check-ignore", "-q", artifact)
        self.assertEqual(ignored.returncode, 0)
        tracked = git("ls-files", artifact)
        self.assertEqual(tracked.stdout.strip(), "")

    def test_package_commands_are_offline_and_zero_training(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        expected = {
            "r30j1c-r1:build-review-ui": "python3 scripts/r30j1c_r1_build_review_ui.py",
            "r30j1c-r1:audit-sources": "python3 scripts/r30j1c_r1_audit_source_availability.py",
            "r30j1c-r1:finalize-blocked": "python3 scripts/r30j1c_r1_finalize_blocked.py",
            "r30j1c-r1:production-diff-gate": "node scripts/r30j1c_r1_no_production_change_gate.mjs",
            "test:r30j1c-r1": "python3 -m unittest discover -s tests/r30j1c_r1 -q",
        }
        for name, command in expected.items():
            self.assertEqual(package["scripts"][name], command)
            self.assertNotRegex(command, r"https?://|curl|wget|train|deploy|vercel|\.env")


if __name__ == "__main__":
    unittest.main()
