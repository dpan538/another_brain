import unittest

from scripts.r28tok1_discover_exact_tokenizer import discover_exact_tokenizer


class R28TOK1TokenizerDiscoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = discover_exact_tokenizer()

    def test_exact_tokenizer_found(self):
        self.assertTrue(self.report["ok"], self.report)
        self.assertTrue(self.report["exact_tokenizer_found"])
        self.assertEqual(self.report["vocab_size"], 16000)
        self.assertTrue(self.report["has_encode"])
        self.assertTrue(self.report["has_decode"])
        self.assertIsNone(self.report["blocker"])

    def test_source_is_allowed_runtime_asset_source(self):
        self.assertTrue(self.report["can_commit_runtime_asset"], self.report)
        self.assertTrue(
            self.report["source_kind"].startswith("r27")
            or self.report["source_kind"] == "a12_handoff_tokenizer_path"
            or self.report["source_kind"] == "r28m1_runtime_tokenizer_asset"
        )

    def test_non_claims(self):
        non_claims = self.report["non_claims"]
        self.assertFalse(non_claims["training"])
        self.assertFalse(non_claims["product_admission"])
        self.assertFalse(non_claims["browser_admission"])
        self.assertFalse(non_claims["release_checkpoint_admission"])


if __name__ == "__main__":
    unittest.main()
