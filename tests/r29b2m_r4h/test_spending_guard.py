import unittest

from conftest import run_contract


class TestSpendingGuard(unittest.TestCase):
    def test_spending_guard(self):
        run_contract("spending_guard")
