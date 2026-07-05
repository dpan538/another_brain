import unittest

from src.browser_export.candidate_discovery import synthetic_candidate
from src.browser_export.model_config_bridge import validate_model_config
from src.browser_export.model_reconstruct import reconstruct_candidate_model


class R27B2ModelReconstructionTests(unittest.TestCase):
    def test_synthetic_tiny_reconstruction_uses_training_architecture(self):
        report = reconstruct_candidate_model(synthetic_candidate(), synthetic_if_missing=True)
        self.assertTrue(report["state_loaded"])
        self.assertIn(report["load_state_dict"], {"loaded", "not_loaded"})
        self.assertFalse(report["product_model"])
        self.assertFalse(report["browser_admission"])
        self.assertFalse(report["release_checkpoint"])
        self.assertEqual(validate_model_config(report["model_config"]), [])
        self.assertEqual(report["model_config"]["n_embd"], 16)


if __name__ == "__main__":
    unittest.main()
