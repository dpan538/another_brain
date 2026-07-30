from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.training.model_lab.loss_accounting import LossAccumulator, FULL_NEXT_TOKEN


@dataclass
class TrainMetrics:
    effective_tokens_per_step: int
    planned_tokens: int = 0
    streamed_tokens: int = 0
    optimizer_steps: int = 0
    last_batch_loss: float | None = None
    running_loss: LossAccumulator = field(default_factory=lambda: LossAccumulator(split="train_running", mask_policy=FULL_NEXT_TOKEN))

    @property
    def optimizer_tokens(self) -> int:
        return int(self.optimizer_steps) * int(self.effective_tokens_per_step)

    @property
    def effective_tokens(self) -> int:
        return self.optimizer_tokens

    @property
    def running_train_loss(self) -> float | None:
        return self.running_loss.average_loss

    def add_optimizer_step(self, batch_loss: float, loss_tokens: int, curriculum: str = "unknown") -> None:
        self.optimizer_steps += 1
        self.last_batch_loss = float(batch_loss)
        self.running_loss.add(float(batch_loss), int(loss_tokens), curriculum)

    def headline_metrics(self) -> dict[str, Any]:
        return {
            "primary_token_metric": "optimizer_tokens",
            "planned_tokens": int(self.planned_tokens),
            "streamed_tokens": int(self.streamed_tokens),
            "optimizer_tokens": self.optimizer_tokens,
            "effective_tokens": self.effective_tokens,
            "optimizer_steps": int(self.optimizer_steps),
            "running_train_loss": self.running_train_loss,
            "running_train_loss_report": self.running_loss.to_report(),
            "last_batch_loss": self.last_batch_loss,
            "last_batch_loss_debug_only": True,
            "headline_train_loss_source": "token_weighted_running_or_eval_loss",
        }


def validate_headline_not_last_batch(report: dict[str, Any]) -> bool:
    source = str(report.get("headline_train_loss_source", ""))
    if source == "last_batch_loss":
        return False
    return bool(report.get("last_batch_loss_debug_only") is True)
