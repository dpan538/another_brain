import unittest

from conftest import run_contract


class TestApiKeyServerOnly(unittest.TestCase):
    def test_api_key_server_only(self):
        run_contract("api_key_server_only")
