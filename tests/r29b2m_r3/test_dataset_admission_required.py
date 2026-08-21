from src.training.mlx import r29b2m_r3_loader as loader
from tests.r29b2m_r3.conftest import write_minimal_dataset


def test_loader_calls_binding_r2_admission_gate(monkeypatch, tmp_path):
    called = []
    monkeypatch.setattr(loader, "validate_dataset_admission", lambda manifest, dataset_dir: called.append((manifest, dataset_dir)))
    monkeypatch.setattr(loader, "assert_not_rejected_dataset", lambda *args, **kwargs: None)
    dataset = loader.load_admitted_dataset(write_minimal_dataset(tmp_path / "dataset"))
    assert len(called) == 1
    assert called[0][1] == dataset.root
