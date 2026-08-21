from src.training.mlx.r29b2m_r3_optimizer import create_optimizer
from tests.r29b2m_r3.conftest import tiny_mask_model


def test_optimizer_m_and_v_roundtrip(tmp_path):
    import mlx.core as mx
    import mlx.nn as nn
    from mlx.utils import tree_flatten, tree_unflatten

    model = tiny_mask_model()
    optimizer = create_optimizer(model)
    value_and_grad = nn.value_and_grad(model, lambda active, x: mx.sum(active(x)))
    _, gradients = value_and_grad(model, mx.ones((1, 2)))
    optimizer.update(model, gradients)
    mx.eval(optimizer.state)
    path = tmp_path / "optimizer.safetensors"
    mx.save_safetensors(str(path), dict(tree_flatten(optimizer.state)))
    restored = create_optimizer(tiny_mask_model())
    restored.state = tree_unflatten(list(mx.load(str(path)).items()))
    assert set(dict(tree_flatten(restored.state))) == set(dict(tree_flatten(optimizer.state)))
