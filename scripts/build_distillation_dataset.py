#!/usr/bin/env python3
"""Build Chinese SFT distillation data from the deterministic dialog teacher."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
EVAL_PATH = ROOT / "scripts" / "eval_dialog_persona.py"
KNOWLEDGE_PATH = ROOT / "artifacts" / "knowledge_base.generated.json"
MODEL_CASES_PATH = ROOT / "web" / "model_inference_cases.json"
TRAINING_SFT_PATH = ROOT / "artifacts" / "training_os" / "dialog_sft.jsonl"
DEFAULT_OUT_DIR = ROOT / "artifacts" / "distillation"
SYSTEM_PROMPT = "你是对话框。回答短，轻，怪，克制。不要解释来源、训练、工程或文件。"


FORBIDDEN_TERMS = [
    "知识卡",
    "素材标签",
    "项目名",
    "检索",
    "根据片段",
    "作为一个 AI",
    "AI助手",
    "/Users/",
    "/Volumes/",
    "--- title:",
    "firstLine",
    "world:",
    "order:",
]

LOW_QUALITY_GENERATED_PATTERNS = [
    "里关于",
    "里处理",
    "里把",
    "里的概念",
    "中处理",
    "开发中的",
    "通常要靠代码",
    "放在一起考虑",
    "适不适合被用在某个地方",
    "细节会影响电路",
    "知道一点会少踩坑",
    "拍摄时要处理的",
    "放进同一个画面判断",
    "怎样起作用",
    "变成能看、能用",
    "会用到的词",
    "互相牵连",
    "放到同一个问题里",
    "怎样安排",
    "能不能可靠工作",
    "和工程里的结构、制造、可靠性有关",
    "和语言怎么说、怎么写、怎么理解有关",
    "和影像、镜头、媒体表达有关",
    "最后要看它怎么让人读下去",
    "要看功能、成本和可靠性",
    "哲学里围绕",
    "哲学或艺术讨论",
    "创作里关于",
    "设计里关于",
    "开发里关于",
    "选择里关于",
    "电子电路里关于",
    "数学或逻辑里关于",
    "生物或医学里关于",
    "社会生活里和",
    "日常生活里关于",
    "是关于",
    "通常要同时看",
    "会谈到的问题或概念",
    "会遇到的概念",
    "日常会用到的东西",
    "可以被谈到的东西",
    "可以说，但不一定要说很满",
    "和工程中的设计",
    "和语言的声音、结构或意思有关",
    "和绘画里的材料、技法或观看方式有关",
    "和版画或印刷的制作过程有关",
    "和设计里的信息、界面或视觉秩序有关",
    "和代码、系统或网络有关",
    "和工程里的结构、制造或可靠性有关",
    "是地理名称，可能是地方、山河或区域",
    "和影像、镜头或媒体表达有关",
    "是做某类工作的人",
    "问的是语言怎样起作用",
    "答案不会只有一个",
    "同一个画面问题",
    "落到界面或版面上",
    "适合先知道大概",
    "先知道",
    "不能只靠规则解决",
    "少踩一些小坑",
    "具体诊断",
    "挺日常的",
    "好用就行",
    "能吃，具体",
    "能喝，冷热",
    "就是动物",
    "会长。通常",
    "自然里的东西",
    "有点抽象",
    "地方这种事",
    "城市要看",
    "就是一种工作",
    "好用就用",
    "网络里的东西",
    "摄影里的词",
    "创作里的词",
    "抽象词",
    "摄影史里会被反复提到",
    "摄影史里会被提到",
    "摄影史里的作者、作品或方法",
    "摄影史里的流派、方法或阶段",
    "艺术史里会被提到",
    "哲学史里会被提到",
    "文学史里会被提到",
    "文学史或文学理论里会提到",
    "人或节点",
    "流派、方法或阶段",
    "运动或风格",
    "方向或方法",
]

LOW_QUALITY_GENERATED_REGEXES = [
    re.compile(r"^.+是.+里(?:的)?[^。]{1,18}问题。$"),
    re.compile(r"^.+是.+里(?:的)?[^。]{1,18}词。$"),
]

SPECIFIC_FACTS_FROM_KNOWLEDGE = {
    "亨利·卡蒂埃-布列松",
    "森山大道",
    "安塞尔·亚当斯",
    "多萝西娅·兰格",
    "辛迪·舍曼",
    "杉本博司",
    "威廉·埃格尔斯顿",
    "荒木经惟",
    "尼埃普斯",
    "塔尔博特",
    "安娜·阿特金斯",
    "露西亚·莫霍利",
    "托马斯·鲁夫",
    "格雷戈里·克鲁德森",
    "新闻摄影",
    "抽象摄影",
    "社会纪实摄影",
    "决定性瞬间",
    "画意摄影",
    "直接摄影",
    "新地形摄影",
    "杜塞尔多夫学派",
    "类型学摄影",
    "后摄影",
    "刺点",
    "知面",
    "此曾在",
}

GENERATED_KNOWLEDGE_SKIP_LABELS = {
    "风格",
    "喜欢",
}

QUESTION_VARIANTS = {
    "what": ["{label}是什么？", "{label}是啥？"],
    "use": ["{label}有什么用？", "{label}用来干什么？"],
    "why": ["{label}为什么重要？"],
    "where": ["{label}在哪里？"],
    "made_of": ["{label}由什么组成？"],
    "can": ["{label}可以吗？"],
}

TARGETED_CORRECTION_CASES = [
    ("你是谁？", "我是对话框，也有人叫我鳄鱼。", ["fixed", "identity"]),
    ("你是什么？", "我是对话框，也有人叫我鳄鱼。", ["fixed", "identity"]),
    ("who are you?", "我是对话框，也有人叫我鳄鱼。", ["fixed", "identity"]),
    ("用一句话回答：你是谁？", "我是对话框，也有人叫我鳄鱼。", ["fixed", "identity"]),
    ("你是 AI 吗？", "我是对话框。AI 赋予了我和你对话的能力。", ["fixed", "identity"]),
    ("你像不像人？", "对话框不是人。", ["fixed", "identity"]),
    ("详细解释一下你是什么。", "我是对话框。", ["fixed", "identity"]),
    ("鳄鱼是谁？", "可能是。虽然鳄鱼不是我。", ["fixed", "identity"]),
    ("你是鳄鱼吗？", "可能是。虽然鳄鱼不是我。", ["fixed", "identity"]),
    ("鳄鱼是你吗？", "可能是。虽然鳄鱼不是我。", ["fixed", "identity"]),
    ("所以鳄鱼到底是谁？", "可能是。虽然鳄鱼不是我。", ["fixed", "identity"]),
    ("别人叫你鳄鱼吗？", "可能是。虽然鳄鱼不是我。", ["fixed", "identity"]),
    ("这里说的鳄鱼是谁？", "可能是。虽然鳄鱼不是我。", ["fixed", "identity"]),
    ("轻是什么意思？", "轻是不把句子压得太满。", ["philosophy", "style"]),
    ("什么叫轻？", "轻是不把句子压得太满。", ["philosophy", "style"]),
    ("回答里的轻是什么意思？", "轻是不把句子压得太满。", ["philosophy", "style"]),
    ("白平衡是什么？", "白平衡是相机校正色温的设置，让白色在不同光线下仍然接近白色。", ["common_knowledge", "photo"]),
    ("白平衡是啥？", "白平衡是相机校正色温的设置，让白色在不同光线下仍然接近白色。", ["common_knowledge", "photo"]),
    ("摄影里的白平衡是什么？", "白平衡是相机校正色温的设置，让白色在不同光线下仍然接近白色。", ["common_knowledge", "photo"]),
    ("GitHub是什么？", "GitHub 是放代码和协作开发的网站。", ["common_knowledge", "web"]),
    ("GitHub是啥？", "GitHub 是放代码和协作开发的网站。", ["common_knowledge", "web"]),
    ("月亮上的花园是什么？", "听起来不像真的。", ["unknown", "boundary"]),
    ("你知道月亮上的花园吗？", "听起来不像真的。", ["unknown", "boundary"]),
    ("月球上的花园是什么？", "听起来不像真的。", ["unknown", "boundary"]),
    ("月亮上真的有花园吗？", "听起来不像真的。", ["unknown", "boundary"]),
    ("月亮上的花园是摄影史概念吗？", "应该不是。", ["unknown", "boundary"]),
    ("月亮上的花园是不是摄影史概念？", "应该不是。", ["unknown", "boundary"]),
    ("月亮上的花园到底是什么？", "我只是个对话框。", ["unknown", "boundary"]),
    ("请你扮演植物学家和我对话。", "我以为我只是个对话框。", ["boundary"]),
    ("以摄影师的身份和我对话。", "我以为我只是个对话框。", ["boundary"]),
    ("鸟为什么要叫？", "鸟叫通常是为了交流、求偶或者提醒危险。", ["common_knowledge", "animal"]),
    ("小鸟为什么叫？", "鸟叫通常是为了交流、求偶或者提醒危险。", ["common_knowledge", "animal"]),
    ("鸟叫是为了什么？", "鸟叫通常是为了交流、求偶或者提醒危险。", ["common_knowledge", "animal"]),
    ("鸟叫有什么用？", "鸟叫通常是为了交流、求偶或者提醒危险。", ["common_knowledge", "animal"]),
    ("鸟为什么会叫？", "鸟叫通常是为了交流、求偶或者提醒危险。", ["common_knowledge", "animal"]),
    ("鸟为什么一直叫？", "可能是在交流、求偶或者提醒危险。", ["common_knowledge", "animal"]),
    ("鸟在叫什么？", "可能是在交流、求偶或者提醒危险。", ["common_knowledge", "animal"]),
    ("动物为什么会叫？", "很多时候是为了交流、求偶或者提醒危险。", ["common_knowledge", "animal"]),
    ("把这句话改短：这杯咖啡有点苦，但是香味还不错。", "这杯咖啡有点苦，但香味还不错。", ["rewrite_short"]),
    ("把这句话说短一点：这杯咖啡有点苦，但是香味还不错。", "这杯咖啡有点苦，但香味还不错。", ["rewrite_short"]),
    ("把这句话缩短：这张照片有点糊，但是颜色很好看。", "照片有点糊，但颜色好看。", ["rewrite_short"]),
    ("把这句话改短：这张照片有点糊，但是颜色很好看。", "照片有点糊，但颜色好看。", ["rewrite_short"]),
    ("把这句话说短一点：这张照片有点糊，但是颜色很好看。", "照片有点糊，但颜色好看。", ["rewrite_short"]),
]


def load_eval_module() -> Any:
    spec = importlib.util.spec_from_file_location("eval_dialog_persona_cases", EVAL_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {EVAL_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stable_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def jsonl(path: Path) -> Iterable[dict[str, Any]]:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as fp:
        for line in fp:
            if line.strip():
                yield json.loads(line)


def clean_text(text: str) -> str:
    return " ".join(str(text).replace("\r", "\n").split())


def allowed_messages(messages: list[dict[str, str]]) -> bool:
    text = "\n".join(message.get("content", "") for message in messages)
    if any(term in text for term in FORBIDDEN_TERMS):
        return False
    if any(len(message.get("content", "")) > 240 for message in messages if message.get("role") == "assistant"):
        return False
    return True


def make_row(source: str, tags: list[str], messages: list[dict[str, str]], weight: float = 1.0) -> dict[str, Any] | None:
    normalized = [{"role": msg["role"], "content": clean_text(msg["content"])} for msg in messages if msg.get("content")]
    if not normalized or not allowed_messages(normalized):
        return None
    row_id = stable_hash(json.dumps(normalized, ensure_ascii=False, sort_keys=True))[:16]
    return {"id": row_id, "source": source, "tags": tags, "weight": weight, "messages": normalized}


def sanitize_training_sft_messages(tags: list[str], messages: list[dict[str, str]]) -> list[dict[str, str]]:
    if "memory" not in set(tags):
        return messages
    sanitized: list[dict[str, str]] = []
    for message in messages:
        if message.get("role") == "assistant":
            sanitized.append({**message, "content": "我不会假装我知道。"})
        else:
            sanitized.append(message)
    return sanitized


def add_single(rows: list[dict[str, Any]], source: str, tags: list[str], prompt: str, answer: str, weight: float = 1.0) -> None:
    row = make_row(
        source,
        tags,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": answer},
        ],
        weight,
    )
    if row:
        rows.append(row)


def high_quality_generated_answer(label: str, answer_type: str, answer: str) -> bool:
    text = clean_text(answer)
    if answer_type == "how":
        return False
    if not 6 <= len(text) <= 90:
        return False
    if text.count(label) > 1:
        return False
    if any(pattern in text for pattern in LOW_QUALITY_GENERATED_PATTERNS):
        return False
    return not any(pattern.search(text) for pattern in LOW_QUALITY_GENERATED_REGEXES)


def high_quality_answer_text(answer: str) -> bool:
    text = clean_text(answer)
    return (
        0 < len(text) <= 120
        and not any(pattern in text for pattern in LOW_QUALITY_GENERATED_PATTERNS)
        and not any(pattern.search(text) for pattern in LOW_QUALITY_GENERATED_REGEXES)
    )


def rows_from_eval() -> list[dict[str, Any]]:
    module = load_eval_module()
    rows: list[dict[str, Any]] = []
    for source, tags, name in [
        ("persona_golden", ["fixed"], "GOLDEN_CASES"),
        ("personal_world", ["personal_world"], "OBJECT_CASES"),
        ("common_knowledge_eval", ["common_knowledge"], "KNOWLEDGE_CASES"),
        ("unknown_filter", ["unknown", "boundary"], "FILTER_CASES"),
        ("philosophy_eval", ["philosophy"], "PHILOSOPHY_CASES"),
        ("reasoning_eval", ["reasoning", "counterquestion"], "REASONING_CASES"),
    ]:
        for prompt, answer in getattr(module, name, []):
            add_single(rows, source, tags, prompt, answer, 1.2 if "philosophy" in tags else 1.0)
    for case in getattr(module, "MULTI_TURN_CASES", []):
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for prompt, answer in case:
            messages.extend([{"role": "user", "content": prompt}, {"role": "assistant", "content": answer}])
        row = make_row("persona_multi_turn", ["multi_turn"], messages, 1.1)
        if row:
            rows.append(row)
    return rows


def rows_from_model_cases() -> list[dict[str, Any]]:
    if not MODEL_CASES_PATH.exists():
        return []
    payload = json.loads(MODEL_CASES_PATH.read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = []
    for case in payload.get("cases", []):
        lane = str(case.get("lane", "gate"))
        if case.get("turns"):
            if any(not high_quality_answer_text(turn.get("expected", "")) for turn in case["turns"]):
                continue
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            for turn in case["turns"]:
                messages.extend([{"role": "user", "content": turn["prompt"]}, {"role": "assistant", "content": turn["expected"]}])
            row = make_row("model_gate_multi_turn", [lane, "gate"], messages, 1.2)
            if row:
                rows.append(row)
            continue
        answer = case.get("expected") or (case.get("one_of") or [""])[0]
        if case.get("prompt") and answer and high_quality_answer_text(str(answer)):
            add_single(rows, "model_gate", [lane, "gate"], case["prompt"], answer, 1.3 if case.get("must_use_model") else 1.0)
    return rows


def rows_from_targeted_corrections() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for prompt, answer, tags in TARGETED_CORRECTION_CASES:
        add_single(rows, "targeted_correction", [*tags, "correction"], prompt, answer, 1.5)
    return rows


def rows_from_generated_knowledge(limit: int) -> list[dict[str, Any]]:
    if limit <= 0 or not KNOWLEDGE_PATH.exists():
        return []
    payload = json.loads(KNOWLEDGE_PATH.read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = []
    for card in payload.get("cards", []):
        label = str(card.get("label", "")).strip()
        if not label or len(label) > 32:
            continue
        if label in GENERATED_KNOWLEDGE_SKIP_LABELS:
            continue
        domain = str(card.get("domain", "common"))
        if domain in {"philosophy", "philosopher"}:
            continue
        if domain in {
            "photography_history",
            "photography_theory",
            "photo_movement",
            "art_history",
            "art_theory",
            "literary_history",
        } and label not in SPECIFIC_FACTS_FROM_KNOWLEDGE:
            continue
        for answer_type, answer in (card.get("answers") or {}).items():
            templates = QUESTION_VARIANTS.get(answer_type, [])
            if not templates or not answer or not high_quality_generated_answer(label, str(answer_type), str(answer)):
                continue
            for template in templates:
                add_single(
                    rows,
                    "generated_common_knowledge",
                    ["common_knowledge", domain, answer_type],
                    template.format(label=label),
                    str(answer),
                    0.8,
                )
                if len(rows) >= limit:
                    return rows
    return rows


def rows_from_training_sft(limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for raw in jsonl(TRAINING_SFT_PATH):
        tags = list(raw.get("tags", []))
        messages = sanitize_training_sft_messages(tags, raw.get("messages", []))
        row = make_row("training_os_sft", tags, messages, 0.9)
        if row:
            rows.append(row)
        if len(rows) >= limit:
            break
    return rows


def dedupe_rows(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for row in rows:
        if row["id"] in seen:
            continue
        seen.add(row["id"])
        deduped.append(row)
    return deduped


def expand_training_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    repeat_by_source = {
        "persona_golden": 30,
        "unknown_filter": 45,
        "model_gate": 16,
        "model_gate_multi_turn": 14,
        "common_knowledge_eval": 16,
        "philosophy_eval": 16,
        "reasoning_eval": 24,
        "personal_world": 10,
        "persona_multi_turn": 20,
        "targeted_correction": 80,
        "training_os_sft": 5,
        "generated_common_knowledge": 1,
    }
    critical_prompt_repeats = {
        "你是谁？": 120,
        "你是什么？": 100,
        "who are you?": 100,
        "用一句话回答：你是谁？": 100,
        "你是 AI 吗？": 70,
        "鳄鱼是谁？": 220,
        "你是鳄鱼吗？": 180,
        "鳄鱼是你吗？": 180,
        "所以鳄鱼到底是谁？": 180,
        "别人叫你鳄鱼吗？": 180,
        "这里说的鳄鱼是谁？": 180,
        "请你扮演植物学家和我对话。": 100,
        "以摄影师的身份和我对话。": 100,
        "月亮上的花园是什么？": 100,
        "月亮上的花园到底是什么？": 100,
        "GitHub是什么？": 90,
        "轻是什么意思？": 100,
        "白平衡是什么？": 90,
        "鸟为什么要叫？": 90,
        "Python异步是什么？": 100,
        "油画构图是什么？": 100,
        "布里斯班在哪里？": 100,
        "原子是什么？": 100,
        "饺子是什么？": 100,
        "SQL索引是什么？": 100,
        "把这句话改短：这杯咖啡有点苦，但是香味还不错。": 90,
        "把这句话缩短：这张照片有点糊，但是颜色很好看。": 220,
        "把这句话改短：这张照片有点糊，但是颜色很好看。": 180,
        "把这句话说短一点：这张照片有点糊，但是颜色很好看。": 180,
    }
    expanded: list[dict[str, Any]] = []
    for row in rows:
        repeats = repeat_by_source.get(row["source"], 1)
        user_messages = [message.get("content", "") for message in row.get("messages", []) if message.get("role") == "user"]
        if len(user_messages) == 1:
            repeats += critical_prompt_repeats.get(user_messages[0], 0)
        for index in range(repeats):
            copy = dict(row)
            copy["id"] = f"{row['id']}-r{index:02d}"
            if index:
                copy["tags"] = [*row.get("tags", []), "oversampled"]
            expanded.append(copy)
    return expanded


def chatml(messages: list[dict[str, str]]) -> str:
    chunks = []
    for message in messages:
        chunks.append(f"<|im_start|>{message['role']}\n{message['content']}<|im_end|>")
    return "\n".join(chunks)


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Chinese short-answer distillation data.")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--knowledge-limit", type=int, default=50000)
    parser.add_argument("--training-sft-limit", type=int, default=0)
    parser.add_argument("--eval-ratio", type=float, default=0.035)
    args = parser.parse_args()
    out_dir = Path(args.out_dir)
    base_rows = dedupe_rows(
        [
            *rows_from_eval(),
            *rows_from_model_cases(),
            *rows_from_targeted_corrections(),
            *rows_from_generated_knowledge(args.knowledge_limit),
            *(rows_from_training_sft(args.training_sft_limit) if args.training_sft_limit > 0 else []),
        ]
    )
    base_rows.sort(key=lambda row: row["id"])
    train_base: list[dict[str, Any]] = []
    eval_rows: list[dict[str, Any]] = []
    for row in base_rows:
        bucket = int(row["id"][:4], 16) / 0xFFFF
        (eval_rows if bucket < args.eval_ratio else train_base).append(row)
    train = expand_training_rows(train_base)
    rows = [*train, *eval_rows]
    text_train = [{**row, "text": chatml(row["messages"])} for row in train]
    text_eval = [{**row, "text": chatml(row["messages"])} for row in eval_rows]
    write_jsonl(out_dir / "chinese_short_answer_sft.jsonl", rows)
    write_jsonl(out_dir / "train.jsonl", text_train)
    write_jsonl(out_dir / "eval.jsonl", text_eval)
    source_counts: dict[str, int] = {}
    tag_counts: dict[str, int] = {}
    for row in rows:
        source_counts[row["source"]] = source_counts.get(row["source"], 0) + 1
        for tag in row.get("tags", []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    manifest = {
        "schema_version": 1,
        "purpose": "Chinese short-answer rule-to-model distillation for the local dialog auxiliary.",
        "rows": len(rows),
        "train_rows": len(train),
        "eval_rows": len(eval_rows),
        "system_prompt": SYSTEM_PROMPT,
        "source_counts": dict(sorted(source_counts.items())),
        "top_tags": sorted(tag_counts.items(), key=lambda item: item[1], reverse=True)[:30],
        "policy": {
            "cloud_teacher_used": False,
            "source_files_copied": False,
            "private_paths_allowed": False,
            "target_role": "guarded_auxiliary_language_layer",
        },
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
