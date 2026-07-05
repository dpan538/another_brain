import unittest

from src.training.model_lab.device_probe_safe import run_safe_device_probe
from src.training.model_lab.resource_guard import CPU_SAFE_ENV


class ResourceSafeDeviceProbeTests(unittest.TestCase):
    def test_probe_uses_cpu_safe_defaults(self):
        report = run_safe_device_probe()
        self.assertTrue(report["ok"])
        self.assertEqual(report["cpu_safe_env"], CPU_SAFE_ENV)
        self.assertIn("mps_is_available", report)
        self.assertFalse(report["mps_repair_loop_attempted"])


if __name__ == "__main__":
    unittest.main()
