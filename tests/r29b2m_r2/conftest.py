from __future__ import annotations

from copy import deepcopy


def scenario_dict(family_kind: str = "correction") -> dict:
    return {
        "scenario_id": "correction_time_001",
        "family_id": "time_correction",
        "family_kind": family_kind,
        "capability": "time_correction",
        "dialogue_act": "acknowledge_and_apply_correction",
        "messages": [
            {"role": "user", "content": "帮我排在下午。"},
            {"role": "assistant", "content": "可以，放在下午。"},
            {"role": "user", "content": "不是下午，改成明天早上。"},
        ],
        "world_facts": {"old_time": "下午", "new_time": "明天早上"},
        "user_request": "改成明天早上",
        "active_referent": None,
        "alternative_referents": [],
        "active_constraints": [],
        "removed_constraints": [],
        "correction_before": "下午",
        "correction_after": "明天早上",
        "source_text": None,
        "requested_transformation": None,
        "source_fact_ids": [],
        "requested_addition_fact_ids": [],
        "target_fact_ids": ["new_time"],
        "forbidden_fact_ids": [],
        "must_include_values": ["明天早上"],
        "must_exclude_values": [],
        "maximum_answer_characters": 32,
        "tone_contract": "short_natural_no_policy_language",
        "canonical_targets": ["明白，改到明天早上。", "好，时间改成明天早上。", "收到，改为明天早上。"],
        "prompt_variants": [
            {"prompt_variant_id": f"prompt_v{index:02d}", "messages": [], "operator_ids": ["whole_prompt_authored"]}
            for index in range(1, 4)
        ],
        "provenance": "project_authored_r29b2m_r2",
        "review_status": "pass",
        "split_group": "correction_time_001",
        "split": "train",
        "missing_field": None,
    }


def clone(value: dict) -> dict:
    return deepcopy(value)
