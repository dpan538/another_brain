import unittest

from conftest import run_contract


class TestOracleNotClaimedAsModel(unittest.TestCase):
    def test_oracle_not_claimed_as_model(self):
        run_contract("oracle_not_claimed_as_model")
