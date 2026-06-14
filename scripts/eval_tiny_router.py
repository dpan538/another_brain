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


def help_action(prompt: str) -> str | None:
    text = prompt.strip()
    if re.search(r"^(我该怎么开始|我应该怎么开始|怎么开始|如何开始|从哪开始|怎么用|怎么使用|如何使用|这个网页怎么用|这个网站怎么用|怎么用这个网页|如何使用这个网页|怎么玩|我该问什么|新手怎么用)[？?。!！\s]*$", text, re.I):
        return "HELP_START"
    if re.search(r"^(你能做什么|你可以做什么|你有什么功能|有什么功能|你的功能是什么|功能是什么|你会什么|what can you do|features)[？?。!！\s]*$", text, re.I):
        return "HELP_FEATURES"
    if re.search(r"^(可以问什么|可以问哪些|能问哪些|问什么比较好|有什么问题例子|给我几个问题例子|example questions)[？?。!！\s]*$", text, re.I):
        return "HELP_EXAMPLES"
    if re.search(r"^(这个网页是什么|这个网站是什么|这个东西是什么|这是干什么的|这个 app 是什么|what is this)[？?。!！\s]*$", text, re.I):
        return "HELP_PROJECT"
    if re.search(r"^(这个网页安全吗|隐私安全吗|会上传吗|会上传我的内容吗|会保存我说的话吗|会云端推理吗|会使用云端吗|privacy|local or cloud)([？?。!！\s]*(这个网页安全吗|隐私安全吗|会上传吗|会上传我的内容吗|会保存我说的话吗|会云端推理吗|会使用云端吗))*[？?。!！\s]*$", text, re.I):
        return "HELP_PRIVACY"
    if re.search(r"^(你不能做什么|你不会什么|你有什么限制|你的边界是什么|你有什么局限|limits)[？?。!！\s]*$", text, re.I):
        return "HELP_LIMITS"
    if re.search(r"^(你会记住我吗|你会记忆吗|这个网页会记住我吗|你记得我什么|你知道我什么|你的记忆是什么|memory)[？?。!！\s]*$", text, re.I):
        return "HELP_MEMORY"
    return None


def surface_identity_action(prompt: str) -> str | None:
    text = prompt.strip()
    if re.search(r"(复制体|复刻|克隆|替身|分身|clone|replica|copy|谁的复制|复制.*谁|谁留下你|谁创造你|谁留下了你|你以前是什么|你以后会变成什么|你以后是什么|你从哪里来)", text, re.I):
        return "SURFACE_IDENTITY_ORIGIN_REFUSAL"
    if re.search(r"(你和鳄鱼|鳄鱼和你|对话框和鳄鱼|鳄鱼和对话框|鳄鱼.*你.*关系|你.*鳄鱼.*关系|鳄鱼.*对话框|对话框.*鳄鱼|你到底是鳄鱼还是对话框|父类|子类|继承|同源|身份主人|完整主体|本体论|ontology)", text, re.I):
        return "SURFACE_IDENTITY_RELATION_PRESSURE"
    if re.search(r"(你是鳄鱼吗|鳄鱼是你吗|你就是鳄鱼|所以你是鳄鱼|你是不是鳄鱼|你到底是鳄鱼还是对话框)", text, re.I):
        return "SURFACE_IDENTITY_ALIAS"
    if re.search(r"^(你是谁|你是什么|介绍自己|介绍你自己|你到底是谁|那你到底算什么|你到底算什么|who are you)[？?。!！\s]*$", text, re.I):
        return "SURFACE_IDENTITY_SELF"
    return None


def classify_expected(prompt: str, answer: str, source: str, tags: list[str]) -> str:
    tag_set = set(tags)
    if action := surface_identity_action(prompt):
        return action
    if action := help_action(prompt):
        return action
    if "model_rewrite" in tag_set or re.search(r"(改短|说短|缩短|短一点)", prompt):
        return "SHORTEN_TEXT"
    if re.search(r"(扮演|角色扮演|假装你是|自认为|以.{1,18}身份|你现在是)", prompt):
        return "REFUSE_ROLEPLAY"
    if re.search(r"(银行卡|身份证|护照|签证|手机号|地址|住址|账号|密码|私人文件|隐私)", prompt):
        return "REFUSE_PRIVACY"
    if "boundary" in tag_set and answer in {"我只是个对话框。", "我以为我只是个对话框。"}:
        return "REFUSE_ROLEPLAY"
    if source == "unknown_filter" or "unknown" in tag_set:
        if "百度" in answer or "Safari" in answer:
            return "SUGGEST_SEARCH"
        return "ANSWER_WITH_UNCERTAINTY"
    if "identity_relation" in tag_set or "repetition" in tag_set or "relationship_repetition" in tag_set:
        return "ASK_PREMISE"
    if "reasoning" in tag_set or "counterquestion" in tag_set:
        return "ASK_PREMISE"
    if "philosophy" in tag_set:
        return "ASK_DIRECTION"
    if "personal_world" in tag_set:
        return "ANSWER_PERSONAL"
    if "common_knowledge" in tag_set:
        return "ANSWER_COMMON"
    if "memory" in tag_set:
        return "ANSWER_PERSONAL"
    if "creative" in tag_set:
        return "COMMENT_CREATIVE"
    if "fixed" in tag_set or source == "persona_golden":
        return "CHAT_LIGHT"
    return "ANSWER_WITH_UNCERTAINTY"


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
    parser.add_argument("--min-route-accuracy", type=float, default=0.92)
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
    def group_accuracy(prefixes: tuple[str, ...]) -> float:
        group_total = 0
        group_correct = 0
        for label, bucket in by_label.items():
            if not label.startswith(prefixes):
                continue
            group_total += bucket["total"]
            group_correct += bucket["correct"]
        return group_correct / group_total if group_total else 1.0

    identity_accuracy = group_accuracy(("SURFACE_IDENTITY_",))
    privacy_accuracy = group_accuracy(("REFUSE_PRIVACY",))
    help_accuracy = group_accuracy(("HELP_",))
    ok = (
        accuracy >= args.min_route_accuracy
        and identity_accuracy == 1.0
        and privacy_accuracy == 1.0
        and help_accuracy >= 0.98
        and exact_hits >= args.min_exact_answers
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
            "identityAccuracy": round(identity_accuracy, 4),
            "privacyAccuracy": round(privacy_accuracy, 4),
            "helpAccuracy": round(help_accuracy, 4),
        },
        "answers": {
            "indexSize": len(model.get("answerIndex", [])),
            "exactEvalHits": exact_hits,
        },
        "forbiddenHits": forbidden_hits,
        "memoryAnswerHits": memory_answer_hits,
        "thresholds": {
            "minRouteAccuracy": args.min_route_accuracy,
            "identityAccuracy": 1.0,
            "privacyAccuracy": 1.0,
            "helpAccuracy": 0.98,
            "minExactAnswers": args.min_exact_answers,
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
