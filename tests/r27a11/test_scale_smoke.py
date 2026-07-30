import unittest

from src.training.model_lab.r27a11_scale_catalog import params_for_r27a11


class R27A11ScaleSmokeTests(unittest.TestCase):
    def test_near100m_catalog_orders_expected_sizes(self):
        sizes = {name: params_for_r27a11(name) for name in ["new_60m", "new_80m", "new_90m", "new_96m", "new_100m_research"]}
        self.assertLess(sizes["new_60m"], sizes["new_80m"])
        self.assertLess(sizes["new_80m"], sizes["new_90m"])
        self.assertLess(sizes["new_90m"], sizes["new_96m"])
        self.assertLess(sizes["new_96m"], sizes["new_100m_research"])
        self.assertLess(sizes["new_96m"], 100_000_000)


if __name__ == "__main__":
    unittest.main()
