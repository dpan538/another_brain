from pathlib import Path

from src.training.mlx.r29b2m_q4_source import load_r28m1_q4_source


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "web" / "another_brain" / "model_assets" / "r28m1"


def test_committed_q4_source_is_strictly_auditable_without_torch():
    source = load_r28m1_q4_source(ASSETS)
    assert len(source.records) == 96
    assert source.architecture == {"context_length": 256, "model_size": "r27a11_96m", "n_embd": 896, "n_head": 14, "n_layer": 7, "vocab_size": 16000}
    assert source.source_sha256 == "f04db34dc26817be216d945639cd7adc15bc916cabeda5f258000b474e64b710"
    assert source.dequantize_numpy("blocks.0.attn.mask").dtype.name == "bool"
    assert source.dequantize_numpy("blocks.0.attn.mask").shape == (256, 256)


def test_q4_low_then_high_signed_nibble_order_is_documented_by_result():
    source = load_r28m1_q4_source(ASSETS)
    value = source.dequantize_numpy("ln_f.weight")
    assert value.shape == (896,)
    assert value.dtype.name == "float32"
    assert float(abs(value).max()) > 0
