from collections import Counter


DEFAULT_TARGET_MIX = {
    "public_chinese_pretraining": 0.35,
    "secondary_english_mixed": 0.12,
    "reasoning_symbolic": 0.13,
    "rag_evidence_grounded": 0.08,
    "value_aesthetic": 0.04,
    "user_answered_anchor": 0.03,
    "sft_public_instruction": 0.10,
    "sft_rag_evidence": 0.06,
    "sft_value_aesthetic": 0.03,
    "sft_answer_as_user": 0.02,
    "sft_refusal_boundary": 0.04,
    "sft_distillation_candidate": 0.0,
}


BLOCKED_INSTRUCTION_REDISTRIBUTED_MIX = {
    "public_chinese_pretraining": 0.39,
    "secondary_english_mixed": 0.14,
    "reasoning_symbolic": 0.14,
    "rag_evidence_grounded": 0.10,
    "value_aesthetic": 0.06,
    "user_answered_anchor": 0.04,
    "sft_public_instruction": 0.0,
    "sft_rag_evidence": 0.06,
    "sft_value_aesthetic": 0.03,
    "sft_answer_as_user": 0.0,
    "sft_refusal_boundary": 0.04,
    "sft_distillation_candidate": 0.0,
}


SFT_STAGE_TARGET_MIX = {
    "sft_public_instruction": 0.25,
    "sft_rag_evidence": 0.25,
    "sft_value_aesthetic": 0.15,
    "sft_answer_as_user": 0.10,
    "sft_refusal_boundary": 0.10,
    "reasoning_symbolic": 0.10,
    "sft_distillation_candidate": 0.05,
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
    if int(available.get("sft_public_instruction", 0)) <= 0:
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
