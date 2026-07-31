import ast
import unittest
from pathlib import Path

class GenerateBoundaryTests(unittest.TestCase):
    def test_generation_removes_tokenizer_appended_eos_before_decoding(self):
        source = Path("src/training/campaign/r28a13_controller.py").read_text(encoding="utf-8")
        ast.parse(source)
        start = source.index("def _generate")
        body = source[start : start + 700]
        self.assertIn('ids[-1] == getattr(tokenizer, "eos", 3)', body)
        self.assertIn("ids = ids[:-1]", body)
