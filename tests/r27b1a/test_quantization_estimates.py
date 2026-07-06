import unittest

from src.browser_export.quantize import budget_fit, estimate_quantization
from src.browser_export.shape_manifest import estimate_sizes


class R27B1AQuantizationEstimateTests(unittest.TestCase):
    def test_size_estimates(self):
        self.assertEqual(estimate_sizes(8), {"fp32_bytes": 32, "fp16_bytes": 16, "int8_bytes": 8, "q4_bytes": 4})

    def test_q4_estimate_has_scale_overhead(self):
        plan = estimate_quantization(8, "q4", tensor_count=2)
        self.assertEqual(plan.weight_bytes, 4)
        self.assertEqual(plan.scale_bytes, 8)
        self.assertEqual(plan.total_bytes, 12)

    def test_budget_fit(self):
        fit = budget_fit(100_000_000, 70_000_000)
        self.assertTrue(fit["fits_model_weight_budget"]["q4"])
        self.assertFalse(fit["fits_model_weight_budget"]["int8"])


if __name__ == "__main__":
    unittest.main()
