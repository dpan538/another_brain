from src.training.mlx.r29b2m_r3_optimizer import configure_trainable_tree, parameter_tree_report
from tests.r29b2m_r3.conftest import tiny_mask_model


def test_trainable_tree_excludes_all_seven_bool_masks():
    model = tiny_mask_model()
    configure_trainable_tree(model)
    report = parameter_tree_report(model)
    assert len(report["frozen_tensor_names"]) == 7
    assert all(name.endswith(".mask") for name in report["frozen_tensor_names"])
    assert not any(name.endswith(".mask") for name in report["trainable_tensor_names"])
