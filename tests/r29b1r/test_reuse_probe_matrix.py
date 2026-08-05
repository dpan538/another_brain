import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.r29b1r_run_supervisor import Environment, Supervisor


class ReuseProbeMatrixTests(unittest.TestCase):
    def test_only_complete_separated_timeout_matrix_is_reusable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reports = root / "reports"
            reports.mkdir()
            evidence = {
                "modes": {
                    mode: {
                        "imports": [
                            {"last_marker": "before_torch_import", "timed_out": True}
                            for _ in range(5)
                        ],
                        "cpu_smoke": None,
                        "cpu_passed": False,
                    }
                    for mode in ("inherited", "clean")
                }
            }
            (reports / "primary_probe_matrix.json").write_text(json.dumps(evidence))
            environment = Environment("primary", Path("/venv/bin/python"), Path("/install.json"), "2.13.0")
            with patch.object(Supervisor, "get_sample_help", return_value={}):
                supervisor = Supervisor(artifact_root=root, prior_artifact_root=root, reuse_existing_probe_matrix=True)
            reused = supervisor.verified_existing_matrix(environment)
            self.assertTrue(reused["reused_after_supervisor_repair"])

    def test_a_completed_marker_is_not_misrepresented_as_a_timeout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "reports").mkdir()
            evidence = {"modes": {mode: {"imports": [{"last_marker": "probe_complete", "timed_out": True}] * 5, "cpu_smoke": None, "cpu_passed": False} for mode in ("inherited", "clean")}}
            (root / "reports" / "primary_probe_matrix.json").write_text(json.dumps(evidence))
            environment = Environment("primary", Path("/venv/bin/python"), Path("/install.json"), "2.13.0")
            with patch.object(Supervisor, "get_sample_help", return_value={}):
                supervisor = Supervisor(artifact_root=root, prior_artifact_root=root, reuse_existing_probe_matrix=True)
            with self.assertRaisesRegex(RuntimeError, "unexpected_existing_import_evidence"):
                supervisor.verified_existing_matrix(environment)
