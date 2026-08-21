import unittest

from conftest import run_contract


class TestSignalProviderReadyGate(unittest.TestCase):
    def test_signal_provider_ready_gate(self):
        run_contract("signal_provider_ready_gate")
