"""Future trainer admission gate for the R29B2M-R2 dataset."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from src.training.mlx.r29b2m_r2_quarantine import assert_not_rejected_dataset


ROOT = Path(__file__).resolve().parents[3]
TOKENIZER = ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json"
EVAL_MANIFEST = ROOT / "evals" / "r29b2m_daily_dialogue_v2" / "manifest.json"
SCHEMA = ROOT / "schemas" / "r29b2m_r2_scenario_spec.schema.json"
VALIDATOR = Path(__file__).with_name("r29b2m_r2_validators.py")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_dataset_admission(manifest: dict[str, Any], dataset_dir: Path | None = None) -> None:
    """Raise when a trainer must not consume ``manifest``.

    ``dataset_dir`` is optional only for tests that exercise metadata failures;
    admitted manifests must provide it so file checksums are verified.
    """
    assert_not_rejected_dataset(manifest, manifest_sha256=manifest.get("manifest_sha256"))
    required = (
        "dataset_id", "campaign_id", "human_review_completed", "codex_semantic_review_completed",
        "admitted_for_engineering_sft", "semantic_audit", "critical_issue_count",
        "tokenizer_sha256", "eval_v2_manifest_sha256", "scenario_schema_sha256",
        "validator_sha256", "file_sha256",
    )
    missing = [key for key in required if key not in manifest]
    if missing:
        raise ValueError("dataset_admission_missing_fields:" + ",".join(missing))
    if manifest["campaign_id"] != "r29b2m_r2_scenario_grounded_dataset_v1":
        raise ValueError("dataset_admission_wrong_campaign")
    if manifest["admitted_for_engineering_sft"] is not True:
        raise ValueError("dataset_not_admitted_for_engineering_sft")
    if manifest["codex_semantic_review_completed"] is not True or manifest["semantic_audit"].get("valid") is not True:
        raise ValueError("dataset_semantic_audit_missing_or_invalid")
    if manifest["critical_issue_count"] != 0 or manifest["semantic_audit"].get("systematic_issue_count") != 0:
        raise ValueError("dataset_unresolved_critical_or_systematic_issue")
    expected = {
        "tokenizer_sha256": sha256_file(TOKENIZER),
        "eval_v2_manifest_sha256": sha256_file(EVAL_MANIFEST),
        "scenario_schema_sha256": sha256_file(SCHEMA),
        "validator_sha256": sha256_file(VALIDATOR),
    }
    for key, value in expected.items():
        if manifest.get(key) != value:
            raise ValueError(f"dataset_admission_hash_mismatch:{key}")
    if dataset_dir is None:
        raise ValueError("dataset_directory_required_for_checksum_validation")
    for relative, expected_hash in manifest["file_sha256"].items():
        path = dataset_dir / relative
        if not path.is_file() or sha256_file(path) != expected_hash:
            raise ValueError(f"dataset_file_checksum_mismatch:{relative}")
