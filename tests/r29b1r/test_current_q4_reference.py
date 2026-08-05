import inspect
import unittest

from src.training.reference import r29b1r_q4


class CurrentQ4ReferenceTests(unittest.TestCase):
    def test_current_q4_unpack_handles_signed_nibbles_and_bool_masks(self):
        source = inspect.getsource(r29b1r_q4.load_current_q4)
        self.assertIn("values >= 8", source)
        self.assertIn("bitpack_bool", source)
        self.assertIn("shard_integrity", source)
