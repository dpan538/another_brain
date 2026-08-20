#!/usr/bin/env python3
"""Deterministically validate the ignored R29B2M-R1 SFT dataset."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_daily_eval import frozen_sessions  # noqa: E402
from src.training.mlx.r29b2m_q4_source import sha256_file  # noqa: E402
from src.training.mlx.r29b2m_r1_campaign import CAMPAIGN_ID, atomic_json, utc_now  # noqa: E402
from src.training.mlx.r29b2m_r1_dataset import encode_assistant_response_only  # noqa: E402
from src.training.mlx.r29b2m_r1_dataset_seeds import SEEDS  # noqa: E402
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer, WRAPPER_VERSION  # noqa: E402


PRIVATE_VALUE = re.compile(r"(?:/Users/|/Volumes/|\b\d{15,19}\b|\b1[3-9]\d{9}\b|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")
ABSOLUTE_PATH = re.compile(r"(?:/Users/|/private/|/Volumes/|[A-Za-z]:\\\\)")
NORMALIZE_RE = re.compile(r"[\s，。！？、,.!?；;：:'\"“”‘’（）()\-]")
REQUIRED_FIELDS = {
    "session_id", "scenario_seed_id", "family_id", "messages", "target", "capabilities",
    "question_type", "referent", "operation", "answer_policy", "expected_behaviors",
    "forbidden_behaviors", "failure_modes", "provenance", "license", "review_status",
    "split_group", "split", "template_skeleton_id", "variation_index", "token_counts",
}


def normalize(text: str) -> str:
    return NORMALIZE_RE.sub("", str(text)).lower()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def near_duplicate(left: str, right: str) -> float:
    left_n, right_n = normalize(left), normalize(right)
    if left_n == right_n:
        return 1.0
    if min(len(left_n), len(right_n)) < 8:
        return 0.0
    matcher = SequenceMatcher(None, left_n, right_n, autojunk=False)
    if matcher.quick_ratio() < 0.88:
        return 0.0
    return matcher.ratio()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path, required=True)
    args = parser.parse_args()
    dataset_dir = args.artifact_root.resolve() / "dataset"
    sessions_path = dataset_dir / "sessions.jsonl"
    manifest_path = dataset_dir / "dataset_manifest.json"
    sessions = read_jsonl(sessions_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer)

    schema_errors = []
    role_errors = []
    mask_errors = []
    context_errors = []
    target_length_errors = []
    privacy_errors = []
    provenance_errors = []
    ids = Counter()
    normalized_sessions = Counter()
    normalized_session_splits: dict[str, set[str]] = defaultdict(set)
    normalized_targets = Counter()
    openings = Counter()
    target_ten_grams = Counter()
    target_endings = Counter()
    skeletons = Counter()
    split_by_seed: dict[str, set[str]] = defaultdict(set)
    split_by_group: dict[str, set[str]] = defaultdict(set)
    recomputed_target_tokens = 0
    target_le_64 = 0

    for index, row in enumerate(sessions):
        missing = REQUIRED_FIELDS - set(row)
        if missing:
            schema_errors.append({"index": index, "missing": sorted(missing)})
            continue
        ids[row["session_id"]] += 1
        messages = row["messages"]
        if not isinstance(messages, list) or not messages or len(messages) > 5:
            role_errors.append({"session_id": row["session_id"], "reason": "message_count"})
            continue
        if any(message.get("role") != ("user" if turn % 2 == 0 else "assistant") or not str(message.get("content", "")).strip() for turn, message in enumerate(messages)) or messages[-1].get("role") != "user":
            role_errors.append({"session_id": row["session_id"], "reason": "role_alternation"})
        try:
            encoded = encode_assistant_response_only(tokenizer, row)
        except ValueError as error:
            context_errors.append({"session_id": row["session_id"], "reason": str(error)})
            continue
        if encoded.token_ids[-1] != tokenizer.eos or encoded.loss_mask[-1] != 1:
            mask_errors.append({"session_id": row["session_id"], "reason": "eos_not_supervised"})
        first_supervised = next((position for position, value in enumerate(encoded.loss_mask) if value), len(encoded.loss_mask))
        if first_supervised != encoded.prompt_token_count - 1 or any(encoded.loss_mask[:first_supervised]) or sum(encoded.loss_mask) != encoded.assistant_target_token_count:
            mask_errors.append({"session_id": row["session_id"], "reason": "non_assistant_mask"})
        if row["token_counts"] != {"sequence": len(encoded.token_ids), "prompt": encoded.prompt_token_count, "assistant_target_including_eos": encoded.assistant_target_token_count}:
            mask_errors.append({"session_id": row["session_id"], "reason": "stored_token_count_mismatch"})
        recomputed_target_tokens += encoded.assistant_target_token_count
        target_le_64 += int(encoded.assistant_target_token_count <= 64)
        if len(row["target"]) > 96 or encoded.assistant_target_token_count > 96:
            target_length_errors.append({"session_id": row["session_id"], "characters": len(row["target"]), "tokens": encoded.assistant_target_token_count})
        combined = json.dumps({"messages": messages, "target": row["target"]}, ensure_ascii=False)
        if PRIVATE_VALUE.search(combined) or ABSOLUTE_PATH.search(combined):
            privacy_errors.append(row["session_id"])
        if row["provenance"] != "project_authored_r29b2m_r1_generator" or row["license"] != "project_authored" or not row["review_status"]:
            provenance_errors.append(row["session_id"])
        normalized_session = normalize(combined)
        normalized_target = normalize(row["target"])
        normalized_sessions[normalized_session] += 1
        normalized_session_splits[normalized_session].add(row["split"])
        normalized_targets[normalized_target] += 1
        openings[normalized_target[:6]] += 1
        target_endings[normalized_target[-10:]] += 1
        target_ten_grams.update(set(normalized_target[offset:offset + 10] for offset in range(max(0, len(normalized_target) - 9))))
        skeletons[row["template_skeleton_id"]] += 1
        split_by_seed[row["scenario_seed_id"]].add(row["split"])
        split_by_group[row["split_group"]].add(row["split"])

    eval_rows = read_jsonl(ROOT / "evals" / "r29b2m_daily_dialogue_v2" / "sessions.jsonl")
    eval_prompts = [(row["session_id"], message["content"]) for row in eval_rows for message in row["messages"] if message["role"] == "user"]
    structural_prompts = [(row["session_id"], message["content"]) for row in frozen_sessions() for message in row["messages"] if message["role"] == "user"]
    contamination = []
    for row in sessions:
        for turn_index, message in enumerate(row["messages"]):
            if message["role"] != "user":
                continue
            prompt = str(message["content"])
            for source, references in (("eval_v2", eval_prompts), ("dev_structural_v1", structural_prompts)):
                for reference_id, reference in references:
                    similarity = near_duplicate(prompt, reference)
                    if similarity >= 0.88:
                        contamination.append({"session_id": row["session_id"], "turn_index": turn_index, "source": source, "reference_id": reference_id, "similarity": round(similarity, 4), "dataset_text": prompt, "reference_text": reference})
                        break
                if contamination and contamination[-1]["session_id"] == row["session_id"] and contamination[-1]["turn_index"] == turn_index:
                    break

    duplicate_ids = [value for value, count in ids.items() if count > 1]
    exact_duplicates = sum(count - 1 for count in normalized_sessions.values() if count > 1)
    cross_split_normalized = sum(1 for splits in normalized_session_splits.values() if len(splits) > 1)
    repeated_targets = {target: count for target, count in normalized_targets.items() if count > 3}
    cross_split_seeds = {seed: sorted(splits) for seed, splits in split_by_seed.items() if len(splits) > 1}
    cross_split_groups = {group: sorted(splits) for group, splits in split_by_group.items() if len(splits) > 1}
    max_opening, max_opening_count = max(openings.items(), key=lambda item: item[1])
    max_ten_gram, max_ten_gram_count = max(target_ten_grams.items(), key=lambda item: item[1])
    max_ending, max_ending_count = max(target_endings.items(), key=lambda item: item[1])
    max_skeleton, max_skeleton_count = max(skeletons.items(), key=lambda item: item[1])
    opening_share = max_opening_count / max(1, len(sessions))
    ten_gram_share = max_ten_gram_count / max(1, len(sessions))
    ending_share = max_ending_count / max(1, len(sessions))
    skeleton_share = max_skeleton_count / max(1, len(sessions))
    target_le_64_rate = target_le_64 / max(1, len(sessions))
    unique_target_token_positions = sum(
        row["token_counts"]["assistant_target_including_eos"]
        for row in sessions
        if normalized_targets[normalize(row["target"])] == 1
    )

    split_report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": exact_duplicates == 0 and cross_split_normalized == 0 and not cross_split_seeds and not cross_split_groups,
        "exact_duplicate_sessions": exact_duplicates,
        "cross_split_same_normalized_session": cross_split_normalized,
        "cross_split_same_scenario_seed_id": len(cross_split_seeds),
        "cross_split_same_split_group": len(cross_split_groups),
        "cross_split_seed_failures": cross_split_seeds,
        "cross_split_group_failures": cross_split_groups,
        "split_counts": dict(Counter(row["split"] for row in sessions)),
    }
    contamination_report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": not contamination,
        "near_duplicate_threshold": 0.88,
        "eval_v2_near_duplicates": sum(item["source"] == "eval_v2" for item in contamination),
        "dev_structural_v1_near_duplicates": sum(item["source"] == "dev_structural_v1" for item in contamination),
        "failures": contamination[:200],
    }
    template_report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": not repeated_targets and opening_share <= 0.015 and skeleton_share <= 0.01 and ten_gram_share <= 0.03 and ending_share <= 0.03,
        "unique_normalized_targets": len(normalized_targets),
        "normalized_exact_target_occurrence_max": max(normalized_targets.values()),
        "targets_occurring_more_than_three_times": len(repeated_targets),
        "maximum_six_character_opening": max_opening,
        "maximum_six_character_opening_count": max_opening_count,
        "maximum_six_character_opening_share": opening_share,
        "maximum_target_ten_gram": max_ten_gram,
        "maximum_target_ten_gram_count": max_ten_gram_count,
        "maximum_target_ten_gram_share": ten_gram_share,
        "maximum_ten_gram_share_limit": 0.03,
        "maximum_ten_character_ending": max_ending,
        "maximum_ten_character_ending_count": max_ending_count,
        "maximum_ten_character_ending_share": ending_share,
        "maximum_ending_share_limit": 0.03,
        "maximum_declared_template_skeleton": max_skeleton,
        "maximum_declared_template_skeleton_count": max_skeleton_count,
        "maximum_declared_template_skeleton_share": skeleton_share,
        "opening_limit": 0.015,
        "template_skeleton_limit": 0.01,
        "answer_style_distinct_normalized_target_rate": len(normalized_targets) / max(1, len(sessions)),
    }
    mask_report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": not mask_errors and not context_errors,
        "objective": "ASSISTANT_RESPONSE_ONLY",
        "rows_checked": len(sessions),
        "assistant_only_mask_errors": len(mask_errors),
        "context_errors": len(context_errors),
        "eos_supervised_for_all_rows": not mask_errors,
        "prompt_user_system_history_masked": not mask_errors,
        "failures": (mask_errors + context_errors)[:200],
    }
    validation = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": False,
        "session_count": len(sessions),
        "semantic_seed_count": len(SEEDS),
        "schema_errors": len(schema_errors),
        "role_errors": len(role_errors),
        "duplicate_session_ids": len(duplicate_ids),
        "target_length_errors": len(target_length_errors),
        "private_data_or_absolute_path_errors": len(privacy_errors),
        "unknown_provenance_or_review_status": len(provenance_errors),
        "assistant_target_tokens_total": recomputed_target_tokens,
        "assistant_target_tokens_from_unique_normalized_targets": unique_target_token_positions,
        "target_answer_at_most_64_tokens_rate": target_le_64_rate,
        "target_answer_normally_at_most_64_tokens_min_rate": 0.70,
        "maximum_sequence_tokens": max(row["token_counts"]["sequence"] for row in sessions),
        "maximum_target_characters": max(len(row["target"]) for row in sessions),
        "tokenizer_sha256": sha256_file(args.tokenizer),
        "wrapper_version": WRAPPER_VERSION,
        "sessions_sha256": sha256_file(sessions_path),
        "manifest_sha256_matches": manifest.get("sessions_sha256") == sha256_file(sessions_path),
        "reports": {
            "split_integrity": split_report["valid"],
            "eval_contamination": contamination_report["valid"],
            "template_concentration": template_report["valid"],
            "assistant_mask_audit": mask_report["valid"],
        },
        "failures": {
            "schema": schema_errors[:50],
            "roles": role_errors[:50],
            "target_length": target_length_errors[:50],
            "privacy": privacy_errors[:50],
            "provenance": provenance_errors[:50],
        },
    }
    validation["valid"] = (
        len(sessions) >= 4_000
        and len(sessions) <= 6_000
        and len(SEEDS) >= 250
        and not schema_errors
        and not role_errors
        and not duplicate_ids
        and not target_length_errors
        and not privacy_errors
        and not provenance_errors
        and recomputed_target_tokens >= 350_000
        and unique_target_token_positions >= 350_000
        and target_le_64_rate >= 0.70
        and validation["maximum_sequence_tokens"] <= 256
        and validation["manifest_sha256_matches"]
        and all(validation["reports"].values())
    )
    atomic_json(dataset_dir / "split_integrity.json", split_report)
    atomic_json(dataset_dir / "eval_contamination.json", contamination_report)
    atomic_json(dataset_dir / "template_concentration.json", template_report)
    atomic_json(dataset_dir / "assistant_mask_audit.json", mask_report)
    atomic_json(dataset_dir / "dataset_validation.json", validation)
    print(json.dumps({"valid": validation["valid"], "sessions": len(sessions), "target_tokens": recomputed_target_tokens, "unique_target_tokens": unique_target_token_positions, "contamination": len(contamination), "mask_errors": len(mask_errors), "target_le_64_rate": target_le_64_rate}, sort_keys=True))
    return 0 if validation["valid"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
