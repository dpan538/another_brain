import hashlib
import json

import pytest

from src.training.mlx.r29b2m_r3_checkpoint import CHECKSUMMED_FILES, verify_checksums


def test_checksum_mismatch_rejects_corrupted_checkpoint(tmp_path):
    for name in CHECKSUMMED_FILES:
        (tmp_path / name).write_bytes(b"safe")
    hashes = {name: hashlib.sha256(b"safe").hexdigest() for name in CHECKSUMMED_FILES}
    (tmp_path / "checksums.json").write_text(json.dumps({"files": hashes}), encoding="utf-8")
    (tmp_path / "model.safetensors").write_bytes(b"corrupt")
    with pytest.raises(ValueError, match="checkpoint_checksum_mismatch"):
        verify_checksums(tmp_path)
