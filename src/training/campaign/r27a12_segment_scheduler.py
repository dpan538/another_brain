from __future__ import annotations

from typing import Any


STAGE_MIXES = {
    "chinese_general": {
        "public_chinese_pretraining": 45,
        "secondary_english_mixed": 10,
        "reasoning_symbolic": 15,
        "rag_evidence_grounded": 10,
        "value_aesthetic": 5,
        "sft_public_instruction": 10,
        "user_answered_anchor": 5,
    },
    "dialogue_rag": {
        "sft_rag_evidence": 25,
        "sft_answer_as_user": 20,
        "sft_value_aesthetic": 20,
        "sft_refusal_boundary": 15,
        "sft_public_instruction": 10,
        "reasoning_symbolic": 10,
    },
    "consolidation": {
        "public_chinese_pretraining": 25,
        "sft_public_instruction": 20,
        "sft_rag_evidence": 20,
        "sft_value_aesthetic": 15,
        "sft_answer_as_user": 10,
        "reasoning_symbolic": 10,
    },
}


def r27a12_schedule(max_segments: int = 10) -> list[dict[str, Any]]:
    order = ["chinese_general", "dialogue_rag", "consolidation"]
    rows = []
    for index in range(int(max_segments)):
        stage = order[index % len(order)]
        rows.append({"segment_index": index + 1, "stage_id": stage, "stage_mix": STAGE_MIXES[stage]})
    return rows
