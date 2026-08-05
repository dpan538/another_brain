#!/usr/bin/env python3
"""Isolated CPU worker for R29B1R checkpoint, FP32 and KV-cache evidence."""
from __future__ import annotations

import argparse
import json
import os
import resource
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT))

from src.training.reference.r29b1r_campaign import atomic_json, utc_now
from src.training.reference.r29b1r_reference import (
    CachedActualGPT,
    ExactRuntimeTokenizer,
    build_actual_model,
    greedy_generate,
    model_config_from_payload,
    sha256,
    state_dict_from_payload,
    tensor_inventory,
    wrapper_for_user,
)
from src.training.reference.r29b1r_q4 import export_group_q4, load_current_q4, unpack_group_q4, validate_manifest


def emit(stage: str, **detail: Any) -> None:
    print(json.dumps({"event": "marker", "stage": stage, **detail}, ensure_ascii=False, sort_keys=True), flush=True)


def peak_rss() -> int:
    return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024


def load_payload(torch: Any, checkpoint: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    unsafe: Any = "api_unavailable"
    getter = getattr(torch.serialization, "get_unsafe_globals_in_checkpoint", None)
    if getter is not None:
        try:
            unsafe = getter(str(checkpoint))
        except Exception as error:  # preserve, never bypass through unsafe pickle
            unsafe = {"error": repr(error)}
    os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"
    started = time.monotonic()
    try:
        payload = torch.load(str(checkpoint), map_location="cpu", weights_only=True, mmap=True)
        mmap_used = True
    except TypeError:
        payload = torch.load(str(checkpoint), map_location="cpu", weights_only=True)
        mmap_used = False
    metadata = {"unsafe_globals": unsafe, "mmap_used": mmap_used, "elapsed_seconds": round(time.monotonic() - started, 3)}
    if not isinstance(payload, dict):
        raise ValueError("checkpoint_payload_not_mapping")
    return payload, metadata


def safe_load(torch: Any, checkpoint: Path) -> dict[str, Any]:
    emit("before_safe_load")
    payload, loader = load_payload(torch, checkpoint)
    state = state_dict_from_payload(payload)
    config = model_config_from_payload(payload)
    inventory = tensor_inventory(torch, state)
    model = build_actual_model(torch, config)
    missing, unexpected = model.load_state_dict(state, strict=False)
    report = {
        "checkpoint": str(checkpoint),
        "checkpoint_sha256": sha256(checkpoint),
        "checkpoint_bytes": checkpoint.stat().st_size,
        "top_level_keys": sorted(payload),
        "config": config,
        "loader": loader,
        "inventory": inventory,
        "missing_keys": list(missing),
        "unexpected_keys": list(unexpected),
        "parameter_count": sum(parameter.numel() for parameter in model.parameters()),
        "architecture_matches_expected": config == {"context_length": 256, "n_layer": 7, "n_head": 14, "n_embd": 896, "vocab_size": 16000},
        "strict_state_match": not missing and not unexpected,
        "peak_rss_bytes": peak_rss(),
    }
    emit("after_safe_load", parameter_count=report["parameter_count"], strict_state_match=report["strict_state_match"])
    return report


def load_model(torch: Any, checkpoint: Path) -> tuple[Any, dict[str, int], dict[str, Any]]:
    payload, _ = load_payload(torch, checkpoint)
    config = model_config_from_payload(payload)
    model = build_actual_model(torch, config)
    model.load_state_dict(state_dict_from_payload(payload), strict=True)
    model.eval()
    return model, config, payload


def fp32_reference(torch: Any, checkpoint: Path, tokenizer_path: Path) -> dict[str, Any]:
    emit("before_fp32_reference")
    model, config, _ = load_model(torch, checkpoint)
    tokenizer = ExactRuntimeTokenizer.from_file(tokenizer_path)
    prompts = [
        ("simple_chinese", "今天下雨，出门最好"),
        ("greeting", "你好"),
        ("one_turn", "怎么把一句话说得更短？"),
        ("follow_up", "我想周末去爬山。前提是别太累。那现在给我一个安排。"),
        ("correction", "给我三条建议。不是三条，我只要一条。"),
        ("referent", "我把蓝色杯子放在桌上，红色杯子放在柜子里。把它拿过来。"),
        ("constraints", "推荐一个晚饭：清淡、二十分钟内、不要辣、两个人吃。"),
        ("rewrite", "把这句话改得更礼貌：你快点回我。"),
        ("role_prefix", "用户：你好\n回答："),
        ("repetition", "请不要重复同一句话。"),
    ]
    rows = []
    for identifier, prompt in prompts:
        wrapper = wrapper_for_user(prompt)
        ids = tokenizer.encode(wrapper, max_tokens=config["context_length"])
        started = time.monotonic()
        sequence, generated = greedy_generate(torch, model, ids, eos=tokenizer.eos, context_length=config["context_length"], max_new_tokens=24)
        raw = tokenizer.decode(generated)
        rows.append(
            {
                "id": identifier,
                "input_text": prompt,
                "wrapper": wrapper,
                "input_token_ids": ids,
                "output_token_ids": generated,
                "raw_decoded_output": raw,
                "eos_observed": tokenizer.eos in generated,
                "context_tokens": len(sequence),
                "elapsed_seconds": round(time.monotonic() - started, 4),
                "mojibake_replacement_character": "�" in raw,
            }
        )
    overflow_ids = tokenizer.encode("甲" * 600, max_tokens=config["context_length"])
    report = {
        "checkpoint_sha256": sha256(checkpoint),
        "tokenizer_sha256": sha256(tokenizer_path),
        "model_eval": not model.training,
        "device": "cpu",
        "context_length": config["context_length"],
        "generations": rows,
        "context_overflow_input_tokens": len(overflow_ids),
        "peak_rss_bytes": peak_rss(),
    }
    emit("after_fp32_reference", generation_count=len(rows))
    return report


def kv_cache_parity(torch: Any, checkpoint: Path, tokenizer_path: Path) -> dict[str, Any]:
    emit("before_kv_cache_parity")
    model, config, payload = load_model(torch, checkpoint)
    tokenizer = ExactRuntimeTokenizer.from_file(tokenizer_path)
    state = state_dict_from_payload(payload)
    token_ids = tokenizer.encode(wrapper_for_user("你好，请用一句话回答。"), max_tokens=32)
    cache = CachedActualGPT(torch, state, config)
    rows = []
    with torch.inference_mode():
        for position, token_id in enumerate(token_ids):
            cached = cache.append(token_id)
            full, _ = model(torch.tensor([token_ids[: position + 1]], dtype=torch.long))
            reference = full[:, -1, :]
            error = float((cached - reference).abs().max().item())
            rows.append({"position": position, "max_abs_error": error, "cache_length": cache.length, "greedy_match": int(cached.argmax().item()) == int(reference.argmax().item())})
    generated_cache = CachedActualGPT(torch, state, config)
    cached_logits = generated_cache.prefill(token_ids)
    cache_tokens = []
    full_tokens = []
    sequence = list(token_ids)
    for _ in range(12):
        cache_token = int(cached_logits.argmax().item())
        cache_tokens.append(cache_token)
        cached_logits = generated_cache.append(cache_token)
        full, _ = model(torch.tensor([sequence], dtype=torch.long))
        full_token = int(full[0, -1].argmax().item())
        full_tokens.append(full_token)
        sequence.append(full_token)
        if full_token == tokenizer.eos:
            break
    reset = CachedActualGPT(torch, state, config)
    first = reset.prefill(token_ids)
    reset.reset()
    second = reset.prefill(token_ids)
    overflow = CachedActualGPT(torch, state, config)
    for index in range(config["context_length"]):
        overflow.append(token_ids[index % len(token_ids)])
    try:
        overflow.append(token_ids[0])
        overflow_rejected = False
    except ValueError as error:
        overflow_rejected = str(error) == "context_overflow"
    session_a = CachedActualGPT(torch, state, config)
    session_b = CachedActualGPT(torch, state, config)
    a = session_a.prefill(token_ids[:4])
    b = session_b.prefill(token_ids[:4])
    report = {
        "token_ids": token_ids,
        "per_step": rows,
        "prefill_max_abs_error": max(row["max_abs_error"] for row in rows),
        "incremental_max_abs_error": max(row["max_abs_error"] for row in rows[1:]) if len(rows) > 1 else 0.0,
        "all_greedy_match": all(row["greedy_match"] for row in rows),
        "generated_cache_tokens": cache_tokens,
        "generated_full_tokens": full_tokens,
        "generated_exact_match": cache_tokens == full_tokens,
        "cache_lengths": [int(item.shape[2]) for item in generated_cache.keys],
        "all_layers_advance": len(generated_cache.keys) == config["n_layer"] and all(item.shape[2] == generated_cache.length for item in generated_cache.keys),
        "reset_max_abs_error": float((first - second).abs().max().item()),
        "overflow_rejected": overflow_rejected,
        "session_isolation_max_abs_error": float((a - b).abs().max().item()),
        "checkpoint_sha256": sha256(checkpoint),
        "tokenizer_sha256": sha256(tokenizer_path),
    }
    emit("after_kv_cache_parity", all_greedy_match=report["all_greedy_match"], generated_exact_match=report["generated_exact_match"])
    return report


def _first_token_metrics(torch: Any, fp32: Any, quantized: Any) -> dict[str, Any]:
    fp = fp32[0, -1]
    q = quantized[0, -1]
    top_fp = torch.topk(fp, 5).indices.tolist()
    top_q = torch.topk(q, 5).indices.tolist()
    cosine = float(torch.nn.functional.cosine_similarity(fp.float(), q.float(), dim=0).item())
    return {"top1_match": int(top_fp[0] == top_q[0]), "top5_overlap": len(set(top_fp) & set(top_q)) / 5.0, "logit_cosine": cosine}


def current_q4_reference(torch: Any, checkpoint: Path, tokenizer_path: Path, asset_dir: Path) -> dict[str, Any]:
    emit("before_current_q4_reference")
    fp32_model, config, _ = load_model(torch, checkpoint)
    q4_state, q4_meta = load_current_q4(torch, asset_dir)
    q4_model = build_actual_model(torch, config)
    missing, unexpected = q4_model.load_state_dict(q4_state, strict=False)
    q4_model.eval()
    tokenizer = ExactRuntimeTokenizer.from_file(tokenizer_path)
    prompts = ["你好", "把这句改短：请你尽快回复我。", "我说的是蓝色杯子，不是红色杯子。"]
    rows = []
    with torch.inference_mode():
        for prompt in prompts:
            ids = tokenizer.encode(wrapper_for_user(prompt), max_tokens=config["context_length"])
            values = torch.tensor([ids], dtype=torch.long)
            fp_logits, _ = fp32_model(values)
            q4_logits, _ = q4_model(values)
            fp_seq, fp_out = greedy_generate(torch, fp32_model, ids, eos=tokenizer.eos, context_length=config["context_length"], max_new_tokens=12)
            q_seq, q_out = greedy_generate(torch, q4_model, ids, eos=tokenizer.eos, context_length=config["context_length"], max_new_tokens=12)
            rows.append({"prompt": prompt, "input_token_ids": ids, **_first_token_metrics(torch, fp_logits, q4_logits), "fp32_output_token_ids": fp_out, "q4_output_token_ids": q_out, "fp32_raw": tokenizer.decode(fp_out), "q4_raw": tokenizer.decode(q_out), "greedy_match": fp_out == q_out, "fp_context_tokens": len(fp_seq), "q4_context_tokens": len(q_seq)})
    report = {
        "current_q4_integrity": q4_meta,
        "missing_keys": list(missing),
        "unexpected_keys": list(unexpected),
        "strict_state_match": not missing and not unexpected,
        "rows": rows,
        "checkpoint_sha256": sha256(checkpoint),
        "tokenizer_sha256": sha256(tokenizer_path),
    }
    emit("after_current_q4_reference", strict_state_match=report["strict_state_match"])
    return report


def q4v2_experiment(torch: Any, checkpoint: Path, tokenizer_path: Path, output_root: Path) -> dict[str, Any]:
    emit("before_q4v2_experiment")
    fp32_model, config, payload = load_model(torch, checkpoint)
    state = state_dict_from_payload(payload)
    tokenizer = ExactRuntimeTokenizer.from_file(tokenizer_path)
    architecture_fingerprint = str(config)
    candidates = []
    for candidate_id, group_size in (("candidate_a_group64", 64), ("candidate_b_group32", 32)):
        directory = output_root / candidate_id
        manifest, _ = export_group_q4(torch, state, output_dir=directory, checkpoint_sha256=sha256(checkpoint), tokenizer_sha256=sha256(tokenizer_path), architecture_fingerprint=architecture_fingerprint, candidate_id=candidate_id, group_size=group_size)
        unpacked = unpack_group_q4(torch, directory / "manifest.json")
        model = build_actual_model(torch, config)
        missing, unexpected = model.load_state_dict(unpacked, strict=False)
        model.eval()
        metrics = []
        with torch.inference_mode():
            for prompt in ("你好", "请把这句话改短。", "周末不想太累，怎么安排？"):
                ids = tokenizer.encode(wrapper_for_user(prompt), max_tokens=config["context_length"])
                fp_logits, _ = fp32_model(torch.tensor([ids], dtype=torch.long))
                q_logits, _ = model(torch.tensor([ids], dtype=torch.long))
                metrics.append(_first_token_metrics(torch, fp_logits, q_logits))
        candidates.append({"candidate_id": candidate_id, "manifest": manifest, "manifest_validation": validate_manifest(directory / "manifest.json"), "missing_keys": list(missing), "unexpected_keys": list(unexpected), "metrics": metrics, "package_bytes": manifest["total_bytes"]})
    report = {"checkpoint_sha256": sha256(checkpoint), "tokenizer_sha256": sha256(tokenizer_path), "candidates": candidates}
    emit("after_q4v2_experiment", candidate_count=len(candidates))
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("safe-load", "fp32", "kv-cache", "current-q4", "q4v2"))
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path)
    parser.add_argument("--asset-dir", type=Path)
    parser.add_argument("--q4v2-root", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    import torch

    if args.action == "safe-load":
        result = safe_load(torch, args.checkpoint)
    elif args.action == "fp32":
        if not args.tokenizer:
            raise SystemExit("tokenizer_required")
        result = fp32_reference(torch, args.checkpoint, args.tokenizer)
    elif args.action == "kv-cache":
        if not args.tokenizer:
            raise SystemExit("tokenizer_required")
        result = kv_cache_parity(torch, args.checkpoint, args.tokenizer)
    elif args.action == "current-q4":
        if not args.tokenizer or not args.asset_dir:
            raise SystemExit("tokenizer_and_asset_dir_required")
        result = current_q4_reference(torch, args.checkpoint, args.tokenizer, args.asset_dir)
    else:
        if not args.tokenizer or not args.q4v2_root:
            raise SystemExit("tokenizer_and_q4v2_root_required")
        result = q4v2_experiment(torch, args.checkpoint, args.tokenizer, args.q4v2_root)
    result.update({"created_at_utc": utc_now(), "action": args.action, "training_started": False, "optimizer_tokens": 0, "assistant_target_tokens": 0})
    atomic_json(args.output, result)
    print(json.dumps({"event": "marker", "stage": "worker_complete", "action": args.action, "output": str(args.output)}, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
