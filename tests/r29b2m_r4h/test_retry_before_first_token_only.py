import unittest

from conftest import run_contract


class TestRetryBeforeFirstTokenOnly(unittest.TestCase):
    def test_retry_before_first_token_only(self):
        run_contract("retry_before_first_token_only")
