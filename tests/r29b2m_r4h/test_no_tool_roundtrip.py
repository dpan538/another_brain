import unittest

from conftest import run_contract


class TestNoToolRoundtrip(unittest.TestCase):
    def test_no_tool_roundtrip(self):
        run_contract("no_tool_roundtrip")
