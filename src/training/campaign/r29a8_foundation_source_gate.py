"""Admission-only gate for an external foundation-language source.

This module never downloads, parses, or trains on external text.  It makes the
future source review explicit so a licensed snapshot can be audited before any
bytes become an ignored training artifact.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any


CAMPAIGN_ID = "r29a8_foundation_language_admission_v1"
ALLOWED_LICENSES = {"CC-BY-4.0", "CC-BY-SA-4.0", "CC0-1.0"}
REQUIRED_FIELDS = {
    "source_id", "snapshot_url", "license", "license_url", "retrieved_at_utc",
    "sha256", "declared_clean_tokens", "reviewed", "heldout_exclusion",
    "raw_external_text_committed", "processed_corpus_committed",
}


def validate_source_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    """Validate provenance and split isolation without accessing the source."""
    missing = sorted(
        field for field in REQUIRED_FIELDS
        if field not in manifest or manifest.get(field) is None or manifest.get(field) == ""
    )
    blockers: list[str] = []
    if missing:
        blockers.append("source_manifest_fields_missing")
    if manifest.get("license") not in ALLOWED_LICENSES:
        blockers.append("license_not_allowlisted")
    if manifest.get("reviewed") is not True:
        blockers.append("human_license_review_required")
    if manifest.get("raw_external_text_committed") is not False or manifest.get("processed_corpus_committed") is not False:
        blockers.append("external_text_must_remain_uncommitted")
    exclusion = manifest.get("heldout_exclusion") or {}
    if exclusion.get("enabled") is not True or not exclusion.get("method"):
        blockers.append("heldout_isolation_missing")
    try:
        if int(manifest.get("declared_clean_tokens", 0)) < 5_000_000:
            blockers.append("foundation_gate_token_floor_not_met")
    except (TypeError, ValueError):
        blockers.append("foundation_gate_token_floor_not_met")
    digest_payload = {key: manifest.get(key) for key in sorted(REQUIRED_FIELDS)}
    fingerprint = hashlib.sha256(json.dumps(digest_payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return {
        "ok": not blockers,
        "campaign_id": CAMPAIGN_ID,
        "blockers": blockers,
        "missing_fields": missing,
        "source_manifest_fingerprint": fingerprint,
        "admission_only": True,
        "download_performed": False,
        "training_started": False,
        "weights_committed": False,
        "processed_corpus_committed": False,
    }


def manifest_template() -> dict[str, Any]:
    return {
        "source_id": "",
        "snapshot_url": "",
        "license": "",
        "license_url": "",
        "retrieved_at_utc": "",
        "sha256": "",
        "declared_clean_tokens": 0,
        "reviewed": False,
        "heldout_exclusion": {"enabled": False, "method": ""},
        "raw_external_text_committed": False,
        "processed_corpus_committed": False,
    }
