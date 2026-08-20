import pytest

from src.training.mlx.r29b2m_r2_admission import validate_dataset_admission
from src.training.mlx.r29b2m_r2_quarantine import (
    REJECTED_R1_CAMPAIGN_ID,
    REJECTED_R1_DATASET_ID,
    REJECTED_R1_MANIFEST_SHA256,
    REJECTED_R1_SESSIONS_SHA256,
)


@pytest.mark.parametrize("manifest", [
    {"campaign_id": REJECTED_R1_CAMPAIGN_ID},
    {"dataset_id": REJECTED_R1_DATASET_ID},
    {"sessions_sha256": REJECTED_R1_SESSIONS_SHA256},
    {"manifest_sha256": REJECTED_R1_MANIFEST_SHA256},
])
def test_future_training_loader_rejects_r1_by_every_stable_identifier(manifest):
    with pytest.raises(ValueError, match="rejected_r29b2m_r1_dataset"):
        validate_dataset_admission(manifest)
