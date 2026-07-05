import hashlib
import random
from collections import defaultdict

from src.training.curriculum.token_budget import record_tokens, target_mix_for_availability, available_tokens_by_curriculum


def normalized_text(record):
    text = record.get("text") or record.get("target") or record.get("final_answer") or ""
    return " ".join(str(text).lower().split())


def stable_id(record):
    if record.get("record_id"):
        return str(record["record_id"])
    return hashlib.sha256(normalized_text(record).encode("utf-8")).hexdigest()[:16]


def assert_training_safe(record):
    text = str(record.get("text") or record.get("prompt") or record.get("target") or record.get("final_answer") or "")
    lowered = text.lower()
    if "evals/" in lowered or "eval prompt" in lowered:
        raise ValueError("eval_prompt_in_training_stream")
    if "another_brain_question_pack_001" in lowered and any(f" {i}" in f" {lowered} " for i in range(51, 101)):
        raise ValueError("old_excluded_question_pack_row_in_training_stream")


def interleave_records(records, target_total_tokens, seed=2704, target_mix=None):
    for record in records:
        assert_training_safe(record)
    buckets = defaultdict(list)
    for record in records:
        buckets[record.get("curriculum") or "unknown"].append(record)
    rng = random.Random(seed)
    for name, bucket in buckets.items():
        bucket.sort(key=stable_id)
        rng.shuffle(bucket)
    available = available_tokens_by_curriculum(records)
    mix = target_mix or target_mix_for_availability(available)
    emitted = []
    emitted_norms = set()
    consumed = defaultdict(int)
    indices = defaultdict(int)
    total = 0
    active = {k for k, v in available.items() if v > 0 and float(mix.get(k, 0.0)) > 0.0}
    while total < target_total_tokens and active:
        priorities = []
        for curr in sorted(active):
            weight = max(float(mix.get(curr, 0.0)), 1e-9)
            priorities.append((consumed[curr] / weight, curr))
        priorities.sort()
        progressed = False
        for _, curr in priorities:
            bucket = buckets[curr]
            while indices[curr] < len(bucket):
                record = dict(bucket[indices[curr]])
                indices[curr] += 1
                norm = normalized_text(record)
                if not norm or norm in emitted_norms:
                    continue
                tokens = record_tokens(record)
                record["token_count"] = tokens
                emitted.append(record)
                emitted_norms.add(norm)
                consumed[curr] += tokens
                total += tokens
                progressed = True
                break
            if indices[curr] >= len(bucket):
                active.discard(curr)
            if progressed:
                break
        if not progressed:
            break
    return emitted, {
        "target_total_tokens": int(target_total_tokens),
        "emitted_tokens": int(total),
        "tokens_by_curriculum": dict(consumed),
        "target_mix": mix,
        "available_tokens_by_curriculum": available,
        "seed": seed,
    }


def assert_prefix_coverage(records, token_limit, min_curricula=2):
    total = 0
    seen = set()
    for record in records:
        if total >= token_limit:
            break
        seen.add(record.get("curriculum"))
        total += record_tokens(record)
    if total > 0 and len(seen) < min_curricula:
        raise AssertionError("curriculum_starvation_in_prefix")
    return seen
