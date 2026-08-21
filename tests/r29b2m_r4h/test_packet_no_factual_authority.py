import unittest

from conftest import run_contract


class TestPacketNoFactualAuthority(unittest.TestCase):
    def test_packet_no_factual_authority(self):
        run_contract("packet_no_factual_authority")
