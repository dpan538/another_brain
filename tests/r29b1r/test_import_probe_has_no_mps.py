import inspect
import unittest

from scripts import r29b1r_probe_torch


class ImportProbeHasNoMpsTests(unittest.TestCase):
    def test_import_only_source_does_not_reference_backend_queries(self):
        source = inspect.getsource(r29b1r_probe_torch.import_torch_only)
        self.assertNotIn("backends", source)
        self.assertNotIn("mps", source.lower())
        self.assertNotIn("device(", source)
