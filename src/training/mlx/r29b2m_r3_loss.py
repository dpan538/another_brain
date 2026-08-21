"""Assistant-response-only token-summed loss and gradient accumulation."""

from __future__ import annotations

from typing import Any, Sequence

from src.training.mlx.r29b2m_r1_dataset import EncodedDialogue


def validate_encoded_supervision(encoded: EncodedDialogue) -> None:
    if len(encoded.label_ids) != len(encoded.loss_mask):
        raise ValueError("label_mask_length_mismatch")
    supervised = sum(int(value) for value in encoded.loss_mask)
    if supervised <= 0:
        raise ValueError("zero_supervised_token_row")
    if supervised != encoded.assistant_target_token_count:
        raise ValueError("assistant_supervised_token_count_mismatch")
    first = next(index for index, value in enumerate(encoded.loss_mask) if value)
    if any(encoded.loss_mask[:first]) or not all(encoded.loss_mask[first:]):
        raise ValueError("assistant_only_mask_not_contiguous_suffix")


def masked_cross_entropy_sum(model: Any, encoded: EncodedDialogue, *, training: bool) -> tuple[Any, int]:
    import mlx.core as mx
    import mlx.nn as nn

    validate_encoded_supervision(encoded)
    inputs = mx.array([encoded.token_ids[:-1]], dtype=mx.int32)
    labels = mx.array(encoded.label_ids, dtype=mx.int32)
    mask = mx.array(encoded.loss_mask, dtype=mx.float32)
    logits, _ = model(inputs, cache=None, training=training)
    token_losses = nn.losses.cross_entropy(logits[0], labels, reduction="none")
    loss_sum = mx.sum(token_losses * mask)
    return loss_sum, encoded.assistant_target_token_count


def make_loss_and_grad(model: Any):
    import mlx.nn as nn

    def objective(active_model: Any, encoded: EncodedDialogue) -> Any:
        loss_sum, _ = masked_cross_entropy_sum(active_model, encoded, training=True)
        return loss_sum

    return nn.value_and_grad(model, objective)


def materialize_gradient_tree(gradients: Any) -> Any:
    import mlx.core as mx
    from mlx.utils import tree_map

    mx.eval(gradients)
    detached = tree_map(lambda value: mx.stop_gradient(value), gradients)
    mx.eval(detached)
    return detached


def add_gradient_trees(left: Any | None, right: Any) -> Any:
    import mlx.core as mx
    from mlx.utils import tree_map

    combined = right if left is None else tree_map(lambda a, b: a + b, left, right)
    mx.eval(combined)
    return tree_map(lambda value: mx.stop_gradient(value), combined)


def gradient_global_norm(gradients: Any) -> Any:
    import mlx.core as mx
    from mlx.utils import tree_flatten

    terms = [mx.sum(mx.square(value.astype(mx.float32))) for _, value in tree_flatten(gradients)]
    if not terms:
        raise ValueError("empty_gradient_tree")
    total = terms[0]
    for term in terms[1:]:
        total = total + term
    return mx.sqrt(total)


def normalize_and_clip_gradients(gradients: Any, supervised_tokens: int, *, max_norm: float = 1.0) -> tuple[Any, float, float]:
    import mlx.core as mx
    from mlx.utils import tree_map

    if supervised_tokens <= 0:
        raise ValueError("zero_accumulated_supervised_tokens")
    normalized = tree_map(lambda value: value / supervised_tokens, gradients)
    raw_norm = gradient_global_norm(normalized)
    mx.eval(raw_norm)
    raw_value = float(raw_norm.item())
    if not (raw_value >= 0.0 and raw_value < float("inf")):
        raise FloatingPointError("non_finite_gradient_norm")
    scale = mx.minimum(mx.array(1.0, dtype=mx.float32), mx.array(max_norm, dtype=mx.float32) / (raw_norm + 1e-12))
    clipped = tree_map(lambda value: value * scale.astype(value.dtype), normalized)
    clipped_norm = gradient_global_norm(clipped)
    mx.eval(clipped, clipped_norm)
    return clipped, raw_value, float(clipped_norm.item())


def token_weighted_mean(loss_sums: Sequence[float], supervised_tokens: Sequence[int]) -> float:
    total_tokens = sum(int(value) for value in supervised_tokens)
    if total_tokens <= 0 or len(loss_sums) != len(supervised_tokens):
        raise ValueError("invalid_token_weighted_loss_inputs")
    return sum(float(loss) for loss in loss_sums) / total_tokens
