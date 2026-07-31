import unittest
from pathlib import Path

from src.training.campaign import r29a7_post_eos_rebaseline as campaign
from src.training.campaign.r29a0_masked_debug import format_prompt


class R29A7IndependentControllerTests(unittest.TestCase):
    def test_contract_binds_policy_id_artifact_and_marker(self):
        contract = campaign._contract()
        self.assertTrue(contract["ok"])
        self.assertEqual(contract["campaign_id"], campaign.POLICY["campaign_id"])
        self.assertEqual(contract["artifact_root"].rsplit("/", 1)[-1], "r29a7")
        invalid = campaign.RunConfig(campaign_id="wrong", artifact_root=Path("artifacts/wrong"), policy=campaign.POLICY)
        self.assertFalse(campaign._contract(invalid)["ok"])

    def test_mix_is_disjoint_and_has_one_wrapper(self):
        report = campaign.build_mix(write_artifacts=False)
        self.assertTrue(report["ok"])
        self.assertEqual(report["split_source_overlap"], [])
        prompt = format_prompt(campaign._row(campaign.TRAIN_CARDS[0], 0, "train"))
        self.assertEqual(prompt.count("用户："), 1)
        self.assertEqual(prompt.count("回答："), 1)

    def test_controller_does_not_import_prior_r29_wrapper(self):
        source = campaign.__file__
        contents = Path(source).read_text(encoding="utf-8")
        self.assertNotIn("r29a6_single_wrapper_anchor", contents)
        self.assertNotIn("r29a5_chat_format_anchor", contents)

    def test_slow_phases_write_current_run_heartbeat(self):
        contents = Path(campaign.__file__).read_text(encoding="utf-8")
        self.assertIn('"loading_model_and_baseline"', contents)
        self.assertIn('if steps % 25 == 0: _heartbeat', contents)
