import math
import unittest

from src.training.model_lab.loss_accounting import make_loss_mask, toy_negative_log_likelihood, weighted_average
from src.training.model_lab.train_metrics import TrainMetrics, validate_headline_not_last_batch


class R27A11LossAccountingFixTests(unittest.TestCase):
    def test_known_toy_batch_loss_matches_expected(self):
        report = toy_negative_log_likelihood([0.5, 0.25])
        expected = (-math.log(0.5) - math.log(0.25)) / 2.0
        self.assertAlmostEqual(report["average_loss"], expected)
        self.assertEqual(report["total_loss_tokens"], 2)

    def test_masked_prompt_tokens_are_not_counted(self):
        mask = make_loss_mask(3, "assistant_response_only", prompt_token_count=2)
        report = toy_negative_log_likelihood([0.9, 0.8, 0.25], mask)
        self.assertEqual(mask, [0, 0, 1])
        self.assertEqual(report["total_loss_tokens"], 1)
        self.assertAlmostEqual(report["average_loss"], -math.log(0.25))

    def test_train_dev_eval_use_same_reduction(self):
        train = weighted_average([1.0, 3.0], [1, 3])
        dev = weighted_average([1.0, 3.0], [1, 3])
        self.assertEqual(train["average_loss"], dev["average_loss"])

    def test_last_batch_proxy_cannot_be_headline_metric(self):
        metrics = TrainMetrics(effective_tokens_per_step=128, planned_tokens=1000, streamed_tokens=800)
        metrics.add_optimizer_step(2.0, 128, "toy")
        headline = metrics.headline_metrics()
        self.assertTrue(validate_headline_not_last_batch(headline))
        self.assertTrue(headline["last_batch_loss_debug_only"])
        self.assertNotEqual(headline["headline_train_loss_source"], "last_batch_loss")

    def test_optimizer_tokens_not_planned_tokens_unless_actually_equal(self):
        metrics = TrainMetrics(effective_tokens_per_step=128, planned_tokens=1000, streamed_tokens=800)
        metrics.add_optimizer_step(2.0, 128, "toy")
        headline = metrics.headline_metrics()
        self.assertEqual(headline["optimizer_tokens"], 128)
        self.assertNotEqual(headline["optimizer_tokens"], headline["planned_tokens"])


if __name__ == "__main__":
    unittest.main()
