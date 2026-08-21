from src.training.mlx.r29b2m_r3_optimizer import create_optimizer, mask_sha256
from tests.r29b2m_r3.conftest import tiny_mask_model


def test_frozen_masks_do_not_change_after_optimizer_update():
    import mlx.core as mx
    import mlx.nn as nn

    model = tiny_mask_model()
    optimizer = create_optimizer(model)
    before = mask_sha256(model)
    value_and_grad = nn.value_and_grad(model, lambda active, x: mx.sum(active(x)))
    _, gradients = value_and_grad(model, mx.ones((1, 2)))
    optimizer.update(model, gradients)
    mx.eval(model.parameters(), optimizer.state)
    assert mask_sha256(model) == before
