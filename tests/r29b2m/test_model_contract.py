from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_model_contract_keeps_exact_source_architecture_and_no_torch_import():
    source = (ROOT / "src" / "training" / "mlx" / "r29b2m_model.py").read_text(encoding="utf-8")
    assert "N_LAYER = 7" in source
    assert "N_EMBD = 896" in source
    assert "N_HEAD = 14" in source
    assert "CONTEXT_LENGTH = 256" in source
    assert "packed_qkv_order" not in source  # contract is implemented directly, not a routing flag
    assert "import torch" not in source
    assert "exact_erf" in source
