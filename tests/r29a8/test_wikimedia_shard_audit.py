import unittest

from scripts.r29a8_audit_wikimedia_shard import chinese_ratio, clean_wikitext, split_for


class WikimediaShardAuditTests(unittest.TestCase):
    def test_cleanup_removes_templates_tags_and_link_labels(self):
        self.assertEqual(clean_wikitext("{{x}} [[词条|标签]] <ref>x</ref>  文本"), "词条 文本")

    def test_chinese_ratio_and_split_are_deterministic(self):
        self.assertGreater(chinese_ratio("中文文本abc"), 0.5)
        self.assertEqual(split_for("同一标题"), split_for("同一标题"))
