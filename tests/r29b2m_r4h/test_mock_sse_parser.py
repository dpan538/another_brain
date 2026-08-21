import unittest

from conftest import run_contract


class TestMockSseParser(unittest.TestCase):
    def test_mock_sse_parser(self):
        run_contract("mock_sse_parser")
