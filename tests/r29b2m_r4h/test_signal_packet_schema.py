import unittest

from conftest import run_contract


class TestSignalPacketSchema(unittest.TestCase):
    def test_signal_packet_schema(self):
        run_contract("signal_packet_schema")
