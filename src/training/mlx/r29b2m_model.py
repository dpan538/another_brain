"""Exact MLX implementation of the committed seven-layer decoder contract.

The module is intentionally small and custom: the source q4 tensors originate
from PyTorch ``MultiheadAttention`` and ``Sequential`` names, whose packed QKV
layout is not guaranteed by a convenience MLX attention wrapper.  The model
therefore owns that layout directly and exposes the same tensor tree.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Iterable

import mlx.core as mx
import mlx.nn as nn


VOCAB_SIZE = 16_000
CONTEXT_LENGTH = 256
N_LAYER = 7
N_EMBD = 896
N_HEAD = 14
HEAD_DIM = 64
MLP_DIM = N_EMBD * 4
LAYERNORM_EPS = 1e-5
DROPOUT = 0.05


@dataclass(frozen=True)
class LayerKV:
    key: mx.array
    value: mx.array

    @property
    def length(self) -> int:
        return int(self.key.shape[2])


@dataclass
class KVCache:
    """Per-session causal cache; it is never shared across sessions."""

    layers: list[LayerKV | None]
    capacity: int = CONTEXT_LENGTH

    @classmethod
    def empty(cls, *, n_layer: int = N_LAYER, capacity: int = CONTEXT_LENGTH) -> "KVCache":
        return cls(layers=[None] * n_layer, capacity=capacity)

    @property
    def length(self) -> int:
        lengths = {entry.length for entry in self.layers if entry is not None}
        if not lengths:
            return 0
        if len(lengths) != 1:
            raise ValueError("inconsistent_kv_cache_lengths")
        return lengths.pop()

    def reset(self) -> None:
        self.layers = [None] * len(self.layers)


class ExactLayerNorm(nn.Module):
    def __init__(self, dimensions: int, *, eps: float = LAYERNORM_EPS) -> None:
        super().__init__()
        self.weight = mx.ones((dimensions,), dtype=mx.float32)
        self.bias = mx.zeros((dimensions,), dtype=mx.float32)
        self.eps = float(eps)

    def __call__(self, x: mx.array) -> mx.array:
        mean = mx.mean(x, axis=-1, keepdims=True)
        variance = mx.mean((x - mean) * (x - mean), axis=-1, keepdims=True)
        return (x - mean) * mx.rsqrt(variance + self.eps) * self.weight + self.bias


class ExactLinear(nn.Module):
    def __init__(self, input_dims: int, output_dims: int, *, bias: bool = True) -> None:
        super().__init__()
        self.weight = mx.zeros((output_dims, input_dims), dtype=mx.float32)
        if bias:
            self.bias = mx.zeros((output_dims,), dtype=mx.float32)

    def __call__(self, x: mx.array) -> mx.array:
        result = x @ mx.transpose(self.weight)
        if hasattr(self, "bias"):
            result = result + self.bias
        return result


class ExactEmbedding(nn.Module):
    def __init__(self, vocab_size: int, dims: int) -> None:
        super().__init__()
        self.weight = mx.zeros((vocab_size, dims), dtype=mx.float32)

    def __call__(self, token_ids: mx.array) -> mx.array:
        return self.weight[token_ids]


class PackedMultiheadAttention(nn.Module):
    """Source-compatible QKV packing: Q, K, V contiguous along output rows."""

    def __init__(self, dims: int = N_EMBD, heads: int = N_HEAD, dropout: float = DROPOUT) -> None:
        super().__init__()
        if dims % heads:
            raise ValueError("embedding_dimension_not_divisible_by_heads")
        self.in_proj_weight = mx.zeros((3 * dims, dims), dtype=mx.float32)
        self.in_proj_bias = mx.zeros((3 * dims,), dtype=mx.float32)
        self.out_proj = ExactLinear(dims, dims, bias=True)
        self.heads = int(heads)
        self.head_dim = dims // heads
        self.dropout = nn.Dropout(p=dropout)

    def __call__(self, x: mx.array, *, past: LayerKV | None = None, training: bool = False) -> tuple[mx.array, LayerKV]:
        batch, time, dims = x.shape
        if dims != self.heads * self.head_dim:
            raise ValueError("attention_embedding_dimension_mismatch")
        projected = x @ mx.transpose(self.in_proj_weight) + self.in_proj_bias
        projected = mx.transpose(projected.reshape(batch, time, 3, self.heads, self.head_dim), (2, 0, 3, 1, 4))
        query, key, value = projected[0], projected[1], projected[2]
        past_length = 0 if past is None else past.length
        if past is not None:
            key = mx.concatenate((past.key, key), axis=2)
            value = mx.concatenate((past.value, value), axis=2)
        key_length = int(key.shape[2])
        query_positions = mx.arange(past_length, past_length + time)[:, None]
        key_positions = mx.arange(key_length)[None, :]
        causal = query_positions >= key_positions
        scores = (query @ mx.transpose(key, (0, 1, 3, 2))) / math.sqrt(self.head_dim)
        scores = mx.where(causal[None, None, :, :], scores, mx.array(-1e30, dtype=scores.dtype))
        weights = mx.softmax(scores, axis=-1)
        if training:
            weights = self.dropout(weights)
        attended = weights @ value
        attended = mx.transpose(attended, (0, 2, 1, 3)).reshape(batch, time, dims)
        return self.out_proj(attended), LayerKV(key=key, value=value)


class CausalSelfAttention(nn.Module):
    def __init__(self, *, context_length: int = CONTEXT_LENGTH) -> None:
        super().__init__()
        # ``mask`` is retained as a non-trainable source tensor for strict seed
        # loading and audit. The dynamic comparison in PackedMultiheadAttention
        # has the same True=masked-upper-triangle semantics as the source.
        self.mask = mx.triu(mx.ones((context_length, context_length), dtype=mx.bool_), k=1)
        self.attn = PackedMultiheadAttention()

    def __call__(self, x: mx.array, *, past: LayerKV | None = None, training: bool = False) -> tuple[mx.array, LayerKV]:
        return self.attn(x, past=past, training=training)


class ExactGELU(nn.Module):
    """PyTorch ``nn.GELU(approximate='none')`` with no trainable tensors."""

    def __call__(self, x: mx.array) -> mx.array:
        return 0.5 * x * (1.0 + mx.erf(x / math.sqrt(2.0)))


class DecoderBlock(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.ln1 = ExactLayerNorm(N_EMBD)
        self.attn = CausalSelfAttention()
        self.ln2 = ExactLayerNorm(N_EMBD)
        # A direct list is intentional: MLX serialises it as ``mlp.0`` and
        # ``mlp.2``, exactly matching PyTorch ``nn.Sequential`` source keys.
        self.mlp = [ExactLinear(N_EMBD, MLP_DIM, bias=True), ExactGELU(), ExactLinear(MLP_DIM, N_EMBD, bias=True), nn.Dropout(p=DROPOUT)]

    def __call__(self, x: mx.array, *, past: LayerKV | None = None, training: bool = False) -> tuple[mx.array, LayerKV]:
        attended, updated = self.attn(self.ln1(x), past=past, training=training)
        x = x + attended
        mlp_input = self.ln2(x)
        mlp_output = self.mlp[2](self.mlp[1](self.mlp[0](mlp_input)))
        if training:
            mlp_output = self.mlp[3](mlp_output)
        return x + mlp_output, updated


class R29B2MDecoder(nn.Module):
    """The full contextual seven-layer decoder, with optional KV decoding."""

    def __init__(self, *, context_length: int = CONTEXT_LENGTH) -> None:
        super().__init__()
        if context_length != CONTEXT_LENGTH:
            raise ValueError("r28m1_context_length_must_remain_256")
        self.token_emb = ExactEmbedding(VOCAB_SIZE, N_EMBD)
        self.pos_emb = ExactEmbedding(CONTEXT_LENGTH, N_EMBD)
        self.drop = nn.Dropout(p=DROPOUT)
        self.blocks = [DecoderBlock() for _ in range(N_LAYER)]
        self.ln_f = ExactLayerNorm(N_EMBD)
        self.lm_head = ExactLinear(N_EMBD, VOCAB_SIZE, bias=False)
        self.context_length = context_length

    def __call__(self, token_ids: mx.array, *, cache: KVCache | None = None, training: bool = False) -> tuple[mx.array, KVCache | None]:
        if len(token_ids.shape) != 2:
            raise ValueError("token_ids_must_have_batch_and_time_dimensions")
        batch, time = token_ids.shape
        if batch < 1 or time < 1:
            raise ValueError("empty_decoder_input")
        prior_length = 0 if cache is None else cache.length
        if prior_length + time > self.context_length:
            raise ValueError("context_overflow")
        positions = mx.arange(prior_length, prior_length + time)
        x = self.token_emb(token_ids) + self.pos_emb(positions)[None, :, :]
        if training:
            x = self.drop(x)
        output_cache = None if cache is None else KVCache.empty(n_layer=N_LAYER, capacity=cache.capacity)
        for index, block in enumerate(self.blocks):
            previous = None if cache is None else cache.layers[index]
            x, updated = block(x, past=previous, training=training)
            if output_cache is not None:
                output_cache.layers[index] = updated
        return self.lm_head(self.ln_f(x)), output_cache

    def prefill(self, token_ids: mx.array) -> tuple[mx.array, KVCache]:
        logits, cache = self(token_ids, cache=KVCache.empty(capacity=self.context_length), training=False)
        if cache is None:
            raise AssertionError("prefill_requires_cache")
        return logits, cache

    def incremental(self, token_ids: mx.array, cache: KVCache) -> tuple[mx.array, KVCache]:
        logits, updated = self(token_ids, cache=cache, training=False)
        if updated is None:
            raise AssertionError("incremental_requires_cache")
        return logits, updated


def expected_tensor_shapes() -> dict[str, tuple[int, ...]]:
    shapes: dict[str, tuple[int, ...]] = {
        "token_emb.weight": (VOCAB_SIZE, N_EMBD),
        "pos_emb.weight": (CONTEXT_LENGTH, N_EMBD),
        "ln_f.weight": (N_EMBD,),
        "ln_f.bias": (N_EMBD,),
        "lm_head.weight": (VOCAB_SIZE, N_EMBD),
    }
    for layer in range(N_LAYER):
        prefix = f"blocks.{layer}"
        shapes.update({
            f"{prefix}.ln1.weight": (N_EMBD,),
            f"{prefix}.ln1.bias": (N_EMBD,),
            f"{prefix}.attn.mask": (CONTEXT_LENGTH, CONTEXT_LENGTH),
            f"{prefix}.attn.attn.in_proj_weight": (3 * N_EMBD, N_EMBD),
            f"{prefix}.attn.attn.in_proj_bias": (3 * N_EMBD,),
            f"{prefix}.attn.attn.out_proj.weight": (N_EMBD, N_EMBD),
            f"{prefix}.attn.attn.out_proj.bias": (N_EMBD,),
            f"{prefix}.ln2.weight": (N_EMBD,),
            f"{prefix}.ln2.bias": (N_EMBD,),
            f"{prefix}.mlp.0.weight": (MLP_DIM, N_EMBD),
            f"{prefix}.mlp.0.bias": (MLP_DIM,),
            f"{prefix}.mlp.2.weight": (N_EMBD, MLP_DIM),
            f"{prefix}.mlp.2.bias": (N_EMBD,),
        })
    return shapes


def source_weight_pairs(seed_path: Path) -> list[tuple[str, mx.array]]:
    state = mx.load(str(seed_path))
    expected = expected_tensor_shapes()
    if set(state) != set(expected):
        missing, unexpected = sorted(set(expected) - set(state)), sorted(set(state) - set(expected))
        raise ValueError(f"seed_tensor_set_mismatch:missing={missing}:unexpected={unexpected}")
    for name, shape in expected.items():
        if tuple(state[name].shape) != shape:
            raise ValueError(f"seed_tensor_shape:{name}:{tuple(state[name].shape)}!={shape}")
    return [(name, state[name]) for name in sorted(state)]


def load_r28m1_seed(seed_path: Path) -> R29B2MDecoder:
    model = R29B2MDecoder()
    # strict=True ensures the 96 recovered source tensors map one-to-one.
    model.load_weights(source_weight_pairs(seed_path), strict=True)
    model.eval()
    return model


def architecture_fingerprint(*, mini_decoder_path: Path, model_source_path: Path, tokenizer_sha256: str, wrapper_version: str) -> str:
    payload = {
        "mini_decoder_sha256": hashlib.sha256(mini_decoder_path.read_bytes()).hexdigest(),
        "mlx_model_sha256": hashlib.sha256(model_source_path.read_bytes()).hexdigest(),
        "tensor_shapes": {key: list(value) for key, value in sorted(expected_tensor_shapes().items())},
        "config": {"vocab_size": VOCAB_SIZE, "context_length": CONTEXT_LENGTH, "n_layer": N_LAYER, "n_embd": N_EMBD, "n_head": N_HEAD, "head_dim": HEAD_DIM},
        "attention": "pre_ln;packed_qkv=Q,K,V;scale=1/sqrt(64);causal_upper_triangle_true_masked;out_projection_bias",
        "layernorm_eps": LAYERNORM_EPS,
        "gelu": "exact_erf",
        "weight_tying": False,
        "tokenizer_sha256": tokenizer_sha256,
        "wrapper_version": wrapper_version,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
