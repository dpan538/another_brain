from __future__ import annotations

import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def tokenizer_path() -> Path:
    return ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json"


def write_minimal_dataset(root: Path) -> Path:
    root.mkdir(parents=True)
    row = {
        "session_id": "train_1",
        "family_id": "greeting",
        "quality_tier": "gold_canonical",
        "split": "train",
        "messages": [{"role": "user", "content": "你好。"}],
        "target": "你好。",
        "token_counts": {"assistant_target_including_eos": 4},
    }
    dev = row | {"session_id": "dev_1", "split": "dev"}
    (root / "train.jsonl").write_text(json.dumps(row, ensure_ascii=False) + "\n", encoding="utf-8")
    (root / "dev.jsonl").write_text(json.dumps(dev, ensure_ascii=False) + "\n", encoding="utf-8")
    for name in ("canonical_scenarios.jsonl",):
        (root / name).write_text("{}\n", encoding="utf-8")
    for name in ("full_semantic_audit.json", "checksums.json"):
        (root / name).write_text("{}\n", encoding="utf-8")
    sampling = {
        "valid": True,
        "quality_tiers": {"gold_canonical": {"weight": 2}, "verified_surface_variant": {"weight": 1}},
        "forbidden_tiers": ["legacy_r1_generated", "synthetic_unreviewed", "silver_unverified"],
    }
    (root / "sampling_contract.json").write_text(json.dumps(sampling) + "\n", encoding="utf-8")
    manifest = {"train_dev_distribution": {"train": 1, "dev": 1}}
    (root / "dataset_manifest.json").write_text(json.dumps(manifest) + "\n", encoding="utf-8")
    return root


def tiny_mask_model():
    import mlx.core as mx
    import mlx.nn as nn

    class MaskLayer(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.mask = mx.array([[False, True], [False, False]])
            self.weight = mx.ones((2, 2), dtype=mx.float32)

    class TinyMaskModel(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.layers = [MaskLayer() for _ in range(7)]

        def __call__(self, x):
            value = x
            for layer in self.layers:
                value = value @ layer.weight
            return value

    return TinyMaskModel()
