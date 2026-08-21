import unittest

from conftest import run_contract


class TestLatencyMeasurement(unittest.TestCase):
    def test_latency_measurement(self):
        run_contract("latency_measurement")
