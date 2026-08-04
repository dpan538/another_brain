import unittest

from scripts.r29b1_environment_stage import TORCH_DIRECT_REQUIREMENTS, TEST_REQUIREMENTS


class EnvironmentManifestTests(unittest.TestCase):
    def test_environment_uses_only_required_runtime_and_test_dependencies(self):
        self.assertNotIn("torchvision", TORCH_DIRECT_REQUIREMENTS + TEST_REQUIREMENTS)
        self.assertNotIn("torchaudio", TORCH_DIRECT_REQUIREMENTS + TEST_REQUIREMENTS)
        self.assertIn("pytest", TEST_REQUIREMENTS)
        self.assertIn("numpy", TEST_REQUIREMENTS)

    def test_torch_212_setuptools_constraint_is_preserved_for_offline_resolution(self):
        self.assertIn("setuptools<82", TORCH_DIRECT_REQUIREMENTS)
