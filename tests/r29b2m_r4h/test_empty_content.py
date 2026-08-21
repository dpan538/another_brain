import unittest

from conftest import run_contract


class TestEmptyContent(unittest.TestCase):
    def test_empty_content(self):
        run_contract("empty_content")
