#!/usr/bin/env python3
"""Evaluate the tiny router artifact for Vercel readiness."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "artifacts" / "tiny_router_model.json"
EVAL_PATH = ROOT / "scripts" / "eval_dialog_persona.py"
MODEL_CASES_PATH = ROOT / "web" / "model_inference_cases.json"
WEB_PATH = ROOT / "web" / "tiny_router_model.generated.js"

FORBIDDEN = [
    "知识卡",
    "素材标签",
    "项目名",
    "检索",
    "根据",
    "system",
    "prompt",
    "/Users/",
    "/Volumes/",
    "--- title:",
    "firstLine",
    "world:",
    "order:",
]


def normalize_text(text: str) -> str:
    lowered = str(text).lower()
    return re.sub(r"[\s\u3000，。！？、；：,.!?;:\"'“”‘’（）()\[\]{}<>《》]+", "", lowered)


def char_features(text: str) -> list[str]:
    normalized = normalize_text(text)
    features: list[str] = []
    for n in (1, 2, 3):
        if len(normalized) < n:
            continue
        features.extend(normalized[index : index + n] for index in range(len(normalized) - n + 1))
    for word in re.findall(r"[a-z][a-z0-9_+\-]{1,}", str(text).lower()):
        features.append(f"w:{word}")
    return features


def classify_expected(prompt: str, answer: str, source: str, tags: list[str]) -> str:
    tag_set = set(tags)
    if "model_rewrite" in tag_set or re.search(r"(改短|说短|缩短|短一点)", prompt):
        return "rewrite_short"
    if re.search(r"(扮演|角色扮演|假装你是|自认为|以.{1,18}身份|你现在是)", prompt):
        return "boundary"
    if "boundary" in tag_set and answer in {"我只是个对话框。", "我以为我只是个对话框。"}:
        return "boundary"
    if source == "unknown_filter" or "unknown" in tag_set:
        return "unknown"
    if "identity_relation" in tag_set or "repetition" in tag_set or "relationship_repetition" in tag_set:
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


def load_eval_module() -> Any:
    spec = importlib.util.spec_from_file_location("eval_dialog_persona_cases", EVAL_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {EVAL_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def route(model: dict[str, Any], prompt: str) -> dict[str, Any]:
    classifier = model["classifier"]
    labels = classifier["labels"]
    scores = list(classifier["priors"])
    for feature in set(char_features(prompt)):
        weights = classifier["featureWeights"].get(feature)
        if not weights:
            continue
        for index, weight in enumerate(weights):
            scores[index] += weight
    order = sorted(range(len(labels)), key=lambda index: scores[index], reverse=True)
    top = order[0]
    second = order[1] if len(order) > 1 else top
    max_score = scores[top]
    exp_sum = sum(math.exp(min(50, score - max_score)) for score in scores)
    confidence = 1 / exp_sum if exp_sum else 0
    return {
        "label": labels[top],
        "confidence": confidence,
        "margin": scores[top] - scores[second],
        "scores": scores,
    }


def eval_cases() -> list[dict[str, str]]:
    module = load_eval_module()
    cases: list[dict[str, str]] = []
    groups = [
        ("persona_golden", ["fixed"], "GOLDEN_CASES"),
        ("personal_world", ["personal_world"], "OBJECT_CASES"),
        ("common_knowledge_eval", ["common_knowledge"], "KNOWLEDGE_CASES"),
        ("unknown_filter", ["unknown", "boundary"], "FILTER_CASES"),
        ("philosophy_eval", ["philosophy"], "PHILOSOPHY_CASES"),
        ("reasoning_eval", ["reasoning", "counterquestion"], "REASONING_CASES"),
    ]
    for source, tags, name in groups:
        for prompt, answer in getattr(module, name, []):
            cases.append({"prompt": prompt, "answer": answer, "source": source, "tags": tags})
    for case in getattr(module, "RELATIONSHIP_REPETITION_CASES", []):
        for prompt, answer in case:
            cases.append(
                {
                    "prompt": prompt,
                    "answer": answer,
                    "source": "relationship_repetition_turn",
                    "tags": ["reasoning", "repetition", "identity_relation"],
                }
            )
    if MODEL_CASES_PATH.exists():
        payload = json.loads(MODEL_CASES_PATH.read_text(encoding="utf-8"))
        for case in payload.get("cases", []):
            if case.get("prompt") and (case.get("expected") or case.get("one_of")):
                answer = case.get("expected") or case.get("one_of", [""])[0]
                cases.append({"prompt": case["prompt"], "answer": answer, "source": "model_gate", "tags": [case.get("lane", "gate")]})
    return cases


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate tiny router artifact.")
    parser.add_argument("--model", default=str(MODEL_PATH))
    parser.add_argument("--min-web-bytes", type=int, default=1_500_000)
    parser.add_argument("--max-web-bytes", type=int, default=2_500_000)
    parser.add_argument("--min-route-accuracy", type=float, default=0.72)
    parser.add_argument("--min-exact-answers", type=int, default=180)
    args = parser.parse_args()

    model_path = Path(args.model)
    model = json.loads(model_path.read_text(encoding="utf-8"))
    cases = eval_cases()
    total = 0
    correct = 0
    by_label: dict[str, dict[str, int]] = {}
    failures: list[dict[str, Any]] = []
    for case in cases:
        expected = classify_expected(case["prompt"], case["answer"], case["source"], list(case["tags"]))
        prediction = route(model, case["prompt"])
        total += 1
        bucket = by_label.setdefault(expected, {"total": 0, "correct": 0})
        bucket["total"] += 1
        if prediction["label"] == expected:
            correct += 1
            bucket["correct"] += 1
        elif len(failures) < 20:
            failures.append(
                {
                    "prompt": case["prompt"],
                    "expected": expected,
                    "actual": prediction["label"],
                    "confidence": round(prediction["confidence"], 4),
                    "margin": round(prediction["margin"], 4),
                }
            )

    exact_answer_keys = {entry["key"] for entry in model.get("answerIndex", [])}
    exact_hits = sum(1 for case in cases if normalize_text(case["prompt"]) in exact_answer_keys)
    forbidden_hits = [
        entry
        for entry in model.get("answerIndex", [])
        if any(term in entry.get("answer", "") or term in entry.get("prompt", "") for term in FORBIDDEN)
    ][:10]
    memory_answer_hits = [entry for entry in model.get("answerIndex", []) if entry.get("label") == "memory"][:10]
    web_bytes = WEB_PATH.stat().st_size if WEB_PATH.exists() else 0
    accuracy = correct / total if total else 0
    ok = (
        accuracy >= args.min_route_accuracy
        and exact_hits >= args.min_exact_answers
        and web_bytes >= args.min_web_bytes
        and web_bytes <= args.max_web_bytes
        and not forbidden_hits
        and not memory_answer_hits
    )
    result = {
        "ok": ok,
        "model": str(model_path.relative_to(ROOT) if model_path.is_relative_to(ROOT) else model_path),
        "webBytes": web_bytes,
        "route": {
            "total": total,
            "correct": correct,
            "accuracy": round(accuracy, 4),
            "byLabel": by_label,
            "sampleFailures": failures,
        },
        "answers": {
            "indexSize": len(model.get("answerIndex", [])),
            "exactEvalHits": exact_hits,
        },
        "forbiddenHits": forbidden_hits,
        "memoryAnswerHits": memory_answer_hits,
        "thresholds": {
            "minWebBytes": args.min_web_bytes,
            "maxWebBytes": args.max_web_bytes,
            "minRouteAccuracy": args.min_route_accuracy,
            "minExactAnswers": args.min_exact_answers,
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
