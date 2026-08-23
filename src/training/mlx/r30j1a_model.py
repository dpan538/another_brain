"""Classifier-only MLX model for R30J1A descriptive representation learning.

The module deliberately does not expose logits over the tokenizer vocabulary.
It warm-starts the seven transformer blocks and the first 256 positional rows
from an admitted R28/R3 lineage, adds independently trainable rows 256--511,
and emits only a normalized representation plus descriptive classifier heads.
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
from mlx.utils import tree_flatten

from src.training.mlx.r29b2m_model import (
    ExactEmbedding,
    ExactGELU,
    ExactLayerNorm,
    ExactLinear,
    HEAD_DIM,
    MLP_DIM,
    N_EMBD,
    N_HEAD,
    N_LAYER,
    VOCAB_SIZE,
)


SOURCE_CONTEXT = 256
JUDGE_CONTEXT = 512
PROJECTION_HIDDEN = 768
REPRESENTATION_DIMS = 512
DOMAIN_COUNT = 4
MECHANICS_COUNT = 10
INITIALIZATION_SEED = 3001101


@dataclass(frozen=True)
class J1AOutput:
    representation: mx.array
    domain_logits: mx.array
    register_logits: mx.array
    mechanics_logits: mx.array


class Dense(nn.Module):
    """Small explicitly initialised dense layer with stable tensor names."""

    def __init__(self, input_dims: int, output_dims: int, *, scale: float | None = None) -> None:
        super().__init__()
        bound = scale if scale is not None else math.sqrt(2.0 / (input_dims + output_dims))
        self.weight = mx.random.normal((output_dims, input_dims), dtype=mx.float32) * bound
        self.bias = mx.zeros((output_dims,), dtype=mx.float32)

    def __call__(self, x: mx.array) -> mx.array:
        return x @ mx.transpose(self.weight) + self.bias


class J1AAttention(nn.Module):
    """Source-compatible packed QKV attention with a frozen attention mode."""

    def __init__(self, *, attention_mode: str) -> None:
        super().__init__()
        if attention_mode not in {"causal", "bidirectional"}:
            raise ValueError("invalid_attention_mode")
        self.in_proj_weight = mx.zeros((3 * N_EMBD, N_EMBD), dtype=mx.float32)
        self.in_proj_bias = mx.zeros((3 * N_EMBD,), dtype=mx.float32)
        self.out_proj = ExactLinear(N_EMBD, N_EMBD, bias=True)
        self.attention_mode = attention_mode

    def __call__(self, x: mx.array) -> mx.array:
        batch, time, dims = x.shape
        if dims != N_EMBD:
            raise ValueError("attention_embedding_dimension_mismatch")
        projected = x @ mx.transpose(self.in_proj_weight) + self.in_proj_bias
        projected = mx.transpose(projected.reshape(batch, time, 3, N_HEAD, HEAD_DIM), (2, 0, 3, 1, 4))
        query, key, value = projected[0], projected[1], projected[2]
        scores = (query @ mx.transpose(key, (0, 1, 3, 2))) / math.sqrt(HEAD_DIM)
        if self.attention_mode == "causal":
            positions = mx.arange(time)
            allowed = positions[:, None] >= positions[None, :]
            scores = mx.where(allowed[None, None, :, :], scores, mx.array(-1e30, dtype=scores.dtype))
        weights = mx.softmax(scores, axis=-1)
        attended = weights @ value
        attended = mx.transpose(attended, (0, 2, 1, 3)).reshape(batch, time, dims)
        return self.out_proj(attended)


class J1ASelfAttention(nn.Module):
    def __init__(self, *, attention_mode: str) -> None:
        super().__init__()
        # The 512x512 tensor is governance-visible but never trainable.  It
        # preserves the source tensor naming convention without pretending
        # that bidirectional warm-start is parity with the source decoder.
        self.mask = mx.triu(mx.ones((JUDGE_CONTEXT, JUDGE_CONTEXT), dtype=mx.bool_), k=1)
        self.attn = J1AAttention(attention_mode=attention_mode)

    def __call__(self, x: mx.array) -> mx.array:
        return self.attn(x)


class J1ABlock(nn.Module):
    def __init__(self, *, attention_mode: str) -> None:
        super().__init__()
        self.ln1 = ExactLayerNorm(N_EMBD)
        self.attn = J1ASelfAttention(attention_mode=attention_mode)
        self.ln2 = ExactLayerNorm(N_EMBD)
        self.mlp = [ExactLinear(N_EMBD, MLP_DIM, bias=True), ExactGELU(), ExactLinear(MLP_DIM, N_EMBD, bias=True)]

    def __call__(self, x: mx.array) -> mx.array:
        x = x + self.attn(self.ln1(x))
        return x + self.mlp[2](self.mlp[1](self.mlp[0](self.ln2(x))))


class PersonalRepresentationProjectionV1(nn.Module):
    """Moderately expressive 896 -> 768 -> 512 normalized projection."""

    def __init__(self) -> None:
        super().__init__()
        self.input_norm = ExactLayerNorm(N_EMBD)
        self.hidden = Dense(N_EMBD, PROJECTION_HIDDEN)
        self.activation = ExactGELU()
        self.output = Dense(PROJECTION_HIDDEN, REPRESENTATION_DIMS)
        self.output_norm = ExactLayerNorm(REPRESENTATION_DIMS)

    def __call__(self, x: mx.array) -> mx.array:
        projected = self.output(self.activation(self.hidden(self.input_norm(x))))
        projected = self.output_norm(projected)
        norm = mx.sqrt(mx.sum(projected * projected, axis=-1, keepdims=True) + 1e-12)
        return projected / norm


class EfishPersonalJudgeJ1A(nn.Module):
    """Seven-layer descriptive encoder; never an answer generator."""

    def __init__(self, *, register_count: int, attention_mode: str) -> None:
        super().__init__()
        if register_count < 2:
            raise ValueError("register_count_too_small")
        mx.random.seed(INITIALIZATION_SEED)
        self.token_emb = ExactEmbedding(VOCAB_SIZE, N_EMBD)
        self.pos_emb_base = ExactEmbedding(SOURCE_CONTEXT, N_EMBD)
        self.pos_emb_extension = ExactEmbedding(JUDGE_CONTEXT - SOURCE_CONTEXT, N_EMBD)
        self.pos_emb_extension.weight = mx.random.normal(
            (JUDGE_CONTEXT - SOURCE_CONTEXT, N_EMBD), dtype=mx.float32
        ) * 0.02
        self.blocks = [J1ABlock(attention_mode=attention_mode) for _ in range(N_LAYER)]
        self.ln_f = ExactLayerNorm(N_EMBD)
        self.projection = PersonalRepresentationProjectionV1()
        self.domain_head = Dense(REPRESENTATION_DIMS, DOMAIN_COUNT)
        self.register_head = Dense(REPRESENTATION_DIMS, register_count)
        self.mechanics_head = Dense(REPRESENTATION_DIMS, MECHANICS_COUNT)
        self.register_count = int(register_count)
        self.attention_mode = attention_mode
        self.context_length = JUDGE_CONTEXT
        self.lm_head_absent = True
        self.autoregressive_decode = False

    def _position_values(self, time: int) -> mx.array:
        positions = mx.arange(time)
        base_indices = mx.minimum(positions, SOURCE_CONTEXT - 1)
        extension_indices = mx.maximum(positions - SOURCE_CONTEXT, 0)
        base = self.pos_emb_base(base_indices)
        extension = self.pos_emb_extension(extension_indices)
        return mx.where((positions < SOURCE_CONTEXT)[:, None], base, extension)

    def encode(self, token_ids: mx.array) -> mx.array:
        if len(token_ids.shape) != 2:
            raise ValueError("token_ids_must_have_batch_and_time_dimensions")
        batch, time = token_ids.shape
        if batch < 1 or time < 1 or time > self.context_length:
            raise ValueError("invalid_judge_input_shape")
        x = self.token_emb(token_ids) + self._position_values(time)[None, :, :]
        for block in self.blocks:
            x = block(x)
        # EOS is structurally the final token in every admitted unit.  In the
        # causal arm its state sees the full prefix; in the bidirectional arm
        # it sees the complete sequence under the alternate attention mode.
        return self.projection(self.ln_f(x)[:, -1, :])

    def __call__(self, token_ids: mx.array) -> J1AOutput:
        representation = self.encode(token_ids)
        return J1AOutput(
            representation=representation,
            domain_logits=self.domain_head(representation),
            register_logits=self.register_head(representation),
            mechanics_logits=self.mechanics_head(representation),
        )


def _source_target_name(name: str) -> str | None:
    if name == "pos_emb.weight":
        return "pos_emb_base.weight"
    if name == "lm_head.weight" or name.endswith(".attn.mask"):
        return None
    return name


def load_lineage_weights(model: EfishPersonalJudgeJ1A, source_path: Path) -> dict[str, Any]:
    """Load every compatible source tensor while explicitly removing LM head."""

    source = mx.load(str(source_path))
    model_parameters = dict(tree_flatten(model.parameters()))
    pairs: list[tuple[str, mx.array]] = []
    loaded_source_names: list[str] = []
    for source_name, value in sorted(source.items()):
        target_name = _source_target_name(source_name)
        if target_name is None:
            continue
        if target_name not in model_parameters:
            raise ValueError(f"lineage_tensor_has_no_j1a_target:{source_name}")
        if tuple(model_parameters[target_name].shape) != tuple(value.shape):
            raise ValueError(f"lineage_tensor_shape_mismatch:{source_name}")
        pairs.append((target_name, value))
        loaded_source_names.append(source_name)
    expected_loaded = {
        name for name in source if name != "lm_head.weight" and not name.endswith(".attn.mask")
    }
    if set(loaded_source_names) != expected_loaded:
        raise ValueError("lineage_tensor_coverage_mismatch")
    model.load_weights(pairs, strict=False)
    mx.eval(model.parameters())
    return {
        "source_path_sha256": sha256_file(source_path),
        "source_tensor_count": len(source),
        "loaded_tensor_count": len(pairs),
        "lm_head_loaded": False,
        "source_attention_masks_loaded": False,
        "new_position_rows": JUDGE_CONTEXT - SOURCE_CONTEXT,
        "warm_start_not_parity": model.attention_mode == "bidirectional",
    }


def configure_trainable_scope(model: EfishPersonalJudgeJ1A, *, scope: str) -> None:
    if scope not in {"probe", "last_one", "last_two"}:
        raise ValueError("invalid_trainable_scope")
    model.freeze(recurse=True)
    model.pos_emb_extension.unfreeze(recurse=True)
    model.projection.unfreeze(recurse=True)
    model.domain_head.unfreeze(recurse=True)
    model.register_head.unfreeze(recurse=True)
    model.mechanics_head.unfreeze(recurse=True)
    if scope in {"last_one", "last_two"}:
        model.ln_f.unfreeze(recurse=True)
        model.blocks[-1].unfreeze(recurse=True)
    if scope == "last_two":
        model.blocks[-2].unfreeze(recurse=True)
    # Masks remain frozen even inside an unfrozen block.
    for block in model.blocks:
        block.attn.freeze(recurse=False, keys="mask", strict=False)
    invalid = [name for name, value in tree_flatten(model.trainable_parameters()) if value.dtype not in {mx.float16, mx.float32, mx.bfloat16}]
    if invalid:
        raise ValueError("nonfloating_trainable_tensor:" + ",".join(invalid))


def parameter_report(model: EfishPersonalJudgeJ1A) -> dict[str, Any]:
    all_parameters = dict(tree_flatten(model.parameters()))
    trainable = dict(tree_flatten(model.trainable_parameters()))
    metadata = [
        {"name": name, "shape": list(value.shape), "dtype": str(value.dtype), "trainable": name in trainable}
        for name, value in sorted(all_parameters.items())
    ]
    count = lambda names: sum(int(all_parameters[name].size) for name in names)  # noqa: E731
    projection_names = [name for name in all_parameters if name.startswith("projection.")]
    head_names = [name for name in all_parameters if name.endswith("_head.weight") or name.endswith("_head.bias")]
    mask_names = [name for name in all_parameters if name.endswith(".mask")]
    return {
        "base_learned_parameter_count": sum(int(value.size) for name, value in all_parameters.items() if not name.startswith(("projection.", "domain_head.", "register_head.", "mechanics_head.")) and name not in mask_names),
        "projection_parameter_count": count(projection_names),
        "head_parameter_count": count(head_names),
        "total_parameter_count_excluding_masks": sum(int(value.size) for name, value in all_parameters.items() if name not in mask_names),
        "trainable_parameter_count": sum(int(value.size) for value in trainable.values()),
        "trainable_tensor_names": sorted(trainable),
        "frozen_tensor_count": len(all_parameters) - len(trainable),
        "mask_tensor_count": len(mask_names),
        "parameter_tree_sha256": hashlib.sha256(json.dumps(metadata, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        "lm_head_absent": not any(name.startswith("lm_head") for name in all_parameters),
        "autoregressive_decode": False,
    }


def architecture_sha256(*, register_labels: Iterable[str], attention_mode: str, scope: str) -> str:
    payload = {
        "version": "efish-personal-judge-j1a.v1",
        "register_labels": list(register_labels),
        "attention_mode": attention_mode,
        "trainable_scope": scope,
        "context": JUDGE_CONTEXT,
        "projection": [N_EMBD, PROJECTION_HIDDEN, REPRESENTATION_DIMS],
        "dropout": 0.0,
        "lm_head": False,
        "autoregressive_decode": False,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
