STAGES = [
    {"stage_id": "continued_pretraining", "stream": "continued_pretraining_stream.jsonl", "tokens": 8000000, "steps": 3000, "learning_rate": 0.00018},
    {"stage_id": "sft_dialogue_alignment", "stream": "sft_dialogue_stream.jsonl", "tokens": 8000000, "steps": 3000, "learning_rate": 0.00012},
    {"stage_id": "rag_value_anchor_replay", "stream": "rag_value_anchor_replay_stream.jsonl", "tokens": 5000000, "steps": 2500, "learning_rate": 0.00010},
    {"stage_id": "consolidation", "stream": "consolidation_stream.jsonl", "tokens": 4000000, "steps": 1500, "learning_rate": 0.00008},
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
