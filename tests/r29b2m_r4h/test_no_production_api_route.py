import unittest

from conftest import run_contract


class TestNoProductionApiRoute(unittest.TestCase):
    def test_no_production_api_route(self):
        run_contract("no_production_api_route")
