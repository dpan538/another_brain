from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass
class TokenAccountingV2:
    planned_tokens: int = 0
    streamed_tokens: int = 0
    optimizer_tokens: int = 0
    effective_tokens: int = 0
    optimizer_steps: int = 0
    wall_clock_seconds: float = 0.0
    tokens_per_second_planned: float = 0.0
    tokens_per_second_optimizer: float = 0.0
    token_accounting_trust: str = "low"
    suspected_issue: str = "unknown"

    def to_dict(self) -> dict:
        return asdict(self)


def optimizer_tokens_for_run(steps: int, context_length: int, batch_size: int, grad_accumulation: int = 1) -> int:
    return int(steps or 0) * int(context_length or 0) * int(batch_size or 0) * int(grad_accumulation or 1)


def classify_token_accounting(planned_tokens: int, optimizer_tokens: int, ledger_complete: bool = True) -> tuple[str, str]:
    planned = max(0, int(planned_tokens or 0))
    optimizer = max(0, int(optimizer_tokens or 0))
    if not ledger_complete:
        return "low", "ledger_incomplete"
    if optimizer <= 0:
        return "low", "unknown"
    ratio = planned / max(1, optimizer)
    if ratio > 1.5:
        return "low", "planned_token_count_used"
    if ratio < 0.67:
        return "medium", "unknown"
    return "high", "optimizer_count_trusted"


def summarize_token_accounting(
    planned_tokens: int,
    streamed_tokens: int,
    optimizer_tokens: int,
    optimizer_steps: int,
    wall_clock_seconds: float,
    ledger_complete: bool = True,
) -> TokenAccountingV2:
    trust, issue = classify_token_accounting(planned_tokens, optimizer_tokens, ledger_complete)
    wall = float(wall_clock_seconds or 0.0)
    return TokenAccountingV2(
        planned_tokens=int(planned_tokens or 0),
        streamed_tokens=int(streamed_tokens or 0),
        optimizer_tokens=int(optimizer_tokens or 0),
        effective_tokens=int(optimizer_tokens or 0),
        optimizer_steps=int(optimizer_steps or 0),
        wall_clock_seconds=wall,
        tokens_per_second_planned=(float(planned_tokens or 0) / wall) if wall > 0 else 0.0,
        tokens_per_second_optimizer=(float(optimizer_tokens or 0) / wall) if wall > 0 else 0.0,
        token_accounting_trust=trust,
        suspected_issue=issue,
    )
