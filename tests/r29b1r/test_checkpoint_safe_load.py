import inspect
import unittest

from scripts import r29b1r_reference_worker


class CheckpointSafeLoadTests(unittest.TestCase):
    def test_worker_forces_weights_only_loading(self):
        source = inspect.getsource(r29b1r_reference_worker.load_payload)
        self.assertIn("TORCH_FORCE_WEIGHTS_ONLY_LOAD", source)
        self.assertIn("weights_only=True", source)
        self.assertNotIn("weights_only=False", source)
