import inspect

from src.training.mlx import r29b2m_r2_renderer


def test_renderer_uses_fixed_explicit_pairs_not_cartesian_or_modulo_selection():
    source = inspect.getsource(r29b2m_r2_renderer)
    assert "TARGET_PAIRING" in source
    assert "variation_pair_id" in source
    assert "variant %" not in source
    assert "generic_tail" not in source
    assert source.count("for index in range") == 1
