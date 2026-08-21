import unittest

from conftest import run_contract


class TestAnchorGrounding(unittest.TestCase):
    def test_anchor_grounding(self):
        run_contract("anchor_grounding")
