import unittest

from conftest import run_contract


class TestOracleEvalIsolation(unittest.TestCase):
    def test_oracle_eval_isolation(self):
        run_contract("oracle_eval_isolation")
