import unittest

from conftest import run_contract


class TestOneDeepseekCall(unittest.TestCase):
    def test_one_deepseek_call(self):
        run_contract("one_deepseek_call")
