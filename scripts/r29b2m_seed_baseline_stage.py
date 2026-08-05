#!/usr/bin/env python3
"""Freeze the q4-recovered seed's real generated daily-dialogue baseline."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import sys
from time import perf_counter


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.training.mlx.r29b2m_campaign import atomic_json  # noqa: E402
from src.training.mlx.r29b2m_daily_eval import frozen_sessions, session_manifest_sha256, structural_review  # noqa: E402
from src.training.mlx.r29b2m_model import CONTEXT_LENGTH, load_r28m1_seed  # noqa: E402
from src.training.mlx.r29b2m_q4_source import sha256_file  # noqa: E402
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer, WRAPPER_VERSION, wrapper_for_messages  # noqa: E402


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def generate(model, tokenizer, input_ids: list[int], *, max_new_tokens: int = 64) -> tuple[list[int], float]:
    import mlx.core as mx
    started = perf_counter()
    logits, cache = model.prefill(mx.array([input_ids], dtype=mx.int32))
    output: list[int] = []
    for _ in range(max_new_tokens):
        token = int(mx.argmax(logits[:, -1, :], axis=-1).item())
        output.append(token)
        if token == tokenizer.eos or cache.length >= CONTEXT_LENGTH:
            break
        logits, cache = model.incremental(mx.array([[token]], dtype=mx.int32), cache)
    return output, perf_counter() - started


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--seed", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path, required=True)
    args = parser.parse_args()
    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer)
    sessions = frozen_sessions()
    model = load_r28m1_seed(args.seed)
    rows = []
    failures = []
    family_stats: dict[str, dict[str, int]] = {}
    for index, session in enumerate(sessions, 1):
        wrapper = wrapper_for_messages(session["messages"])
        ids = tokenizer.encode(wrapper, max_tokens=CONTEXT_LENGTH, add_bos=True)
        generated, elapsed = generate(model, tokenizer, ids)
        raw_output = tokenizer.decode(generated)
        review = structural_review(raw_output)
        row = session | {
            "wrapper": wrapper,
            "input_token_ids": ids,
            "output_token_ids": generated,
            "raw_output": raw_output,
            "eos": bool(generated and generated[-1] == tokenizer.eos),
            "latency_seconds": elapsed,
            "tokens_per_second": len(generated) / elapsed if elapsed else None,
            "structural_review": review,
        }
        rows.append(row)
        bucket = family_stats.setdefault(session["family_id"], {"sessions": 0, "mojibake": 0, "role_prefix_leakage": 0, "repeated_output": 0, "short_contract": 0, "manual_review_needed": 0})
        bucket["sessions"] += 1
        for key in ("mojibake", "role_prefix_leakage", "repeated_output", "short_contract", "manual_review_needed"):
            bucket[key] += int(bool(review[key]))
        if any(review[key] for key in ("mojibake", "role_prefix_leakage", "repeated_output")):
            failures.append({"session_id": session["session_id"], "family_id": session["family_id"], "failure": {key: review[key] for key in ("mojibake", "role_prefix_leakage", "repeated_output")}, "raw_output": raw_output})
        print(json.dumps({"session": index, "total": len(sessions), "session_id": session["session_id"], "latency_seconds": elapsed}, ensure_ascii=False), flush=True)
    category_scores = {
        family: stats | {"structural_valid_rate": 1 - ((stats["mojibake"] + stats["role_prefix_leakage"] + stats["repeated_output"]) / max(1, stats["sessions"] * 3)), "evidence_class": "self_authored_dev_structural_evidence_not_independent_blind"}
        for family, stats in family_stats.items()
    }
    report = {
        "campaign_id": "r29b2m_m1_mlx_daily_dialogue_v1",
        "created_at": now(),
        "evidence_class": "frozen_project_authored_dev_evidence; manual_review_needed; not independent blind evidence",
        "seed_kind": "r28m1_q4_recovered_seed",
        "seed_sha256": sha256_file(args.seed),
        "tokenizer_sha256": sha256_file(args.tokenizer),
        "wrapper_version": WRAPPER_VERSION,
        "model_mode": "MLX full contextual attention plus per-session KV cache; greedy; no fallback; no answer bank; no retrieval substitution",
        "session_count": len(rows),
        "session_manifest_sha256": session_manifest_sha256(sessions),
        "sessions": rows,
        "category_scores": category_scores,
        "manual_review_needed": len(rows),
        "critical_failures": 0,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }
    atomic_json(args.artifact_root / "reports" / "seed_baseline.json", report)
    failure_path = args.artifact_root / "reports" / "seed_failure_bank.jsonl"
    failure_path.parent.mkdir(parents=True, exist_ok=True)
    failure_path.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in failures), encoding="utf-8")
    print(json.dumps({"session_count": len(rows), "failure_count": len(failures)}, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
