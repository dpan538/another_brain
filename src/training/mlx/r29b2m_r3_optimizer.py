"""Explicit trainable-parameter and AdamW contracts for R29B2M-R3."""

from __future__ import annotations

import hashlib
import json
from typing import Any


OPTIMIZER_CONFIG: dict[str, Any] = {
    "optimizer": "AdamW",
    "learning_rate": 5e-6,
    "betas": [0.9, 0.999],
    "epsilon": 1e-8,
    "weight_decay": 0.01,
    "bias_correction": False,
    "gradient_clip_norm": 1.0,
    "context_length": 256,
    "microbatch": 1,
    "gradient_accumulation": 8,
    "dropout": 0.05,
    "campaign_seed": 29032026,
    "maximum_generated_tokens": 64,
}


def configure_trainable_tree(model: Any) -> dict[str, Any]:
    """Freeze every runtime mask and reject any other non-floating trainable."""
    import mlx.core as mx
    from mlx.utils import tree_flatten

    model.freeze(recurse=True, keys="mask", strict=False)
    all_parameters = dict(tree_flatten(model.parameters()))
    trainable = dict(tree_flatten(model.trainable_parameters()))
    frozen = sorted(set(all_parameters) - set(trainable))
    expected_masks = sorted(name for name in all_parameters if name.endswith(".mask"))
    if frozen != expected_masks or len(expected_masks) != 7:
        raise ValueError(f"trainable_tree_mask_exclusion_mismatch:{frozen}")
    floating = {mx.float16, mx.float32, mx.bfloat16}
    invalid = [name for name, value in trainable.items() if value.dtype not in floating]
    if invalid:
        raise ValueError("nonfloating_trainable_parameters:" + ",".join(invalid))
    if any(name.endswith(".mask") for name in trainable):
        raise ValueError("mask_present_in_trainable_tree")
    return model.trainable_parameters()


def parameter_tree_report(model: Any) -> dict[str, Any]:
    from mlx.utils import tree_flatten

    all_parameters = dict(tree_flatten(model.parameters()))
    trainable = dict(tree_flatten(model.trainable_parameters()))
    dtype_distribution: dict[str, dict[str, int]] = {}
    for value in all_parameters.values():
        bucket = dtype_distribution.setdefault(str(value.dtype), {"tensor_count": 0, "parameter_count": 0})
        bucket["tensor_count"] += 1
        bucket["parameter_count"] += int(value.size)
    metadata = [
        {"name": name, "shape": list(value.shape), "dtype": str(value.dtype), "trainable": name in trainable}
        for name, value in sorted(all_parameters.items())
    ]
    digest = hashlib.sha256(json.dumps(metadata, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {
        "total_architecture_parameter_count_excluding_masks": sum(int(v.size) for n, v in all_parameters.items() if not n.endswith(".mask")),
        "trainable_parameter_count": sum(int(value.size) for value in trainable.values()),
        "frozen_tensor_names": sorted(set(all_parameters) - set(trainable)),
        "trainable_tensor_names": sorted(trainable),
        "dtype_distribution": dtype_distribution,
        "parameter_tree_sha256": digest,
        "weight_tying": False,
    }


def create_optimizer(model: Any) -> Any:
    import mlx.optimizers as optim

    trainable = configure_trainable_tree(model)
    optimizer = optim.AdamW(
        learning_rate=OPTIMIZER_CONFIG["learning_rate"],
        betas=OPTIMIZER_CONFIG["betas"],
        eps=OPTIMIZER_CONFIG["epsilon"],
        weight_decay=OPTIMIZER_CONFIG["weight_decay"],
        bias_correction=OPTIMIZER_CONFIG["bias_correction"],
    )
    optimizer.init(trainable)
    return optimizer


def arrays_sha256(named_arrays: dict[str, Any]) -> str:
    """Stable value digest used for masks and exact-resume comparisons."""
    import numpy as np

    digest = hashlib.sha256()
    for name, value in sorted(named_arrays.items()):
        array = np.asarray(value)
        digest.update(name.encode())
        digest.update(str(array.dtype).encode())
        digest.update(json.dumps(list(array.shape), separators=(",", ":")).encode())
        digest.update(array.tobytes(order="C"))
    return digest.hexdigest()


def mask_sha256(model: Any) -> str:
    from mlx.utils import tree_flatten

    masks = {name: value for name, value in tree_flatten(model.parameters()) if name.endswith(".mask")}
    if len(masks) != 7:
        raise ValueError("mask_tensor_count_mismatch")
    return arrays_sha256(masks)
