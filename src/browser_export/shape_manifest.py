from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TensorShape:
    name: str
    shape: tuple[int, ...]
    dtype: str = "float32"

    @property
    def numel(self) -> int:
        total = 1
        for dim in self.shape:
            total *= int(dim)
        return total

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "shape": list(self.shape),
            "dtype": self.dtype,
            "numel": self.numel,
        }


def tensor_shape_from_value(name: str, value: Any) -> TensorShape:
    shape = getattr(value, "shape", None)
    dtype = str(getattr(value, "dtype", "float32")).replace("torch.", "")
    if shape is None:
        if isinstance(value, (list, tuple)) and value and isinstance(value[0], (list, tuple)):
            shape = (len(value), len(value[0]))
        elif isinstance(value, (list, tuple)):
            shape = (len(value),)
        else:
            shape = ()
    return TensorShape(name=name, shape=tuple(int(dim) for dim in shape), dtype=dtype)


def summarize_tensors(state_dict: dict[str, Any], limit: int | None = None) -> dict[str, Any]:
    tensors = [tensor_shape_from_value(name, value) for name, value in sorted(state_dict.items())]
    total_params = sum(tensor.numel for tensor in tensors)
    shown = tensors if limit is None else tensors[:limit]
    return {
        "tensor_count": len(tensors),
        "params": total_params,
        "tensors": [tensor.to_dict() for tensor in shown],
        "truncated": limit is not None and len(tensors) > limit,
    }


def estimate_sizes(params: int) -> dict[str, int]:
    return {
        "fp32_bytes": int(params * 4),
        "fp16_bytes": int(params * 2),
        "int8_bytes": int(params),
        "q4_bytes": int((params + 1) // 2),
    }


def infer_config_from_state_dict(state_dict: dict[str, Any], fallback_vocab: int = 0, fallback_context: int = 0) -> dict[str, Any]:
    vocab = fallback_vocab
    hidden = 0
    for name, value in state_dict.items():
        shape = tuple(int(dim) for dim in getattr(value, "shape", ()))
        if len(shape) == 2 and ("embed" in name or "wte" in name or "token" in name):
            vocab = max(vocab, shape[0])
            hidden = max(hidden, shape[1])
        elif len(shape) == 2:
            hidden = max(hidden, shape[-1])
    return {
        "vocab_size": vocab,
        "context_length": fallback_context,
        "hidden_size_hint": hidden,
    }


def synthetic_state_dict() -> dict[str, list[float]]:
    return {
        "token_embedding.weight": [[0.0] * 16 for _ in range(32)],
        "blocks.0.attn.qkv.weight": [[0.0] * 16 for _ in range(48)],
        "blocks.0.mlp.fc.weight": [[0.0] * 16 for _ in range(64)],
        "lm_head.weight": [[0.0] * 16 for _ in range(32)],
    }
