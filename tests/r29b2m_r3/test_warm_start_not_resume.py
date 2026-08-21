import pytest

from src.training.mlx.r29b2m_r3_checkpoint import validate_resume_lineage


def test_warm_start_metadata_is_not_accepted_as_resume():
    with pytest.raises(ValueError, match="warm_start_checkpoint"):
        validate_resume_lineage({"warm_start": True, "resume_kind": "warm_start"})
