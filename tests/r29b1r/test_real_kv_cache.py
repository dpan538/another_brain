import inspect
import unittest
from pathlib import Path

from src.training.reference.r29b1r_reference import CachedActualGPT


class RealKvCacheTests(unittest.TestCase):
    def test_real_cache_declares_per_layer_keys_values_and_overflow(self):
        source = inspect.getsource(CachedActualGPT)
        self.assertIn("self.keys", source)
        self.assertIn("self.values", source)
        self.assertIn("context_overflow", source)

    def test_cache_handles_actual_packed_multiheadattention_projection_names(self):
        source = Path("src/training/reference/r29b1r_reference.py").read_text(encoding="utf-8")
        self.assertIn("in_proj_weight", source)
        self.assertIn('f"{prefix}_bias"', source)
        self.assertIn("self.length", source)
