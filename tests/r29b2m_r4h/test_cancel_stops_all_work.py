import unittest

from conftest import run_contract


class TestCancelStopsAllWork(unittest.TestCase):
    def test_cancel_stops_all_work(self):
        run_contract("cancel_stops_all_work")
