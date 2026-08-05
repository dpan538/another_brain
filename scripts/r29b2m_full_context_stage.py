#!/usr/bin/env python3
"""Execute full-context and KV-cache evidence on the real recovered model."""

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
from src.training.mlx.r29b2m_inference import cache_reset_error, greedy_full_and_cached, no_future_leak_error, session_isolation_error, tiny_causal_fixture  # noqa: E402
from src.training.mlx.r29b2m_model import CONTEXT_LENGTH, KVCache, load_r28m1_seed  # noqa: E402
from src.training.mlx.r29b2m_q4_source import sha256_file  # noqa: E402
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer, WRAPPER_VERSION, wrapper_for_messages  # noqa: E402


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def rss_bytes() -> int | None:
    try:
        import psutil
        return int(psutil.Process(os.getpid()).memory_info().rss)
    except Exception:
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--seed", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path, required=True)
    args = parser.parse_args()
    import mlx.core as mx

    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer)
    model = load_r28m1_seed(args.seed)
    prompts = [
        ("simple_chinese", [{"role": "user", "content": "今天有点累。"}]),
        ("ordinary_greeting", [{"role": "user", "content": "你好。"}]),
        ("follow_up", [{"role": "user", "content": "给我两个简单选项。"}, {"role": "assistant", "content": "可以。"}, {"role": "user", "content": "第二个。"}]),
        ("correction", [{"role": "user", "content": "帮我约下午。"}, {"role": "assistant", "content": "下午三点可以。"}, {"role": "user", "content": "不是下午，改成明天早上。"}]),
        ("referent", [{"role": "user", "content": "我有两个方案，一个省钱，一个省时间。"}, {"role": "user", "content": "第二个怎么样？"}]),
        ("constraints", [{"role": "user", "content": "帮我排一个短计划，要安静、便宜，而且两小时内完成。"}]),
        ("rewrite", [{"role": "user", "content": "把这句话改短：我今天可能没有办法按时到。"}]),
    ]
    generation_rows = []
    for name, messages in prompts:
        wrapper = wrapper_for_messages(messages)
        ids = tokenizer.encode(wrapper, max_tokens=CONTEXT_LENGTH, add_bos=True)
        started = perf_counter()
        trace = greedy_full_and_cached(model, ids, max_new_tokens=12, eos=tokenizer.eos, stop_on_eos=False)
        elapsed = perf_counter() - started
        generation_rows.append({
            "id": name,
            "messages": messages,
            "wrapper": wrapper,
            "input_ids": ids,
            "generated_ids": trace.generated_ids,
            "raw_output": tokenizer.decode(trace.generated_ids),
            "full_vs_cached_max_abs_error": max(trace.logit_max_abs_errors, default=0.0),
            "prefill_final_logits_max_abs_error": trace.prefill_max_abs_error,
            "greedy_ids_match": trace.generated_ids == trace.selected_ids,
            "cache_length": trace.final_cache_length,
            "elapsed_seconds": elapsed,
        })
    tiny = tiny_causal_fixture()
    reset_error = cache_reset_error(model, [tokenizer.bos, 12, 24])
    future_error = no_future_leak_error(model, [tokenizer.bos, 4], [7, 9])
    isolation_error = session_isolation_error(model, [tokenizer.bos, 10, 11], [tokenizer.bos, 41, 42])
    _, full_cache = model.prefill(mx.array([[tokenizer.bos, 12, 24]], dtype=mx.int32))
    overflow_rejected = False
    try:
        model(mx.zeros((1, CONTEXT_LENGTH + 1), dtype=mx.int32), cache=None)
    except ValueError as exc:
        overflow_rejected = str(exc) == "context_overflow"
    full_report = {
        "campaign_id": "r29b2m_m1_mlx_daily_dialogue_v1",
        "created_at": now(),
        "seed_sha256": sha256_file(args.seed),
        "tokenizer_sha256": sha256_file(args.tokenizer),
        "wrapper_version": WRAPPER_VERSION,
        "mode": "model.eval; no fallback; no answer bank; no retrieval substitution",
        "device": str(mx.default_device()),
        "context_length": CONTEXT_LENGTH,
        "all_layers_executed": len(full_cache.layers) == 7 and all(item is not None for item in full_cache.layers),
        "generation_rows": generation_rows,
        "peak_rss_bytes": rss_bytes(),
    }
    kv_report = {
        "campaign_id": full_report["campaign_id"],
        "created_at": now(),
        "tiny_fixture": tiny,
        "actual_model_prompt_count": len(generation_rows),
        "prefill_final_logits_max_abs_error": max(row["prefill_final_logits_max_abs_error"] for row in generation_rows),
        "incremental_max_abs_error": max(row["full_vs_cached_max_abs_error"] for row in generation_rows),
        "incremental_tolerance": 1e-4,
        "greedy_sequences_match": all(row["greedy_ids_match"] for row in generation_rows),
        "all_layer_caches_advance": all(row["cache_length"] == len(row["input_ids"]) + len(row["generated_ids"]) for row in generation_rows),
        "cache_reset_max_abs_error": reset_error,
        "no_future_leak_max_abs_error": future_error,
        "session_isolation_max_abs_error": isolation_error,
        "context_overflow_rejected": overflow_rejected,
        "valid": tiny["future_blocked"] and max(row["prefill_final_logits_max_abs_error"] for row in generation_rows) <= 1e-5 and max(row["full_vs_cached_max_abs_error"] for row in generation_rows) <= 1e-4 and all(row["greedy_ids_match"] for row in generation_rows) and reset_error <= 1e-5 and future_error <= 1e-5 and isolation_error <= 1e-5 and overflow_rejected,
    }
    atomic_json(args.artifact_root / "reports" / "mlx_full_context.json", full_report)
    atomic_json(args.artifact_root / "reports" / "mlx_kv_parity.json", kv_report)
    print(json.dumps({"valid": kv_report["valid"], "incremental_max_abs_error": kv_report["incremental_max_abs_error"]}, sort_keys=True), flush=True)
    return 0 if kv_report["valid"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
