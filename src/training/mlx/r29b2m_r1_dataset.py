"""Assistant-response-only tokenisation for R29B2M-R1 dialogue rows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer, wrapper_for_messages


@dataclass(frozen=True)
class EncodedDialogue:
    token_ids: tuple[int, ...]
    label_ids: tuple[int, ...]
    loss_mask: tuple[int, ...]
    prompt_token_count: int
    assistant_target_token_count: int


def encode_assistant_response_only(
    tokenizer: ExactRuntimeTokenizer,
    row: dict[str, Any],
    *,
    context_length: int = 256,
) -> EncodedDialogue:
    messages = row.get("messages")
    target = row.get("target")
    if not isinstance(messages, list) or not messages or not isinstance(target, str) or not target.strip():
        raise ValueError("invalid_dialogue_training_row")
    prompt = wrapper_for_messages(
        messages,
        category=str(row.get("question_type") or "普通问答"),
        length_target="简短",
        evidence_policy=str(row.get("answer_policy") or "不确定时说明"),
    )
    prompt_ids = tokenizer.encode(prompt, max_tokens=context_length, add_bos=True)
    target_ids = tokenizer.encode(target, max_tokens=context_length, add_bos=False)
    if not target_ids:
        raise ValueError("empty_assistant_target_tokens")
    token_ids = prompt_ids + target_ids + [tokenizer.eos]
    if len(token_ids) > context_length:
        raise ValueError(f"dialogue_context_overflow:{len(token_ids)}")
    # Labels are next tokens.  The first supervised label predicts the first
    # target token from the final prompt token; EOS is supervised as well.
    label_ids = token_ids[1:]
    first_supervised_label = len(prompt_ids) - 1
    loss_mask = [0] * first_supervised_label + [1] * (len(label_ids) - first_supervised_label)
    if sum(loss_mask) != len(target_ids) + 1 or any(loss_mask[:first_supervised_label]):
        raise AssertionError("assistant_response_only_mask_contract")
    return EncodedDialogue(
        token_ids=tuple(token_ids),
        label_ids=tuple(label_ids),
        loss_mask=tuple(loss_mask),
        prompt_token_count=len(prompt_ids),
        assistant_target_token_count=len(target_ids) + 1,
    )
