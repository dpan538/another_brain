import unittest

from conftest import run_contract


class TestStylePolicyCompiler(unittest.TestCase):
    def test_style_policy_compiler(self):
        run_contract("style_policy_compiler")
