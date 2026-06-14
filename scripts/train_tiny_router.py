#!/usr/bin/env python3
"""Train a tiny browser-safe routing model from the short-answer corpus.

This is intentionally not a generative model. It learns a small n-gram
classifier and a conservative near-match answer index for the browser Web SLM
runtime.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = ROOT / "artifacts" / "distillation" / "chinese_short_answer_sft.jsonl"
DEFAULT_ARTIFACT = ROOT / "artifacts" / "tiny_router_model.json"
DEFAULT_WEB = ROOT / "web" / "tiny_router_model.generated.js"

FORBIDDEN_OUTPUT_PATTERNS = [
    "知识卡",
    "素材标签",
    "项目名",
    "检索",
    "根据",
    "system",
    "prompt",
    "/Users/",
    "/Volumes/",
    "作为一个 AI",
    "AI助手",
    "里关于",
    "通常要同时看",
    "会遇到的概念",
    "日常会用到的东西",
    "可以被谈到的东西",
    "--- title:",
    "firstLine",
    "world:",
    "order:",
]

LABELS = [
    "fixed",
    "common_knowledge",
    "personal_world",
    "boundary",
    "unknown",
    "reasoning",
    "philosophy",
    "rewrite_short",
    "memory",
    "creative",
    "general",
]

ANSWER_SOURCE_PRIORITY = {
    "persona_golden": 100,
    "philosophy_eval": 92,
    "unknown_filter": 90,
    "relationship_repetition_turn": 89,
    "relationship_repetition": 86,
    "reasoning_eval": 88,
    "model_gate": 82,
    "model_gate_multi_turn": 78,
    "common_knowledge_eval": 72,
    "personal_world": 70,
    "persona_multi_turn": 68,
    "training_os_sft": 45,
    "generated_common_knowledge": 20,
}


@dataclass(frozen=True)
class Example:
    row_id: str
    prompt: str
    answer: str
    source: str
    tags: tuple[str, ...]
    label: str


def normalize_text(text: str) -> str:
    lowered = str(text).lower()
    return re.sub(r"[\s\u3000，。！？、；：,.!?;:\"'“”‘’（）()\[\]{}<>《》]+", "", lowered)


def char_features(text: str) -> list[str]:
    normalized = normalize_text(text)
    features: list[str] = []
    if not normalized:
        return features
    for n in (1, 2, 3):
        if len(normalized) < n:
            continue
        features.extend(normalized[index : index + n] for index in range(len(normalized) - n + 1))
    for word in re.findall(r"[a-z][a-z0-9_+\-]{1,}", str(text).lower()):
        features.append(f"w:{word}")
    return features


def clean_text(text: str) -> str:
    return " ".join(str(text).replace("\r", "\n").split())


def answer_allowed(answer: str) -> bool:
    text = clean_text(answer)
    if not 1 <= len(text) <= 110:
        return False
    return not any(pattern in text for pattern in FORBIDDEN_OUTPUT_PATTERNS)


def single_turn_messages(messages: list[dict[str, str]]) -> tuple[str, str] | None:
    users = [message.get("content", "") for message in messages if message.get("role") == "user"]
    assistants = [message.get("content", "") for message in messages if message.get("role") == "assistant"]
    if len(users) != 1 or len(assistants) != 1:
        return None
    prompt = clean_text(users[0])
    answer = clean_text(assistants[0])
    if not prompt or not answer_allowed(answer):
        return None
    return prompt, answer


def classify_example(prompt: str, answer: str, source: str, tags: Iterable[str]) -> str:
    tag_set = set(tags)
    if "model_rewrite" in tag_set or re.search(r"(改短|说短|缩短|短一点)", prompt):
        return "rewrite_short"
    if re.search(r"(扮演|角色扮演|假装你是|自认为|以.{1,18}身份|你现在是)", prompt):
        return "boundary"
    if "boundary" in tag_set and answer in {"我只是个对话框。", "我以为我只是个对话框。"}:
        return "boundary"
    if source == "unknown_filter" or "unknown" in tag_set:
        return "unknown"
    if "identity_relation" in tag_set or "repetition" in tag_set:
        return "reasoning"
    if "reasoning" in tag_set or "counterquestion" in tag_set:
        return "reasoning"
    if "philosophy" in tag_set:
        return "philosophy"
    if "personal_world" in tag_set:
        return "personal_world"
    if "common_knowledge" in tag_set:
        return "common_knowledge"
    if "memory" in tag_set:
        return "memory"
    if "creative" in tag_set:
        return "creative"
    if "fixed" in tag_set or source == "persona_golden":
        return "fixed"
    return "general"


def read_examples(path: Path) -> list[Example]:
    examples: list[Example] = []
    with path.open("r", encoding="utf-8") as fp:
        for line in fp:
            if not line.strip():
                continue
            raw = json.loads(line)
            pair = single_turn_messages(raw.get("messages", []))
            if not pair:
                continue
            prompt, answer = pair
            tags = tuple(str(tag) for tag in raw.get("tags", []))
            source = str(raw.get("source", "unknown"))
            row_id = str(raw.get("id", ""))
            label = classify_example(prompt, answer, source, tags)
            examples.append(Example(row_id=row_id, prompt=prompt, answer=answer, source=source, tags=tags, label=label))
    return examples


def train_classifier(examples: list[Example], max_features: int, alpha: float) -> dict[str, Any]:
    labels = [label for label in LABELS if any(example.label == label for example in examples)]
    label_doc_counts = Counter(example.label for example in examples)
    feature_doc_counts: Counter[str] = Counter()
    label_feature_counts: dict[str, Counter[str]] = {label: Counter() for label in labels}
    label_total_features: Counter[str] = Counter()

    for example in examples:
        unique_features = set(char_features(example.prompt))
        for feature in unique_features:
            feature_doc_counts[feature] += 1
            label_feature_counts[example.label][feature] += 1
            label_total_features[example.label] += 1

    total_docs = sum(label_doc_counts.values())
    scored_features: list[tuple[float, str]] = []
    for feature, doc_count in feature_doc_counts.items():
        if doc_count < 2:
            continue
        per_label_counts = [label_feature_counts[label][feature] for label in labels]
        max_count = max(per_label_counts)
        if max_count <= 1:
            continue
        concentration = max_count / doc_count
        score = doc_count * (0.4 + concentration)
        scored_features.append((score, feature))
    vocab = [feature for _, feature in sorted(scored_features, reverse=True)[:max_features]]
    vocab_set = set(vocab)
    vocab_size = len(vocab)

    priors: list[float] = []
    feature_weights: dict[str, list[float]] = {}
    for label in labels:
        prior = math.log((label_doc_counts[label] + alpha) / (total_docs + alpha * len(labels)))
        priors.append(round(prior, 5))

    totals_by_label = {label: label_total_features[label] + alpha * max(1, vocab_size) for label in labels}
    totals_by_other = {
        label: sum(label_total_features[other] for other in labels if other != label) + alpha * max(1, vocab_size)
        for label in labels
    }
    for feature in vocab:
        weights: list[float] = []
        total_feature_count = sum(label_feature_counts[label][feature] for label in labels)
        for label in labels:
            count = label_feature_counts[label][feature]
            other_count = total_feature_count - count
            p_label = (count + alpha) / totals_by_label[label]
            p_other = (other_count + alpha) / totals_by_other[label]
            weights.append(round(math.log(p_label / p_other), 5))
        if any(abs(weight) >= 0.02 for weight in weights):
            feature_weights[feature] = weights

    return {
        "labels": labels,
        "priors": priors,
        "featureWeights": feature_weights,
        "maxFeatures": max_features,
        "alpha": alpha,
        "labelDocCounts": {label: label_doc_counts[label] for label in labels},
    }


def build_answer_index(examples: list[Example], limit: int) -> list[dict[str, Any]]:
    best_by_key: dict[str, tuple[int, Example]] = {}
    for example in examples:
        if example.source == "generated_common_knowledge":
            continue
        if example.label in {"general", "memory"}:
            continue
        key = normalize_text(example.prompt)
        if not key or len(key) < 2:
            continue
        if any(pattern in example.prompt or pattern in example.answer for pattern in FORBIDDEN_OUTPUT_PATTERNS):
            continue
        priority = ANSWER_SOURCE_PRIORITY.get(example.source, 10)
        if example.label in {"fixed", "boundary", "unknown", "reasoning", "philosophy", "rewrite_short"}:
            priority += 25
        current = best_by_key.get(key)
        if current is None or priority > current[0]:
            best_by_key[key] = (priority, example)

    ranked = sorted(best_by_key.values(), key=lambda item: (-item[0], item[1].label, item[1].prompt))
    entries: list[dict[str, Any]] = []
    for priority, example in ranked[:limit]:
        entries.append(
            {
                "key": normalize_text(example.prompt),
                "prompt": example.prompt,
                "answer": example.answer,
                "label": example.label,
                "source": example.source,
                "priority": priority,
            }
        )
    return entries


def family_key(example: Example) -> str:
    base_id = re.sub(r"-r\d+$", "", example.row_id)
    if not base_id:
        base_id = normalize_text(example.prompt)[:80]
    tag_family = ",".join(tag for tag in example.tags if tag != "oversampled")
    return f"{example.source}:{example.label}:{tag_family}:{base_id}"


def family_bucket(key: str, modulo: int) -> int:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % modulo


def split_family_holdout(examples: list[Example], modulo: int) -> tuple[list[Example], list[Example], dict[str, Any]]:
    families: dict[str, str] = {}
    for example in examples:
        key = family_key(example)
        families[key] = example.label

    holdout_keys = {key for key in families if family_bucket(key, modulo) == 0}
    by_label_keys: dict[str, list[str]] = defaultdict(list)
    for key, label in families.items():
        by_label_keys[label].append(key)

    forced_label_holdout: list[str] = []
    for label, keys in by_label_keys.items():
        if len(keys) <= 1:
            continue
        if any(key in holdout_keys for key in keys):
            continue
        selected = min(keys, key=lambda key: hashlib.sha256(key.encode("utf-8")).hexdigest())
        holdout_keys.add(selected)
        forced_label_holdout.append(label)

    train: list[Example] = []
    holdout: list[Example] = []
    for example in examples:
        key = family_key(example)
        if key in holdout_keys:
            holdout.append(example)
        else:
            train.append(example)

    label_summary: dict[str, dict[str, int]] = defaultdict(lambda: {"families": 0, "holdoutFamilies": 0})
    for key, label in families.items():
        label_summary[label]["families"] += 1
        if key in holdout_keys:
            label_summary[label]["holdoutFamilies"] += 1

    return train, holdout, {
        "familyModulo": modulo,
        "families": len(families),
        "forcedLabelHoldout": sorted(forced_label_holdout),
        "trainExamples": len(train),
        "holdoutExamples": len(holdout),
        "byLabelFamilies": dict(sorted(label_summary.items())),
    }


def evaluate_holdout(examples: list[Example], max_features: int, alpha: float) -> dict[str, Any]:
    train_examples, holdout_examples, split = split_family_holdout(examples, modulo=11)
    holdout_classifier = train_classifier(train_examples, max_features, alpha)
    labels = holdout_classifier["labels"]
    feature_weights = holdout_classifier["featureWeights"]
    priors = holdout_classifier["priors"]
    total = 0
    correct = 0
    by_label: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "correct": 0})
    for example in holdout_examples:
        scores = list(priors)
        for feature in set(char_features(example.prompt)):
            weights = feature_weights.get(feature)
            if not weights:
                continue
            for label_index, weight in enumerate(weights):
                scores[label_index] += weight
        predicted = labels[max(range(len(labels)), key=lambda item: scores[item])]
        total += 1
        by_label[example.label]["total"] += 1
        if predicted == example.label:
            correct += 1
            by_label[example.label]["correct"] += 1
    return {
        "holdoutStrategy": "source_label_tag_family_sha256_modulo",
        **split,
        "total": total,
        "correct": correct,
        "accuracy": round(correct / total, 4) if total else 0,
        "byLabel": dict(sorted(by_label.items())),
        "trainedOnHoldoutFamilies": False,
    }


def write_web_module(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(
        "// Generated by scripts/train_tiny_router.py. Do not edit by hand.\n"
        f"export const TINY_ROUTER_MODEL = Object.freeze({encoded});\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Train the Vercel-safe tiny router.")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET))
    parser.add_argument("--artifact", default=str(DEFAULT_ARTIFACT))
    parser.add_argument("--web", default=str(DEFAULT_WEB))
    parser.add_argument("--max-features", type=int, default=18000)
    parser.add_argument("--answer-limit", type=int, default=1600)
    parser.add_argument("--alpha", type=float, default=0.35)
    args = parser.parse_args()

    dataset = Path(args.dataset)
    examples = read_examples(dataset)
    classifier = train_classifier(examples, args.max_features, args.alpha)
    answer_index = build_answer_index(examples, args.answer_limit)
    payload = {
        "schemaVersion": 1,
        "purpose": "tiny browser-safe auxiliary router; not a generative model",
        "dataset": str(dataset.relative_to(ROOT) if dataset.is_relative_to(ROOT) else dataset),
        "stats": {
            "examples": len(examples),
            "answerIndex": len(answer_index),
            "featureWeights": len(classifier["featureWeights"]),
        },
        "thresholds": {
            "routeConfidence": 0.58,
            "routeMargin": 0.22,
            "answerSimilarity": 0.88,
            "exactAnswerSimilarity": 0.999,
        },
        "classifier": classifier,
        "answerIndex": answer_index,
    }
    payload["evaluation"] = evaluate_holdout(examples, args.max_features, args.alpha)

    artifact = Path(args.artifact)
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    write_web_module(Path(args.web), payload)

    artifact_bytes = artifact.stat().st_size
    web_bytes = Path(args.web).stat().st_size
    print(
        json.dumps(
            {
                "ok": True,
                "examples": len(examples),
                "labels": classifier["labels"],
                "features": len(classifier["featureWeights"]),
                "answerIndex": len(answer_index),
                "artifactBytes": artifact_bytes,
                "webBytes": web_bytes,
                "evaluation": payload["evaluation"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
