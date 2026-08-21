def test_training_mode_is_recursive_after_eval_seed_load():
    import mlx.nn as nn

    from src.training.mlx.r29b2m_r3_trainer import activate_training_mode

    model = nn.Sequential(nn.Dropout(p=0.05))
    model.eval()
    assert model.training is False
    assert model.layers[0].training is False

    assert activate_training_mode(model) is model
    assert model.training is True
    assert model.layers[0].training is True
