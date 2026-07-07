import unittest

from scripts.r28tok0_discover_tokenizer import discover_tokenizer


class R28TOK0TokenizerDiscoveryTests(unittest.TestCase):
    def test_discovers_exact_runtime_tokenizer_source(self):
        report = discover_tokenizer()
        self.assertTrue(report["ok"], report.get("blocker"))
        self.assertTrue(report["exact_tokenizer_found"])
        self.assertEqual(report["vocab_size"], 16000)
        self.assertIn(report["tokenizer_type"], {"BPE", "exact_runtime_bpe", "exact_runtime_tokenizer"})
        self.assertTrue(report["can_commit_runtime_asset"])
        self.assertNotIn("data/public_ingestion", report["source_path"])


if __name__ == "__main__":
    unittest.main()
