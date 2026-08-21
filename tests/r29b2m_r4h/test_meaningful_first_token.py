import unittest

from conftest import run_contract


class TestMeaningfulFirstToken(unittest.TestCase):
    def test_meaningful_first_token(self):
        run_contract("meaningful_first_token")
