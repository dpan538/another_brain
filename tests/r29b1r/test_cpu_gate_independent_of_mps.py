import tempfile
import time
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.r29b1r_probe_torch import import_torch_only
from scripts.r29b1r_run_supervisor import Environment, Supervisor


class CpuGateIndependentOfMpsTests(unittest.TestCase):
    def test_fake_mps_sleep_cannot_block_import_only_gate(self):
        calls = {"mps": 0}

        def sleep_forever():
            calls["mps"] += 1
            time.sleep(60)

        fake_torch = types.SimpleNamespace(__version__="fake", __file__="/fake/torch.py")
        fake_torch.backends = types.SimpleNamespace(mps=types.SimpleNamespace(is_available=sleep_forever))
        with patch.dict("sys.modules", {"torch": fake_torch}):
            result = import_torch_only()
        self.assertEqual(result["torch_version"], "fake")
        self.assertEqual(calls["mps"], 0)

    def test_cpu_probe_is_scheduled_without_any_mps_probe(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(Supervisor, "get_sample_help", return_value={}):
                supervisor = Supervisor(artifact_root=root, prior_artifact_root=root)
            environment = Environment("fake", Path("/fake/python"), root / "install.json", "fake")
            calls = []

            def fake_run_probe(**kwargs):
                calls.append(kwargs["action"])
                return {"exit_code": 0, "timed_out": False, "last_marker": "probe_complete", "stdout_log": str(root / "stdout.log")}

            with patch.object(supervisor, "run_probe", side_effect=fake_run_probe):
                matrix = supervisor.run_environment(environment)
            self.assertTrue(matrix["modes"]["inherited"]["cpu_passed"])
            self.assertIn("cpu-smoke", calls)
            self.assertNotIn("mps-built", calls)
            self.assertNotIn("mps-available", calls)
