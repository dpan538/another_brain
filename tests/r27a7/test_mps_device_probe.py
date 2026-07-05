import unittest

from src.training.model_lab.mps_probe import run_mps_probe, torch_device_info


class R27A7MpsDeviceProbeTests(unittest.TestCase):
    def test_torch_device_info_schema(self):
        info = torch_device_info()
        self.assertIn("mps_is_available", info)
        self.assertIn("mps_is_built", info)
        self.assertIn("cuda_is_available", info)

    def test_probe_has_benchmark_list(self):
        report = run_mps_probe()
        self.assertIn("benchmarks", report)
        self.assertIn(report["device"], {"cpu", "mps", "cuda"})


if __name__ == "__main__":
    unittest.main()
