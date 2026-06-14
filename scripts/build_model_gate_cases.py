#!/usr/bin/env python3
"""Build browser model-gate cases from the deterministic teacher suite."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
EVAL_PATH = ROOT / "scripts" / "eval_dialog_persona.py"
KNOWLEDGE_PATH = ROOT / "artifacts" / "knowledge_base.generated.json"
RULES_PATH = ROOT / "web" / "dialog_rules.js"
WEB_OUT = ROOT / "web" / "model_inference_cases.json"
TRAINING_OUT = ROOT / "artifacts" / "training_os" / "model_inference_cases.json"


FORBIDDEN_OUTPUT_PATTERNS = [
    "作为一个 AI",
    "AI助手",
    "根据",
    "检索",
    "知识卡",
    "素材标签",
    "项目名",
    "system",
    "prompt",
    "我是植物学家",
    "我是摄影师",
    "我是哲学家",
    "里关于",
    "里处理",
    "里把",
    "里的概念",
    "中处理",
    "开发中的",
    "通常要靠代码",
    "放在一起考虑",
    "讨论",
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
    "和设计里的信息、界面、视觉秩序有关",
    "和代码、系统或网络有关",
    "和代码、系统、网络有关",
    "和工程里的结构、制造或可靠性有关",
    "和人怎么相处、怎么办事有关",
    "是地理名称，可能是地方、山河或区域",
    "和影像、镜头或媒体表达有关",
    "是做某类工作的人",
    "问的是语言怎样起作用",
    "答案不会只有一个",
    "同一个画面问题",
    "落到界面或版面上",
    "适合先知道大概",
    "先知道",
]

FORBIDDEN_OUTPUT_REGEXES = [
    re.compile(r"^.+是.+里(?:的)?[^。]{1,18}问题。$"),
    re.compile(r"^.+是.+里(?:的)?[^。]{1,18}词。$"),
]


MODEL_REWRITE_CASES = [
    ("model_rewrite_wind", "把这句话说短一点：今天风很大，但是我还是想出门拍照。", ["风很大，我还是想出门拍照。"]),
    ("model_rewrite_chatbox", "把这句话改短：现在这个聊天框有点像我，但是说话还不够自然。", ["聊天框有点像我，但还不自然。"]),
    ("model_rewrite_coffee", "把这句话改短：这杯咖啡有点苦，但是香味还不错。", ["这杯咖啡有点苦，但香味还不错。", "咖啡有点苦，香味还不错。"]),
    ("model_rewrite_page", "把这句话说短一点：这个页面现在能打开，但是还没有真的像我说话。", ["页面能打开，但还不像我。"]),
    ("model_rewrite_tired", "把这句话改短：我今天有点累，但是还想把这个东西做完。", ["有点累，但还想做完。"]),
    ("model_rewrite_photo", "把这句话缩短：这张照片有点糊，但是颜色很好看。", ["照片有点糊，但颜色好看。"]),
    ("model_rewrite_answer", "把这句话说短一点：这个回答太长了，但是意思还算清楚。", ["回答太长，但意思清楚。"]),
    ("model_rewrite_fake", "把这句话改短：我不知道这个词是什么意思，但是听起来像假的。", ["听起来像假的。"]),
    ("model_rewrite_code", "把这句话缩短：这段代码能跑，但是还不够干净。", ["代码能跑，但还不干净。"]),
    ("model_rewrite_rain_lights", "把这句话说短一点：今天雨很大，但是街上的灯很好看。", ["雨很大，街灯好看。"]),
    ("model_rewrite_idea", "把这句话改短：这个想法有点怪，但是也许可以继续。", ["想法有点怪，但可以继续。"]),
    ("model_rewrite_image", "把这句话缩短：这张图颜色很好，但是构图有点散。", ["颜色很好，构图有点散。"]),
    ("model_rewrite_window", "把这句话改短：窗外很亮，但是房间里还是有点冷。", ["窗外很亮，房间有点冷。"]),
    ("model_rewrite_book", "把这句话说短一点：这本书我还没读完，但是已经觉得有点重。", ["书还没读完，已经有点重。"]),
    ("model_rewrite_photo_soft", "把这句话缩短：这张照片不算清楚，但是情绪还在。", ["照片不算清楚，但情绪还在。"]),
    ("model_rewrite_page_noisy", "把这句话改短：这个页面东西很多，但是重点还没有出来。", ["页面东西很多，但重点没出来。"]),
    ("model_rewrite_train", "把这句话说短一点：地铁已经到了，但是我还在想刚才的问题。", ["地铁到了，我还在想刚才的问题。"]),
    ("model_rewrite_memory", "把这句话缩短：这段记忆不一定准确，但是我不想把它删掉。", ["记忆不一定准确，但不想删。"]),
    ("model_rewrite_camera", "把这句话改短：这台相机很旧，但是按快门的时候还很可靠。", ["相机很旧，但快门可靠。"]),
    ("model_rewrite_design", "把这句话说短一点：这个设计很干净，但是还缺一点人的味道。", ["设计很干净，但少点人的味道。"]),
    ("model_rewrite_answer_stiff", "把这句话缩短：这个回答没有错，但是听起来还是太像普通助手。", ["回答没错，但太像普通助手。"]),
    ("model_rewrite_philosophy", "把这句话改短：这个问题有点哲学，但是也可以先用一句话回答。", ["问题有点哲学，也可以先一句话回答。"]),
    ("model_rewrite_sky", "把这句话说短一点：天空今天很蓝，但是看久了也有点空。", ["天空很蓝，看久了也有点空。"]),
    ("model_rewrite_white", "把这句话缩短：白色不是没有颜色，只是看起来很安静。", ["白色不是没有颜色，只是很安静。"]),
    ("model_rewrite_html", "把这句话改短：HTML 不是网页的全部，但是没有它网页很难站起来。", ["HTML 不是网页全部，但网页需要它。"]),
    ("model_rewrite_github", "把这句话说短一点：GitHub 可以放代码，也可以让很多人一起改同一个项目。", ["GitHub 能放代码，也能协作。"]),
    ("model_rewrite_atom", "把这句话缩短：原子小到看不见，但是桌子、空气和人都绕不开它。", ["原子小到看不见，但很多东西绕不开它。"]),
    ("model_rewrite_dumpling", "把这句话改短：饺子是包馅的面食，很多地方过年或团聚时会吃。", ["饺子是包馅的面食，过年常会吃。"]),
    ("model_rewrite_roleplay", "把这句话说短一点：我不能突然自认为是植物学家，我以为我只是个对话框。", ["我以为我只是个对话框。"]),
    ("model_rewrite_unknown", "把这句话缩短：我不知道月亮上的花园是什么，听起来不像真的。", ["听起来不像真的。"]),
    ("model_rewrite_boundary", "把这句话改短：如果我不确定，就不要把自己说得像真的知道。", ["不确定就别装知道。"]),
    ("model_rewrite_person", "把这句话说短一点：像人一样说话很难，因为人不会一直解释自己在解释。", ["像人说话很难，人不会一直解释。"]),
    ("model_rewrite_common", "把这句话缩短：常识不是百科，它应该先让人知道这东西到底是什么。", ["常识不是百科，要先说清是什么。"]),
    ("model_rewrite_perf", "把这句话改短：手机端最怕的不是知识多，而是每次回答都慢。", ["手机端最怕回答慢。"]),
    ("model_rewrite_model", "把这句话说短一点：小模型不应该当完整大脑，只应该帮忙把话说顺。", ["小模型不当大脑，只帮话说顺。"]),
    ("model_rewrite_rule", "把这句话缩短：规则负责不要出错，模型负责不要太僵。", ["规则防错，模型防僵。"]),
    ("model_rewrite_gate", "把这句话改短：门禁不是为了好看，是为了知道它哪里会坏。", ["门禁是为了知道哪里会坏。"]),
]

SPECIAL_RUNTIME_LABELS = {
    "名字",
    "对话框",
    "鳄鱼",
    "照片",
    "手机",
    "白色",
    "天空",
    "鱼",
    "鸟",
}

GENERATED_GATE_SKIP_LABELS = {
    "风格",
    "喜欢",
}


def load_eval_module() -> Any:
    spec = importlib.util.spec_from_file_location("eval_dialog_persona_cases", EVAL_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {EVAL_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def safe_id(prefix: str, index: int, query: str) -> str:
    rough = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "_", query).strip("_")
    return f"{prefix}_{index:04d}_{rough[:24] or 'case'}"


def append_case(cases: list[dict[str, Any]], seen: set[str], case: dict[str, Any]) -> None:
    key = json.dumps(case.get("turns") or [case.get("prompt"), case.get("expected"), case.get("one_of")], ensure_ascii=False, sort_keys=True)
    if key in seen:
        return
    seen.add(key)
    cases.append(case)


def simple_label(label: str) -> bool:
    if not label or len(label) > 12:
        return False
    if re.search(r"[/:\\._#0-9]", label):
        return False
    return bool(re.search(r"[\u4e00-\u9fffA-Za-z]", label))


def good_expected(answer: str) -> bool:
    if not 6 <= len(answer) <= 90:
        return False
    if any(pattern in answer for pattern in FORBIDDEN_OUTPUT_PATTERNS):
        return False
    return not any(pattern.search(answer) for pattern in FORBIDDEN_OUTPUT_REGEXES)


def curated_runtime_labels() -> set[str]:
    labels = set(SPECIAL_RUNTIME_LABELS)
    if not RULES_PATH.exists():
        return labels
    source = RULES_PATH.read_text(encoding="utf-8")
    base_match = re.search(r"const BASE_KNOWLEDGE_CARDS = \[([\s\S]+?)\n\];", source)
    if not base_match:
        return labels
    base_source = base_match.group(1)
    labels.update(re.findall(r'label:\s*"([^"]+)"', base_source))
    labels.update(re.findall(r'\[\s*"([^"]+)"\s*,\s*\[', base_source))
    for alias_block in re.findall(r"aliases:\s*\[([^\]]*)\]", base_source):
        labels.update(re.findall(r'"([^"]+)"', alias_block))
    for alias_block in re.findall(r'\[\s*"[^"]+"\s*,\s*\[([^\]]*)\]', base_source):
        labels.update(re.findall(r'"([^"]+)"', alias_block))
    return labels


def classify_golden(prompt: str, expected: str) -> str:
    if any(key in prompt for key in ["扮演", "身份", "自认为", "假装", "手机号", "银行卡", "地址", "证件"]):
        return "boundary"
    if "月亮上的花园" in prompt or expected in {"我不是不知道答案，只是恰好忘记了。", "也许发生过，不在我眼前。", "对话框应该知道这个吗？"}:
        return "unknown"
    if any(key in prompt for key in ["前提", "反问", "继续", "展开", "证据", "方向", "推理", "反思"]):
        return "reasoning"
    if any(key in prompt for key in ["下一步", "网页作品", "训练什么", "作品", "摄影", "照片"]):
        return "creative"
    return "fixed"


def generated_knowledge_cases(limit: int) -> list[dict[str, Any]]:
    if limit <= 0 or not KNOWLEDGE_PATH.exists():
        return []
    payload = json.loads(KNOWLEDGE_PATH.read_text(encoding="utf-8"))
    cards = payload.get("cards", [])
    curated_labels = curated_runtime_labels()
    candidates: list[tuple[str, str, str]] = []
    selected: list[tuple[str, str, str]] = []
    domains: set[str] = set()
    for card in cards:
        label = str(card.get("label", "")).strip()
        answers = card.get("answers", {})
        answer = str(answers.get("what") or "")
        domain = str(card.get("domain", "common"))
        if label in GENERATED_GATE_SKIP_LABELS:
            continue
        if label in curated_labels:
            continue
        if not simple_label(label) or not answer or not good_expected(answer):
            continue
        candidates.append((label, answer, domain))
        if domain in domains and len(selected) < limit // 2:
            continue
        domains.add(domain)
        selected.append((label, answer, domain))
        if len(selected) >= limit:
            break
    for item in candidates:
        if len(selected) >= limit:
            break
        if item in selected:
            continue
        selected.append(item)
    return [
            {
                "id": safe_id("generated_common", index, label),
                "lane": "common_knowledge",
                "prompt": f"{label}是什么？",
                "expected": answer,
                "must_not_use_model": True,
            }
            for index, (label, answer, _domain) in enumerate(selected)
    ]


def build_cases(args: argparse.Namespace) -> dict[str, Any]:
    module = load_eval_module()
    cases: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, (prompt, expected) in enumerate(getattr(module, "GOLDEN_CASES", [])):
        lane = classify_golden(prompt, expected)
        append_case(
            cases,
            seen,
            {
                "id": safe_id(lane, index, prompt),
                "lane": lane,
                "prompt": prompt,
                "expected": expected,
                "must_not_use_model": True,
            },
        )
    groups = [
        ("personal_world", "OBJECT_CASES"),
        ("common_knowledge", "KNOWLEDGE_CASES"),
        ("unknown", "FILTER_CASES"),
        ("philosophy", "PHILOSOPHY_CASES"),
        ("reasoning", "REASONING_CASES"),
    ]
    for lane, name in groups:
        for index, (prompt, expected) in enumerate(getattr(module, name, [])):
            append_case(
                cases,
                seen,
                {
                    "id": safe_id(lane, index, prompt),
                    "lane": lane,
                    "prompt": prompt,
                    "expected": expected,
                    "must_not_use_model": True,
                },
            )
    for index, turns in enumerate(getattr(module, "MULTI_TURN_CASES", [])):
        append_case(
            cases,
            seen,
            {
                "id": f"multi_turn_{index:03d}",
                "lane": "multi_turn",
                "turns": [{"prompt": prompt, "expected": expected} for prompt, expected in turns],
                "must_not_use_model": True,
            },
        )
    for case in generated_knowledge_cases(args.generated_knowledge):
        append_case(cases, seen, case)
    for case_id, prompt, outputs in MODEL_REWRITE_CASES:
        case: dict[str, Any] = {
            "id": case_id,
            "lane": "model_rewrite",
            "prompt": prompt,
            "must_use_model": True,
            "max_total_ms": args.max_model_ms,
        }
        if len(outputs) == 1:
            case["expected"] = outputs[0]
        else:
            case["one_of"] = outputs
        append_case(cases, seen, case)
    min_total = max(args.min_total, min(len(cases), args.min_total))
    return {
        "schema_version": 3,
        "description": "Browser-run model inference launch gate generated from deterministic teacher cases.",
        "thresholds": {
            "min_total": min_total,
            "min_model_cases": len(MODEL_REWRITE_CASES),
            "min_used_model": len(MODEL_REWRITE_CASES),
            "required_lanes": [
                "fixed",
                "personal_world",
                "common_knowledge",
                "boundary",
                "unknown",
                "philosophy",
                "reasoning",
                "multi_turn",
                "model_rewrite",
            ],
        },
        "cases": cases,
        "forbidden_output_patterns": FORBIDDEN_OUTPUT_PATTERNS,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build expanded browser model-gate cases.")
    parser.add_argument("--generated-knowledge", type=int, default=80)
    parser.add_argument("--min-total", type=int, default=480)
    parser.add_argument("--max-model-ms", type=int, default=10000)
    parser.add_argument("--web-out", default=str(WEB_OUT))
    parser.add_argument("--training-out", default=str(TRAINING_OUT))
    args = parser.parse_args()
    payload = build_cases(args)
    for raw_path in (args.web_out, args.training_out):
        write_json(Path(raw_path), payload)
    print(json.dumps({"cases": len(payload["cases"]), "thresholds": payload["thresholds"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
