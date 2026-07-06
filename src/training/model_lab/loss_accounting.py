from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Iterable


FULL_NEXT_TOKEN = "full_next_token"
ASSISTANT_RESPONSE_ONLY = "assistant_response_only"
MASK_POLICIES = {FULL_NEXT_TOKEN, ASSISTANT_RESPONSE_ONLY}


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def make_loss_mask(length: int, mask_policy: str = FULL_NEXT_TOKEN, prompt_token_count: int = 0) -> list[int]:
    """Build a next-token loss mask for one target sequence."""

    if mask_policy not in MASK_POLICIES:
        raise ValueError(f"unknown_mask_policy:{mask_policy}")
    length = int(length)
    if length <= 0:
        return []
    if mask_policy == FULL_NEXT_TOKEN:
        return [1] * length
    prompt_token_count = max(0, min(int(prompt_token_count), length))
    return [0] * prompt_token_count + [1] * (length - prompt_token_count)


def weighted_average(loss_values: Iterable[float], token_counts: Iterable[int]) -> dict[str, Any]:
    loss_sum = 0.0
    tokens = 0
    for loss, count in zip(loss_values, token_counts):
        c = int(count)
        if c <= 0:
            continue
        loss_sum += _to_float(loss) * c
        tokens += c
    average = loss_sum / tokens if tokens else None
    return {
        "total_loss_sum": loss_sum,
        "total_loss_tokens": tokens,
        "average_loss": average,
        "perplexity": None if average is None else math.exp(min(average, 50.0)),
    }


@dataclass
class LossAccumulator:
    split: str
    mask_policy: str = FULL_NEXT_TOKEN
    total_loss_sum: float = 0.0
    total_loss_tokens: int = 0
    curriculum: dict[str, dict[str, float | int]] = field(default_factory=lambda: defaultdict(lambda: {"loss_sum": 0.0, "loss_tokens": 0}))

    def add(self, average_loss: float, loss_tokens: int, curriculum: str = "unknown") -> None:
        count = int(loss_tokens)
        if count <= 0:
            return
        loss_sum = _to_float(average_loss) * count
        self.total_loss_sum += loss_sum
        self.total_loss_tokens += count
        bucket = self.curriculum[str(curriculum)]
        bucket["loss_sum"] = _to_float(bucket.get("loss_sum")) + loss_sum
        bucket["loss_tokens"] = int(bucket.get("loss_tokens", 0)) + count

    @property
    def average_loss(self) -> float | None:
        if self.total_loss_tokens <= 0:
            return None
        return self.total_loss_sum / self.total_loss_tokens

    @property
    def perplexity(self) -> float | None:
        avg = self.average_loss
        if avg is None:
            return None
        return math.exp(min(avg, 50.0))

    def to_report(self) -> dict[str, Any]:
        breakdown: dict[str, Any] = {}
        for name, values in self.curriculum.items():
            tokens = int(values.get("loss_tokens", 0))
            loss_sum = _to_float(values.get("loss_sum"))
            avg = loss_sum / tokens if tokens else None
            breakdown[name] = {
                "total_loss_sum": loss_sum,
                "total_loss_tokens": tokens,
                "average_loss": avg,
                "perplexity": None if avg is None else math.exp(min(avg, 50.0)),
            }
        return {
            "split": self.split,
            "mask_policy": self.mask_policy,
            "total_loss_sum": self.total_loss_sum,
            "total_loss_tokens": self.total_loss_tokens,
            "average_loss": self.average_loss,
            "perplexity": self.perplexity,
            "curriculum_breakdown": breakdown,
        }


def token_weighted_torch_loss(torch, logits, targets, mask=None):
    """Return summed NLL, counted tokens, and average NLL for a batch."""

    import torch.nn.functional as F

    vocab = logits.size(-1)
    flat_losses = F.cross_entropy(logits.reshape(-1, vocab), targets.reshape(-1), reduction="none")
    if mask is None:
        flat_mask = torch.ones_like(flat_losses)
    else:
        flat_mask = mask.reshape(-1).to(flat_losses.device).float()
    loss_sum = (flat_losses * flat_mask).sum()
    loss_tokens = int(flat_mask.sum().detach().cpu().item())
    average_loss = loss_sum / max(loss_tokens, 1)
    return loss_sum, loss_tokens, average_loss


def toy_negative_log_likelihood(probabilities: list[float], mask: list[int] | None = None) -> dict[str, Any]:
    mask = mask if mask is not None else [1] * len(probabilities)
    acc = LossAccumulator(split="toy", mask_policy="assistant_response_only" if any(v == 0 for v in mask) else FULL_NEXT_TOKEN)
    loss_sum = 0.0
    count = 0
    for probability, keep in zip(probabilities, mask):
        if not keep:
            continue
        loss_sum += -math.log(max(float(probability), 1e-12))
        count += 1
    if count:
        acc.add(loss_sum / count, count, "toy")
    return acc.to_report()
