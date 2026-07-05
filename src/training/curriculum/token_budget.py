from collections import Counter


DEFAULT_TARGET_MIX = {
    "public_chinese_pretraining": 0.35,
    "secondary_english_mixed": 0.20,
    "instruction_distillation": 0.10,
    "rag_evidence_grounded": 0.15,
    "reasoning_symbolic": 0.10,
    "value_aesthetic": 0.07,
    "user_answered_anchor": 0.03,
}


BLOCKED_INSTRUCTION_REDISTRIBUTED_MIX = {
    "public_chinese_pretraining": 0.39,
    "secondary_english_mixed": 0.20,
    "instruction_distillation": 0.0,
    "rag_evidence_grounded": 0.18,
    "reasoning_symbolic": 0.10,
    "value_aesthetic": 0.10,
    "user_answered_anchor": 0.03,
}


def estimate_tokens(text):
    text = str(text or "")
    zh = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    other = max(0, len(text) - zh)
    return max(1, zh + (other + 3) // 4)


def record_tokens(record):
    return int(record.get("token_count") or estimate_tokens(record.get("text") or record.get("target") or record.get("final_answer") or ""))


def available_tokens_by_curriculum(records):
    counts = Counter()
    for record in records:
        counts[record.get("curriculum") or "unknown"] += record_tokens(record)
    return dict(counts)


def target_mix_for_availability(available):
    mix = dict(DEFAULT_TARGET_MIX)
    if int(available.get("instruction_distillation", 0)) <= 0:
        mix = dict(BLOCKED_INSTRUCTION_REDISTRIBUTED_MIX)
    total = sum(v for k, v in mix.items() if available.get(k, 0) > 0)
    if total <= 0:
        return mix
    return {k: (v / total if available.get(k, 0) > 0 else 0.0) for k, v in mix.items()}


def prefix_token_mix(records, token_limit):
    seen = Counter()
    total = 0
    for record in records:
        if total >= token_limit:
            break
        tokens = min(record_tokens(record), token_limit - total)
        seen[record.get("curriculum") or "unknown"] += tokens
        total += tokens
    return {"total_tokens": total, "tokens_by_curriculum": dict(seen)}
