import os
import unittest

from scripts.r28livefix0_merge_readiness_gate import merge_readiness_gate


class R28Livefix0MergeReadinessGateTests(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("R28LIVEFIX0_LIVE_DIAGNOSTICS_JSON", None)

    def test_fixture_only_gate_is_not_merge_ready(self):
        os.environ.pop("R28LIVEFIX0_LIVE_DIAGNOSTICS_JSON", None)
        report = merge_readiness_gate(write_report=False)
        self.assertEqual(report["decision_label"], "preview_ready_not_merge_ready")
        self.assertFalse(report["live_q4_mount_verified"])
        self.assertFalse(report["fixture_only_merge_ready_allowed"])
        self.assertIn("live_diagnostics_missing", report["failures"])

    def test_live_diagnostics_can_upgrade_to_merge_ready(self):
        os.environ["R28LIVEFIX0_LIVE_DIAGNOSTICS_JSON"] = """
        {
          "branch_marker": "R28LIVEFIX0",
          "q4_shards": [
            {"ok": true, "bytes_read": 16},
            {"ok": true, "bytes_read": 16},
            {"ok": true, "bytes_read": 16},
            {"ok": true, "bytes_read": 16},
            {"ok": true, "bytes_read": 16}
          ],
          "q4_forward": {"q4_forward_ran": true, "tokens_generated": 1},
          "merge_runtime_ready": true
        }
        """
        report = merge_readiness_gate(write_report=False)
        self.assertEqual(report["decision_label"], "merge_ready")
        self.assertTrue(report["live_q4_mount_verified"])

    def test_asset_probe_failure_blocks_live_q4_mount(self):
        os.environ["R28LIVEFIX0_LIVE_DIAGNOSTICS_JSON"] = """
        {
          "branch_marker": "R28LIVEFIX0",
          "q4_shards": [
            {"ok": false, "bytes_read": 0, "failure_reason": "asset_probe_failed:/another_brain/model_assets/r28m1/shards/model-q4-00001.bin:0:0"}
          ],
          "q4_forward": {"q4_forward_ran": false, "blocker": "asset_probe_failed"},
          "merge_runtime_ready": false
        }
        """
        report = merge_readiness_gate(write_report=False)
        self.assertEqual(report["decision_label"], "blocked_live_q4_mount")


if __name__ == "__main__":
    unittest.main()
