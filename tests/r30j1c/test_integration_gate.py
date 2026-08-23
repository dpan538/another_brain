from __future__ import annotations

import json
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]
BASE = "76c1b3f44b7967bf1ae6ad7ca26c8e28ff1cd74e"


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


class R30J1CIntegrationGateTests(unittest.TestCase):
    def test_production_diff_gate_passes_for_scoped_public_contract_changes(self):
        result = subprocess.run(
            ["node", "scripts/r30j1c_no_production_change_gate.mjs"],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
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
            "non_text_or_missing_allowed_file_count",
            "unsafe_file_type_count",
            "oversized_public_contract_file_count",
        ):
            self.assertEqual(report[key], 0, key)
        self.assertTrue(report["package_contract"]["passed"])
        self.assertEqual(report["package_contract"]["added_script_count"], 3)
        self.assertEqual(report["package_contract"]["missing_required_script_count"], 0)

    def test_historical_r30_contracts_are_unchanged_from_base(self):
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

    def test_changed_paths_exclude_private_and_product_surfaces(self):
        result = git("diff", "--name-only", BASE)
        self.assertEqual(result.returncode, 0, result.stderr)
        changed = {line for line in result.stdout.splitlines() if line}
        forbidden_prefixes = (
            "artifacts/",
            "web/",
            "api/",
            "app/api/",
            "pages/api/",
            "functions/",
            "vercel/functions/",
        )
        self.assertFalse(any(path.startswith(forbidden_prefixes) for path in changed))
        forbidden_suffixes = (
            ".png", ".jpg", ".jpeg", ".webp", ".jsonl", ".bin",
            ".safetensors", ".pt", ".pth", ".ckpt", ".gguf", ".onnx",
        )
        self.assertFalse(any(path.casefold().endswith(forbidden_suffixes) for path in changed))

    def test_package_only_adds_scoped_r30j1c_commands(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(
            package["scripts"]["r30j1c:intake-manual-owner-evidence"],
            "python3 scripts/r30j1c_ingest_manual_owner_evidence.py "
            "--input artifacts/r30j1c/manual_owner_evidence/current/source_record.input.json "
            "--image-map artifacts/r30j1c/manual_owner_evidence/current/screenshot_source_map.json "
            "--output artifacts/r30j1c/manual_owner_evidence/current",
        )
        self.assertEqual(
            package["scripts"]["r30j1c:production-diff-gate"],
            "node scripts/r30j1c_no_production_change_gate.mjs",
        )
        self.assertEqual(
            package["scripts"]["test:r30j1c"],
            "python3 -m unittest discover -s tests/r30j1c -q",
        )


if __name__ == "__main__":
    unittest.main()
