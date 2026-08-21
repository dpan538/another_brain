import unittest

from conftest import run_contract


class TestNoTrainingUpdates(unittest.TestCase):
    def test_no_training_updates(self):
        run_contract("no_training_updates")
