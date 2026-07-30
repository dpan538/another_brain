import unittest

from src.training.campaign.r27a8b_resource_guard import apply_thread_limits, preflight_resource_guard
from src.training.campaign.r27a8b_slow_ramp import ramp_passed, slow_ramp_plan


class R27A8BResourceGuardSlowRampTests(unittest.TestCase):
    def test_thread_limits_are_conservative(self):
        report = apply_thread_limits()
        self.assertEqual(report["env"]["OMP_NUM_THREADS"], "2")
        self.assertEqual(report["env"]["MKL_NUM_THREADS"], "2")
        self.assertEqual(report["env"]["VECLIB_MAXIMUM_THREADS"], "2")

    def test_preflight_report_has_disk_and_write_check(self):
        report = preflight_resource_guard()
        self.assertIn("disk_free_bytes", report)
        self.assertIn("checkpoint_write_check", report)
        self.assertTrue(report["clipped_logs"])

    def test_slow_ramp_sequence_blocks_unexpected_checkpoint(self):
        results = []
        for item in slow_ramp_plan():
            results.append({"stage_id": item["stage_id"], "ok": True, "train_loss_end": 1.0, "checkpoint_written": False})
        ok, blockers = ramp_passed(results)
        self.assertTrue(ok)
        self.assertEqual(blockers, [])
        results[0]["checkpoint_written"] = True
        ok, blockers = ramp_passed(results)
        self.assertFalse(ok)
        self.assertIn("micro_sanity_unexpected_checkpoint", blockers)
