#!/usr/bin/env python3
"""Measure future pairwise-ranker context with the exact committed efish tokenizer."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer


ROOT = Path(__file__).resolve().parents[1]
TOKENIZER_PATH = ROOT / "web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json"
HARD_CONTEXT_LIMIT = 256
PREFERRED_LIMIT = 248


def minimum_context(messages: list[dict[str, str]]) -> str:
    if not messages or messages[-1].get("role") != "user":
        raise ValueError("latest_message_must_be_user")
    rows: list[str] = []
    for message in messages:
        role = message.get("role")
        content = str(message.get("content", "")).strip()
        if role not in {"user", "assistant"} or not content:
            raise ValueError("invalid_context_message")
        rows.append(("用户：" if role == "user" else "回答：") + content)
    return "\n".join(rows)


def serialize_pair(messages: list[dict[str, str]], candidate_a: str, candidate_b: str) -> str:
    if not candidate_a.strip() or not candidate_b.strip():
        raise ValueError("candidate_required")
    return (
        "<CTX>\n"
        + minimum_context(messages)
        + "\n</CTX>\n<A>\n"
        + candidate_a.strip()
        + "\n</A>\n<B>\n"
        + candidate_b.strip()
        + "\n</B>\n<EOS>"
    )


def serialization_without_eos_literal(messages: list[dict[str, str]], candidate_a: str, candidate_b: str) -> str:
    """Render the textual prefix; the actual tokenizer EOS id is appended separately."""
    serialized = serialize_pair(messages, candidate_a, candidate_b)
    return serialized.removesuffix("<EOS>")


def measure_pair(
    tokenizer: ExactRuntimeTokenizer,
    messages: list[dict[str, str]],
    candidate_a: str,
    candidate_b: str,
) -> dict[str, Any]:
    context_text = minimum_context(messages)
    serialized = serialize_pair(messages, candidate_a, candidate_b)
    tokenized_prefix = serialization_without_eos_literal(messages, candidate_a, candidate_b)
    # max_tokens is deliberately larger than the model context so measurement never truncates.
    full_ids = tokenizer.encode(tokenized_prefix, max_tokens=100_000, add_bos=True) + [tokenizer.eos]
    total_tokens = len(full_ids)
    context_tokens = len(tokenizer.encode(context_text, max_tokens=100_000, add_bos=False))
    candidate_a_tokens = len(tokenizer.encode(candidate_a.strip(), max_tokens=100_000, add_bos=False))
    candidate_b_tokens = len(tokenizer.encode(candidate_b.strip(), max_tokens=100_000, add_bos=False))
    fits = total_tokens < HARD_CONTEXT_LIMIT
    return {
        "schema_version": "r29p0.context_fit.v1",
        "tokenizer": "r28m1_exact_runtime_tokenizer",
        "serialization": "<CTX>...</CTX><A>...</A><B>...</B><EOS>",
        "eos_encoding": "actual_tokenizer_eos_id",
        "context_tokens": context_tokens,
        "candidate_a_tokens": candidate_a_tokens,
        "candidate_b_tokens": candidate_b_tokens,
        "total_tokens": total_tokens,
        "hard_limit_exclusive": HARD_CONTEXT_LIMIT,
        "preferred_limit_inclusive": PREFERRED_LIMIT,
        "fits": fits,
        "preferred_fit": total_tokens <= PREFERRED_LIMIT,
        "decision": "RANK" if fits else "ABSTAIN_FALLBACK_A",
        "semantic_truncation_performed": False,
        "serialized": serialized if fits else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="JSON object with messages, candidate_a, candidate_b")
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    tokenizer = ExactRuntimeTokenizer.from_file(TOKENIZER_PATH)
    result = measure_pair(tokenizer, payload["messages"], payload["candidate_a"], payload["candidate_b"])
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
