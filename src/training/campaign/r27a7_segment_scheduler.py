STAGES = [
    {"stage_id": "scale_warmup", "stream": "continued_pretraining_stream.jsonl", "tokens": 2_000_000, "steps": 800, "learning_rate": 0.00012},
    {"stage_id": "continued_pretraining", "stream": "continued_pretraining_stream.jsonl", "tokens": 8_000_000, "steps": 2200, "learning_rate": 0.00010},
    {"stage_id": "dialogue_sft", "stream": "sft_dialogue_stream.jsonl", "tokens": 8_000_000, "steps": 2200, "learning_rate": 0.00008},
    {"stage_id": "rag_value_anchor_replay", "stream": "rag_value_anchor_replay_stream.jsonl", "tokens": 4_000_000, "steps": 1200, "learning_rate": 0.00006},
    {"stage_id": "consolidation", "stream": "consolidation_stream.jsonl", "tokens": 4_000_000, "steps": 1200, "learning_rate": 0.00005},
]


def schedule_for_caps(max_segments, max_total_steps, max_total_tokens):
    out = []
    steps = 0
    tokens = 0
    for stage in STAGES[: int(max_segments)]:
        seg = dict(stage)
        seg["steps"] = min(seg["steps"], max(0, int(max_total_steps) - steps))
        seg["tokens"] = min(seg["tokens"], max(0, int(max_total_tokens) - tokens))
        if seg["steps"] <= 0 or seg["tokens"] <= 0:
            break
        out.append(seg)
        steps += seg["steps"]
        tokens += seg["tokens"]
    return out
