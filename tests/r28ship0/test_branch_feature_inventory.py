import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "r28ship0_branch_feature_inventory.py"


def load_module():
    spec = importlib.util.spec_from_file_location("r28ship0_branch_feature_inventory", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BranchFeatureInventoryTest(unittest.TestCase):
    def test_required_branches_and_features_are_declared(self):
        module = load_module()
        self.assertIn("origin/r28hotfix3-q4-asset-path-fix", module.BRANCHES)
        self.assertIn("origin/r28load0-model-loading-state-machine", module.BRANCHES)
        self.assertIn("origin/r28ux5-chat-dashboard-split", module.BRANCHES)
        self.assertIn("q4 asset path normalizer", module.FEATURE_PATTERNS)
        self.assertIn("loading state machine", module.FEATURE_PATTERNS)
        self.assertIn("minimal chat/dashboard split", module.FEATURE_PATTERNS)


if __name__ == "__main__":
    unittest.main()
