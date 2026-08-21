import pytest

from src.training.mlx.r29b2m_r2_quarantine import REJECTED_R1_CAMPAIGN_ID, REJECTED_R1_DATASET_ID, assert_not_rejected_dataset


def test_r1_campaign_and_dataset_ids_remain_permanently_rejected():
    with pytest.raises(ValueError, match="rejected_r29b2m_r1_dataset"):
        assert_not_rejected_dataset({"campaign_id": REJECTED_R1_CAMPAIGN_ID, "dataset_id": REJECTED_R1_DATASET_ID})
