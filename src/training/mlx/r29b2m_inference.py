"""Full-context and incremental KV inference helpers for R29B2M."""

from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any

import mlx.core as mx

from .r29b2m_model import CONTEXT_LENGTH, KVCache, R29B2MDecoder


@dataclass
class GenerationTrace:
    input_ids: list[int]
    generated_ids: list[int]
    selected_ids: list[int]
    logit_max_abs_errors: list[float]
    prefill_max_abs_error: float
    full_elapsed_seconds: float
    cached_elapsed_seconds: float
    final_cache_length: int


def _last_logits(model: R29B2MDecoder, ids: list[int]) -> mx.array:
    output, _ = model(mx.array([ids], dtype=mx.int32), cache=None, training=False)
    return output[:, -1, :]


def greedy_full_and_cached(model: R29B2MDecoder, input_ids: list[int], *, max_new_tokens: int = 12, eos: int | None = None, stop_on_eos: bool = False) -> GenerationTrace:
    """Run both paths interleaved so every selected token has direct parity."""
    if not input_ids or len(input_ids) >= CONTEXT_LENGTH:
        raise ValueError("invalid_generation_input_length")
    full_sequence = list(input_ids)
    full_logits = _last_logits(model, full_sequence)
    cached_logits_all, cache = model.prefill(mx.array([input_ids], dtype=mx.int32))
    cached_logits = cached_logits_all[:, -1, :]
    mx.eval(full_logits, cached_logits)
    prefill_error = float(mx.max(mx.abs(full_logits - cached_logits)).item())
    generated: list[int] = []
    selected: list[int] = []
    errors: list[float] = []
    full_elapsed = 0.0
    cached_elapsed = 0.0
    for _ in range(max_new_tokens):
        mx.eval(full_logits, cached_logits)
        errors.append(float(mx.max(mx.abs(full_logits - cached_logits)).item()))
        full_token = int(mx.argmax(full_logits, axis=-1).item())
        cached_token = int(mx.argmax(cached_logits, axis=-1).item())
        if full_token != cached_token:
            raise AssertionError(f"greedy_token_mismatch:{full_token}!={cached_token}")
        generated.append(full_token)
        selected.append(cached_token)
        if stop_on_eos and eos is not None and full_token == eos:
            break
        if len(full_sequence) + 1 >= CONTEXT_LENGTH:
            break
        full_sequence.append(full_token)
        started = perf_counter()
        full_logits = _last_logits(model, full_sequence)
        mx.eval(full_logits)
        full_elapsed += perf_counter() - started
        started = perf_counter()
        cached_logits_step, cache = model.incremental(mx.array([[full_token]], dtype=mx.int32), cache)
        mx.eval(cached_logits_step)
        cached_elapsed += perf_counter() - started
        cached_logits = cached_logits_step[:, -1, :]
    return GenerationTrace(
        input_ids=list(input_ids),
        generated_ids=generated,
        selected_ids=selected,
        logit_max_abs_errors=errors,
        prefill_max_abs_error=prefill_error,
        full_elapsed_seconds=full_elapsed,
        cached_elapsed_seconds=cached_elapsed,
        final_cache_length=cache.length,
    )


def cache_reset_error(model: R29B2MDecoder, input_ids: list[int]) -> float:
    _, cache = model.prefill(mx.array([input_ids], dtype=mx.int32))
    cache.reset()
    reset_logits, reset_cache = model.prefill(mx.array([input_ids], dtype=mx.int32))
    initial_logits, initial_cache = model.prefill(mx.array([input_ids], dtype=mx.int32))
    mx.eval(reset_logits, initial_logits)
    if reset_cache.length != initial_cache.length:
        raise AssertionError("cache_reset_length_mismatch")
    return float(mx.max(mx.abs(reset_logits - initial_logits)).item())


def no_future_leak_error(model: R29B2MDecoder, prefix: list[int], changed_future: list[int]) -> float:
    left, _ = model(mx.array([prefix + changed_future], dtype=mx.int32), cache=None, training=False)
    right, _ = model(mx.array([prefix + list(reversed(changed_future))], dtype=mx.int32), cache=None, training=False)
    mx.eval(left, right)
    return float(mx.max(mx.abs(left[:, len(prefix) - 1, :] - right[:, len(prefix) - 1, :])).item())


def session_isolation_error(model: R29B2MDecoder, session_a: list[int], session_b: list[int]) -> float:
    _, cache_a = model.prefill(mx.array([session_a], dtype=mx.int32))
    b_interleaved, cache_b = model.prefill(mx.array([session_b], dtype=mx.int32))
    b_fresh, fresh_cache = model.prefill(mx.array([session_b], dtype=mx.int32))
    mx.eval(b_interleaved, b_fresh)
    if cache_a.length != len(session_a) or cache_b.length != fresh_cache.length:
        raise AssertionError("cache_session_length_mismatch")
    return float(mx.max(mx.abs(b_interleaved - b_fresh)).item())


def tiny_causal_fixture() -> dict[str, Any]:
    """A small independently calculable causal-attention regression fixture."""
    q = mx.array([[[[1.0]]]])
    keys = mx.array([[[[1.0], [5.0]]]])
    values = mx.array([[[[2.0], [100.0]]]])
    allowed = mx.array([[True, False]])
    scores = q @ mx.transpose(keys, (0, 1, 3, 2))
    weights = mx.softmax(mx.where(allowed[None, None], scores, mx.array(-1e30)), axis=-1)
    result = weights @ values
    mx.eval(result, weights)
    return {"weights": weights.tolist(), "result": result.tolist(), "future_blocked": float(result.item()) == 2.0}
