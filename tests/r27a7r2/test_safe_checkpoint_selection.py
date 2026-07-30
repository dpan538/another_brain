import unittest

from src.training.campaign.checkpoint_selector_v2 import select_safe_checkpoint


class SafeCheckpointSelectionTests(unittest.TestCase):
    def test_does_not_blindly_select_final(self):
        report = select_safe_checkpoint()
        self.assertTrue(report["ok"])
        self.assertIn(report["selected_kind"], {"r27a7_best_product_probe", "r27a7_best_dev_loss", "r27a7_best_segment", "r27a6_best_checkpoint"})
        if report["final_checkpoint"] != report["selected_checkpoint"]:
            self.assertTrue(report["worse_final_checkpoint_rejected"])


if __name__ == "__main__":
    unittest.main()
