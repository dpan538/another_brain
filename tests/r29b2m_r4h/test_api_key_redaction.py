import unittest

from conftest import run_contract


class TestApiKeyRedaction(unittest.TestCase):
    def test_api_key_redaction(self):
        run_contract("api_key_redaction")
