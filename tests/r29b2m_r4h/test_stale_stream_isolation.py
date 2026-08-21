import unittest

from conftest import run_contract


class TestStaleStreamIsolation(unittest.TestCase):
    def test_stale_stream_isolation(self):
        run_contract("stale_stream_isolation")
