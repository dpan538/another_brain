"""Admitted R2 dataset loader for R29B2M-R3.

The public admission function is intentionally called directly.  This module
does not duplicate or weaken the frozen R2 gate.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

from src.training.mlx.r29b2m_r1_dataset import EncodedDialogue, encode_assistant_response_only
from src.training.mlx.r29b2m_r2_admission import validate_dataset_admission
from src.training.mlx.r29b2m_r2_quarantine import assert_not_rejected_dataset
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer


REQUIRED_DATASET_FILES = (
    "dataset_manifest.json",
    "train.jsonl",
    "dev.jsonl",
    "canonical_scenarios.jsonl",
    "full_semantic_audit.json",
    "sampling_contract.json",
    "checksums.json",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected_json_object:{path.name}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"expected_jsonl_object:{path.name}:{line_number}")
            rows.append(value)
    return rows


@dataclass(frozen=True)
class LoadedDialogueRow:
    row: dict[str, Any]
    encoded: EncodedDialogue

    @property
    def session_id(self) -> str:
        return str(self.row["session_id"])

    @property
    def quality_tier(self) -> str:
        return str(self.row["quality_tier"])

    @property
    def family_id(self) -> str:
        return str(self.row["family_id"])


@dataclass(frozen=True)
class AdmittedDataset:
    root: Path
    manifest: dict[str, Any]
    manifest_sha256: str
    train: tuple[dict[str, Any], ...]
    dev: tuple[dict[str, Any], ...]
    sampling_contract: dict[str, Any]

    def encode_rows(
        self,
        tokenizer: ExactRuntimeTokenizer,
        rows: Iterable[dict[str, Any]],
        *,
        context_length: int = 256,
    ) -> tuple[LoadedDialogueRow, ...]:
        encoded: list[LoadedDialogueRow] = []
        for row in rows:
            item = encode_assistant_response_only(tokenizer, row, context_length=context_length)
            declared = row.get("token_counts", {}).get("assistant_target_including_eos")
            if declared is not None and int(declared) != item.assistant_target_token_count:
                raise ValueError(f"assistant_target_token_count_mismatch:{row.get('session_id')}")
            encoded.append(LoadedDialogueRow(row=row, encoded=item))
        return tuple(encoded)


def load_admitted_dataset(dataset_dir: Path) -> AdmittedDataset:
    dataset_dir = dataset_dir.resolve()
    missing = [name for name in REQUIRED_DATASET_FILES if not (dataset_dir / name).is_file()]
    if missing:
        raise ValueError("r2_dataset_required_files_missing:" + ",".join(missing))
    manifest_path = dataset_dir / "dataset_manifest.json"
    manifest = read_json(manifest_path)
    # Binding R2 gate: do not replace with local field checks.
    validate_dataset_admission(manifest, dataset_dir)
    assert_not_rejected_dataset(manifest, manifest_sha256=sha256_file(manifest_path))
    train = tuple(read_jsonl(dataset_dir / "train.jsonl"))
    dev = tuple(read_jsonl(dataset_dir / "dev.jsonl"))
    if len(train) != int(manifest["train_dev_distribution"]["train"]):
        raise ValueError("r2_train_count_mismatch")
    if len(dev) != int(manifest["train_dev_distribution"]["dev"]):
        raise ValueError("r2_dev_count_mismatch")
    if any(row.get("split") != "train" for row in train):
        raise ValueError("non_train_row_in_r2_train_split")
    if any(row.get("split") != "dev" for row in dev):
        raise ValueError("non_dev_row_in_r2_dev_split")
    if {str(row.get("session_id")) for row in train} & {str(row.get("session_id")) for row in dev}:
        raise ValueError("r2_train_dev_session_overlap")
    if any(row.get("quality_tier") not in {"gold_canonical", "verified_surface_variant"} for row in (*train, *dev)):
        raise ValueError("r2_forbidden_quality_tier")
    sampling = read_json(dataset_dir / "sampling_contract.json")
    if sampling.get("valid") is not True:
        raise ValueError("r2_sampling_contract_invalid")
    return AdmittedDataset(
        root=dataset_dir,
        manifest=manifest,
        manifest_sha256=sha256_file(manifest_path),
        train=train,
        dev=dev,
        sampling_contract=sampling,
    )
