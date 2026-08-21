import unittest

from conftest import run_contract


class TestEmotionalGrammar(unittest.TestCase):
    def test_emotional_grammar(self):
        run_contract("emotional_grammar")
