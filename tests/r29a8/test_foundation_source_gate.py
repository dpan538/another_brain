import unittest

from src.training.campaign.r29a8_foundation_source_gate import manifest_template, validate_source_manifest


class FoundationSourceGateTests(unittest.TestCase):
    def test_template_is_not_admitted(self):
        self.assertFalse(validate_source_manifest(manifest_template())["ok"])

    def test_reviewed_external_source_needs_isolation_and_token_floor(self):
        source = manifest_template() | {
            "source_id": "reviewed_snapshot", "snapshot_url": "https://example.org/dump.xml.bz2",
            "license": "CC-BY-SA-4.0", "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
            "retrieved_at_utc": "2026-07-31T00:00:00Z", "sha256": "a" * 64,
            "declared_clean_tokens": 5_000_000, "reviewed": True,
            "heldout_exclusion": {"enabled": True, "method": "hash-based source and prompt exclusion"},
        }
        report = validate_source_manifest(source)
        self.assertTrue(report["ok"])
        self.assertTrue(report["admission_only"])
