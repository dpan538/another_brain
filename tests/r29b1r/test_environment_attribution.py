import unittest
from pathlib import Path

from scripts.r29b1r_run_supervisor import clean_environment


class EnvironmentAttributionTests(unittest.TestCase):
    def test_clean_environment_removes_site_and_loader_contamination(self):
        environment, removed = clean_environment(
            python=Path("/isolated/bin/python"),
            inherited={"HOME": "/home/test", "TMPDIR": "/tmp/test", "PYTHONPATH": "/project", "DYLD_LIBRARY_PATH": "/bad", "KEEP": "ignored"},
        )
        self.assertEqual(environment["PYTHONNOUSERSITE"], "1")
        self.assertEqual(environment["OMP_NUM_THREADS"], "1")
        self.assertNotIn("PYTHONPATH", environment)
        self.assertIn("PYTHONPATH", removed)
        self.assertIn("DYLD_LIBRARY_PATH", removed)

    def test_import_only_failure_defaults_to_diagnostic_block_not_host_claim(self):
        source = Path("scripts/r29b1r_run_supervisor.py").read_text(encoding="utf-8")
        blocked = source.index('"BLOCKED_WITH_DIAGNOSTIC_EVIDENCE",\n                reason="import_only_failed_in_clean_and_inherited_matrix_during_libtorch_cpu_initializer_diagnostics"')
        self.assertNotIn("write_host_probe_bundle(environments[0], dynamic)", source)
        self.assertGreater(blocked, source.index("if selected is None:"))
