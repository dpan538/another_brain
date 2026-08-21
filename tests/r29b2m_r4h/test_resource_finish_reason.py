import unittest

from conftest import run_contract


class TestResourceFinishReason(unittest.TestCase):
    def test_resource_finish_reason(self):
        run_contract("resource_finish_reason")
