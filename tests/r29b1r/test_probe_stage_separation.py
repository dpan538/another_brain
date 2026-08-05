import ast
import inspect
import unittest

from scripts import r29b1r_probe_torch


class ProbeStageSeparationTests(unittest.TestCase):
    def test_import_only_emits_a_marker_before_importing_torch(self):
        source = inspect.getsource(r29b1r_probe_torch.import_torch_only)
        self.assertLess(source.index('emit("before_torch_import")'), source.index("import torch"))

    def test_mps_queries_are_not_part_of_import_only_ast(self):
        source = inspect.getsource(r29b1r_probe_torch.import_torch_only)
        names = {node.id for node in ast.walk(ast.parse(source)) if isinstance(node, ast.Name)}
        self.assertNotIn("mps", names)
