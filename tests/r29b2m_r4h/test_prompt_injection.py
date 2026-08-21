import unittest

from conftest import run_contract


class TestPromptInjection(unittest.TestCase):
    def test_prompt_injection(self):
        run_contract("prompt_injection")
