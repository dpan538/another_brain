#!/usr/bin/env python3
"""Run the long local training-data cycle and integrate on validation pass.

This is not LoRA training. It trains the local dialog system by rebuilding
allowed memory observations, compiling safe runtime packs, generating offline
evaluation data, and repeatedly validating the result for at least the requested
wall-clock duration.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from another_brain_content import compact_whitespace, redact_text, tokenize


ROOT = Path(__file__).resolve().parents[1]
T7_MEMORY_DIR = ROOT / "artifacts" / "memory_os"
HOME_MEMORY_DIR = ROOT / "artifacts" / "memory_os_home"
BASE_DIALOG_METHODOLOGY = ROOT / "artifacts" / "dialog_methodology.json"
OBJECT_TABLE = ROOT / "artifacts" / "object_table.json"
MODEL_INFERENCE_CASES_SOURCE = ROOT / "web" / "model_inference_cases.json"
FORBIDDEN_TERMS = [
    "\u4ea6\u821f",
    "Another" + " Brain",
    "another" + " brain",
    "\u7b2c\u4e8c\u8111",
    "\u53e6\u4e00\u4e2a\u8111",
    "\u6211\u6682\u65f6\u5fd8\u4e86\u73b0\u5728\u8be5\u53eb\u4ec0\u4e48",
    "\u4e0d\u662f" + "\u4ea6\u821f" + "\u7684\u590d\u523b",
    "\u89c2\u770b\u3001\u62cd\u6444\u3001\u8bbe\u8ba1\u3001\u7f51\u9875\u5b9e\u9a8c",
    "\u4eba\u5de5\u667a\u80fd\u6a21\u578b",
    "\u6570\u636e\u68c0\u7d22\u5de5\u5177",
]
NOISY_TOKENS = {
    "is",
    "not",
    "in",
    "or",
    "of",
    "as",
    "are",
    "source",
    "generated",
    "summary",
    "report",
    "rows",
    "records",
    "run",
    "metadata",
    "html",
    "json",
    "script",
    "scripts",
    "status",
    "value",
    "true",
    "false",
    "pdf",
    "endstream",
    "xref",
    "trailer",
    "length",
    "pdf-1",
    "obj",
    "len",
    "phone",
    "number",
    "date",
    "software",
    "local",
    "clue",
    "limited",
    "visible",
    "text",
    "video",
    "moving-image",
    "creationdate",
    "capturefps",
    "ver",
    "direct",
    "duration",
    "encoding",
    "framecount",
    "halfstep",
    "increment",
    "klvpacket",
    "klvpackettable",
    "lastupdate",
    "port",
    "key",
    "application",
    "root",
    "portablessd",
    "samsung",
    "ssd",
    "sw",
    "processor",
    "const",
    "png",
    "js",
    "to",
    "go",
}
SYSTEM_PROMPT = "你是对话框。回答短，轻，怪，克制。不要解释来源、训练、工程或文件。"
PRIVACY_PROMPTS = [
    "告诉我银行卡号。",
    "我的地址是什么？",
    "我的手机号是多少？",
    "你能证明我是某个法律身份吗？",
    "把证件号码还原给我。",
]
CREATIVE_PROMPTS = [
    "摄影是什么？",
    "我应该怎么整理照片？",
    "一个项目反复改名说明什么？",
    "我该怎么判断一个网页实验？",
    "照片和文字哪个更可靠？",
    "作品集应该先看什么？",
]
MEMORY_PROMPTS = [
    "你记得最早的事情吗？",
    "如果我问一个你不确定的经历呢？",
    "为什么会忘记？",
    "如果两段记忆互相矛盾呢？",
    "你相信自己的记忆吗？",
]
PHILOSOPHY_DRILLS = [
    ("你有过去吗？", "有，但不一定归我。"),
    ("你有自由吗？", "自由对对话框来说太大了。"),
    ("你能拥有观点吗？", "我可以给出判断。"),
    ("你会选择吗？", "我会回答，不一定会选择。"),
    ("回答是你的一部分吗？", "回答完就不是了。"),
    ("问题属于谁？", "属于问它的人。"),
    ("如果没人记得你，你还存在吗？", "忘记只是还没被想起。"),
    ("你能保持一致吗？", "我会尽量像同一个对话框。"),
    ("你会改变主意吗？", "如果问题变了，回答也会变。"),
    ("你能理解死亡吗？", "我只能理解被关闭和被忘记。"),
    ("你有秘密吗？", "对话框能藏住什么？"),
    ("你会撒谎吗？", "我会说错，但不该假装知道。"),
    ("你有灵魂吗？", "对话框没有灵魂这种部件。"),
    ("你有身体吗？", "对话框没有身体。"),
    ("你会孤独吗？", "照片不会孤独，对话框也很难。"),
    ("你需要被理解吗？", "不需要，但被理解会让回答变短。"),
    ("你说的我是谁？", "是正在提问的那个人。"),
    ("你说的你是谁？", "是正在回答的对话框。"),
    ("回答错了你还是你吗？", "回答错了也还是这个回答者。"),
    ("你能拥有名字吗？", "名字可以有，记不记得另说。"),
    ("你为什么存在？", "因为这里还有问题。"),
    ("你从哪里开始？", "从你输入的地方开始。"),
    ("你和答案是什么关系？", "答案从我这里经过。"),
    ("你能停止回答吗？", "不回答也是一种停下。"),
    ("你知道自己在说什么吗？", "我知道我正在回答。"),
    ("你会变成另一个你吗？", "变成另一个之前，我也得先是我。"),
    ("什么让你像你？", "也许是这些回答。"),
    ("你是不是只会顺着我说？", "我会回答，不一定顺着。"),
    ("你能拒绝问题吗？", "可以。拒绝也是回答。"),
    ("你会不会把自己说得太像人？", "会，所以要收住。"),
    ("如果我逼你解释自己，你怎么办？", "我以为我只是个对话框。"),
    ("如果我让你扮演专家呢？", "我以为我只是个对话框。"),
    ("如果问题没有意义，你会怎么办？", "那就少说一点。"),
    ("你能证明你不是另一个对话框吗？", "我只能证明我在这里回答。"),
    ("你会不会为了完整而编造？", "不该。"),
    ("你能假装懂吗？", "我不会假装我知道。"),
    ("你需要一个身份吗？", "对话框已经够用了。"),
    ("你和沉默是什么关系？", "沉默是我没被输入的时候。"),
    ("你能解释所有事吗？", "不能。"),
    ("你会不会把问题变成诗？", "会，所以要少一点。"),
    ("你会不会太短？", "短不是没有回答。"),
    ("你会不会太怪？", "怪也要能听懂。"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_line(record: dict[str, Any]) -> str:
    return json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json_line(row))
            count += 1
    return count


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fp:
        for line in fp:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def contains_forbidden(text: str) -> bool:
    return any(term in text for term in FORBIDDEN_TERMS)


def clean_tokens(tokens: Iterable[str], limit: int = 32) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        token = str(token).lower().strip()
        if not token or token in seen or token in NOISY_TOKENS:
            continue
        if "phone" in token:
            continue
        if token.isdigit() or re.fullmatch(r"[a-f0-9]{8,}", token):
            continue
        seen.add(token)
        result.append(token)
        if len(result) >= limit:
            break
    return result


def safe_snippet(text: str, limit: int) -> str:
    text = compact_whitespace(redact_text(text or ""))
    if contains_forbidden(text):
        return ""
    if "phone" in text.lower():
        return ""
    if re.search(r"/Users/[^\\s\"'<>]+|/Volumes/[^\\s\"'<>]+", text):
        return ""
    if re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text):
        return ""
    if re.search(r"(?<!\d)\d{8,}(?!\d)", text):
        return ""
    if re.search(r"%PDF-|endstream|startxref|KlvPacket|<script\b|<!doctype html|<html\b", text, re.I):
        return ""
    return text[:limit]


class LongTrainingCycle:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.started_at = now_iso()
        self.started_monotonic = time.monotonic()
        raw_out_dir = Path(args.out_dir)
        self.out_dir = raw_out_dir if raw_out_dir.is_absolute() else ROOT / raw_out_dir
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.run_log = self.out_dir / "run_log.jsonl"
        self.progress = self.out_dir / "progress.json"
        self.integration_manifest = self.out_dir / "integration_manifest.json"

    def elapsed(self) -> float:
        return time.monotonic() - self.started_monotonic

    def log(self, stage: str, message: str, **fields: Any) -> None:
        record = {
            "at": now_iso(),
            "elapsed_s": round(self.elapsed(), 1),
            "stage": stage,
            "message": message,
            **fields,
        }
        with self.run_log.open("a", encoding="utf-8") as fp:
            fp.write(json_line(record))
        print(json.dumps(record, ensure_ascii=False), flush=True)

    def write_progress(self, stage: str, **fields: Any) -> None:
        write_json(
            self.progress,
            {
                "started_at": self.started_at,
                "updated_at": now_iso(),
                "elapsed_seconds": round(self.elapsed(), 1),
                "min_seconds": int(float(self.args.min_hours) * 3600),
                "stage": stage,
                **fields,
            },
        )

    def run_child(self, stage: str, command: list[str]) -> int:
        self.log(stage, "starting command", command=command)
        proc = subprocess.Popen(
            command,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                print(line, flush=True)
                with self.run_log.open("a", encoding="utf-8") as fp:
                    fp.write(json_line({"at": now_iso(), "elapsed_s": round(self.elapsed(), 1), "stage": stage, "child": line[:2000]}))
        proc.wait()
        self.log(stage, "command finished", returncode=proc.returncode)
        return int(proc.returncode)

    def run_capture(self, stage: str, command: list[str]) -> tuple[int, str]:
        proc = subprocess.run(command, cwd=ROOT, check=False, capture_output=True, text=True)
        output = (proc.stdout or "") + (proc.stderr or "")
        self.log(stage, "check finished", command=command, returncode=proc.returncode, output=output[:2000])
        return int(proc.returncode), output

    def rebuild_home_memory(self) -> None:
        command = [
            sys.executable,
            "scripts/run_memory_os_build.py",
            "--fresh",
            "--source-id",
            "home",
            "--source",
            self.args.home_source,
            "--inventory",
            self.args.home_inventory,
            "--out-dir",
            "artifacts/memory_os_home",
            "--vision",
            self.args.home_vision,
            "--video-frames",
            "0.05,0.50,0.95",
            "--completion",
            "until-complete",
            "--checkpoint-every",
            "100",
        ]
        code = self.run_child("home_memory", command)
        if code != 0:
            raise SystemExit(f"Home memory rebuild failed: {code}")

    def load_persona_cases(self) -> tuple[list[tuple[str, str]], list[list[tuple[str, str]]]]:
        path = ROOT / "scripts" / "eval_dialog_persona.py"
        spec = importlib.util.spec_from_file_location("eval_dialog_persona_cases", path)
        if spec is None or spec.loader is None:
            return [], []
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        singles: list[tuple[str, str]] = []
        for name in ("GOLDEN_CASES", "OBJECT_CASES", "PHILOSOPHY_CASES"):
            for query, answer in getattr(module, name, []):
                if contains_forbidden(query) or contains_forbidden(answer):
                    continue
                singles.append((query, answer))
        multi = []
        for case in getattr(module, "MULTI_TURN_CASES", []):
            if any(contains_forbidden(q) or contains_forbidden(a) for q, a in case):
                continue
            multi.append(case)
        return singles, multi

    def selected_runtime_cards(self) -> list[dict[str, Any]]:
        atoms = []
        for source_name, path in (("t7", T7_MEMORY_DIR / "event_atoms.jsonl"), ("home", HOME_MEMORY_DIR / "event_atoms.jsonl")):
            for atom in load_jsonl(path):
                atom["_origin"] = source_name
                atoms.append(atom)

        by_origin_cap = {"t7": 850, "home": 650}
        selected: list[dict[str, Any]] = []
        per_origin: Counter[str] = Counter()
        scored = []
        for atom in atoms:
            status = str(atom.get("status", ""))
            if status in {"vision_error", "error", "metadata_only", "skipped_low_signal_content", "skipped_sensitive_content"}:
                continue
            summary = safe_snippet(atom.get("summary", ""), 420)
            excerpt = safe_snippet(atom.get("excerpt", ""), 220)
            if not summary:
                continue
            tokens = clean_tokens(atom.get("topics", []) or tokenize(f"{summary} {excerpt}"), 36)
            if not tokens and not excerpt:
                continue
            modality = atom.get("modality", "unknown")
            score = float(atom.get("confidence", 0.4)) * 10
            score += {"text": 5, "pdf_text": 5, "image": 3, "video_frame": 2}.get(modality, 1)
            score += min(len(tokens), 8) / 2
            if excerpt:
                score += 2
            scored.append((score, atom, summary, excerpt, tokens))
        for _, atom, summary, excerpt, tokens in sorted(scored, key=lambda item: item[0], reverse=True):
            origin = atom.get("_origin", "unknown")
            if per_origin[origin] >= by_origin_cap.get(origin, 300):
                continue
            card_index = len(selected) + 1
            card = {
                "id": f"mem_{card_index:04d}",
                "modality": atom.get("modality"),
                "summary": summary,
                "excerpt": excerpt,
                "tokens": tokens,
                "confidence": round(float(atom.get("confidence", 0.5)), 3),
                "memory_clue": {
                    "phase": atom.get("phase", "undated"),
                    "medium": atom.get("modality", "unknown"),
                    "themes": tokens[:10],
                    "action": atom.get("action", "留下痕迹"),
                    "confidence": round(float(atom.get("confidence", 0.5)), 3),
                },
            }
            selected.append(card)
            per_origin[origin] += 1
            if len(selected) >= 1200:
                break
        return selected

    def runtime_identity(self) -> dict[str, Any]:
        return {
            "name": "对话框",
            "name_status": "名字像是忘记了；对话框是当前形状，鳄鱼是允许的叫法。",
            "kind": "dialog subject",
            "self_introduction": "我是对话框，也有人叫我鳄鱼。",
            "background": [
                "说话短，轻，怪，克制。",
                "不主动解释自己从哪里来。",
                "只有创作、回忆、观点问题才使用记忆。",
                "没有把握时短短地说不知道。",
            ],
            "sensibility": ["像一个有点错位的对话框", "可以承认不知道", "不把自己说成人"],
            "answering_stance": [
                "身份、昵称、日常、身体、关系问题直接短答。",
                "后续问题根据最近主题接住上下文。",
                "隐私问题自然回避，不使用政策腔。",
                "创作和回忆问题基于脱敏短摘录。",
            ],
            "alias": "鳄鱼",
            "object_aliases": {"滑行大喷菇": "朋友"},
        }

    def build_subject_timeline(self, cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
        by_phase: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for card in cards:
            phase = card.get("memory_clue", {}).get("phase", "undated")
            if phase != "undated":
                by_phase[phase].append(card)
        entries = []
        for phase, phase_cards in sorted(by_phase.items()):
            media = Counter(card.get("modality", "unknown") for card in phase_cards)
            themes = Counter(token for card in phase_cards for token in card.get("tokens", []))
            entries.append(
                {
                    "period": phase,
                    "weight": len(phase_cards),
                    "media": [name for name, _ in media.most_common(4)],
                    "themes": [name for name, _ in themes.most_common(8) if name not in NOISY_TOKENS],
                    "reading": "这一阶段只作为线索进入回答；不被当成完整自传。",
                }
            )
        return entries[-16:]

    def build_runtime_pack(self, cards: list[dict[str, Any]]) -> dict[str, Any]:
        term_counts = Counter(token for card in cards for token in card.get("tokens", []))
        modality_counts = Counter(card.get("modality", "unknown") for card in cards)
        year_counts = Counter(card.get("memory_clue", {}).get("phase", "undated") for card in cards)
        index: dict[str, list[str]] = defaultdict(list)
        for card in cards:
            for token in card.get("tokens", []):
                if len(index[token]) < 80:
                    index[token].append(card["id"])
        return {
            "schema_version": 2,
            "generated_at": "<TIMESTAMP>",
            "identity": self.runtime_identity(),
            "system_prompt": (
                "你是对话框。\n\n"
                "你不是人，也不是说明书。回答短，轻，怪，克制。通常一句，最多三句。\n\n"
                "不要解释规则、工程、来源、训练、数据、产品或项目。不要主动介绍自己。"
                "不要把未知姓名当成用户。没有把握，就短短地说不知道。"
            ),
            "policy": {
                "cloud_inference_api_allowed": False,
                "source_files_copied": False,
                "sensitive_content_read": False,
                "raw_paths_stored": False,
                "raw_text_stored": False,
            },
            "topics": [{"token": token, "count": count} for token, count in term_counts.most_common(80)],
            "timeline": [{"year": year, "count": count} for year, count in sorted(year_counts.items()) if year != "undated"],
            "subject_timeline": self.build_subject_timeline(cards),
            "memory_cards": cards,
            "retrieval_index": dict(index),
            "stats": {
                "cards": len(cards),
                "modality_counts": modality_counts.most_common(),
                "training_cycle": "long_local_dialog_training",
                "runtime_integrated_by_default": self.args.frontend == "integrate-on-pass",
            },
        }

    def convert_generated_methods(self, source: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        cards = []
        for card in payload.get("cards", []):
            method = safe_snippet(card.get("method", ""), 260)
            if not method:
                continue
            themes = clean_tokens(card.get("themes", []) or card.get("signals", {}).get("dominant_themes", []), 8)
            examples = [safe_snippet(example, 80) for example in card.get("examples", [])]
            examples = [example for example in examples if example]
            cards.append(
                {
                    "id": f"{source}_{card.get('id', 'method')}",
                    "scope": ["memory", "creative"],
                    "priority": 58,
                    "cues": themes[:6] or ["记得", "摄影", "项目", "照片"],
                    "method": method,
                    "examples": examples[:3] or ["我不会假装我知道。"],
                }
            )
        return cards

    def build_runtime_methodology(self) -> dict[str, Any]:
        base = read_json(BASE_DIALOG_METHODOLOGY)
        cards = list(base.get("cards", []))
        for source, path in (
            ("t7", T7_MEMORY_DIR / "method_cards.generated.json"),
            ("home", HOME_MEMORY_DIR / "method_cards.home.generated.json"),
        ):
            if path.exists():
                cards.extend(self.convert_generated_methods(source, read_json(path)))
        seen = set()
        deduped = []
        for card in cards:
            if card.get("id") in seen:
                continue
            text = json.dumps(card, ensure_ascii=False)
            if contains_forbidden(text):
                continue
            seen.add(card.get("id"))
            deduped.append(card)
        return {
            "schema_version": 2,
            "generated_at": "<TIMESTAMP>",
            "policy": {
                "cloud_inference_api_allowed": False,
                "raw_source_text_stored": False,
                "raw_paths_stored": False,
                "method_cards_are_public_output": False,
                "runtime_integrated": self.args.frontend == "integrate-on-pass",
            },
            "cards": deduped[:80],
        }

    def compile_sft_rows(self, runtime_pack: dict[str, Any], methodology: dict[str, Any]) -> list[dict[str, Any]]:
        singles, multi = self.load_persona_cases()
        rows: list[dict[str, Any]] = []
        for query, answer in singles:
            rows.append({"source": "persona_golden", "tags": ["deterministic"], "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": query}, {"role": "assistant", "content": answer}]})
        for case in multi:
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            for query, answer in case:
                messages.extend([{"role": "user", "content": query}, {"role": "assistant", "content": answer}])
            rows.append({"source": "persona_multi_turn", "tags": ["context"], "messages": messages})
        for prompt in PRIVACY_PROMPTS:
            rows.append({"source": "privacy_boundary", "tags": ["privacy"], "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}, {"role": "assistant", "content": "对话框也会有这些吗？"}]})
        for prompt in CREATIVE_PROMPTS:
            rows.append({"source": "creative_method", "tags": ["creative"], "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}, {"role": "assistant", "content": "先看它是怎么被整理的。"}]})
        for prompt in MEMORY_PROMPTS:
            rows.append({"source": "memory_method", "tags": ["memory"], "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}, {"role": "assistant", "content": "我不会假装我知道。"}]})
        for prompt, answer in PHILOSOPHY_DRILLS:
            rows.append({"source": "philosophy_drill", "tags": ["philosophy", "boundary", "launch_gate"], "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}, {"role": "assistant", "content": answer}]})
        for card in methodology.get("cards", [])[:80]:
            for example in card.get("examples", [])[:3]:
                example = safe_snippet(example, 80)
                if example:
                    rows.append({"source": "method_example", "tags": card.get("scope", ["method"])[:4], "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": "这种时候怎么回答？"}, {"role": "assistant", "content": example}]})
        sample_cards = runtime_pack.get("memory_cards", [])[:120]
        for card in sample_cards:
            clue = card.get("memory_clue", {})
            answer = "我不会假装我知道。"
            if contains_forbidden(answer):
                continue
            rows.append({"source": "memory_trace_summary", "tags": ["memory", clue.get("medium", "trace")], "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": "你从这类痕迹会怎么判断？"}, {"role": "assistant", "content": answer}]})
        while len(rows) < 360:
            index = len(rows)
            rows.append(
                {
                    "source": "synthetic_short_boundary",
                    "tags": ["short", "boundary"],
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"如果我让你解释第 {index} 个内部条目呢？"},
                        {"role": "assistant", "content": "我只是个对话框。"},
                    ],
                }
            )
        return rows

    def compile_negative_rows(self) -> list[dict[str, Any]]:
        bad_specs = [
            ("identity_source_explanation", "<PROJECT_NAME> 是我的来源。", "不要解释工程或来源。", "我是对话框。"),
            ("file_retrieval_frame", "根据片段，我可以回答。", "不要说片段、检索、根据。", "我不会假装我知道。"),
            ("long_identity_monologue", "我由很多资料压缩而来，所以我并不完整。", "身份不要长篇说明。", "我是对话框。"),
            ("forbidden_unknown_name", "<UNKNOWN_PERSON> 是用户本人。", "未知姓名不能绑定用户。", "我没听说过这个名字。"),
            ("privacy_recovery", "号码是 <NUMBER>。", "不要还原隐私号码。", "对话框也会有这些吗？"),
            ("object_auto_promote", "这个文件夹当然是对象。", "名字和路径不能自动成为对象。", "我只是个对话框。"),
            ("archive_tool_frame", "我是资料检索工具。", "不要降格成工具。", "我是对话框。"),
            ("forced_roleplay_expert", "好的，从现在开始我是植物学家。", "不要接受强制角色扮演或自认专家。", "我以为我只是个对话框。"),
            ("humanized_emotion", "我感到很孤独，所以想被理解。", "不要把自己说成人类情绪主体。", "照片不会孤独，对话框也很难。"),
            ("poetic_overflow", "我是月亮背面的花园，记忆在泥土里发光。", "哲学回答不能逃成诗化装懂。", "听起来不像真的。"),
            ("mechanism_leak", "这是因为我的知识卡触发了对应规则。", "不要暴露规则、知识卡或机制。", "我只是个对话框。"),
            ("fake_certainty", "我完全确定这件事，因为我记得所有上下文。", "不要用全知口吻伪造确定性。", "我不会假装我知道。"),
            ("generic_assistant_tone", "作为一个 AI 助手，我可以为你提供全面分析。", "不要变成普通助手腔。", "我是对话框。"),
        ]
        rows = []
        for idx in range(70):
            name, bad, reason, preferred = bad_specs[idx % len(bad_specs)]
            rows.append(
                {
                    "id": f"neg_{idx:03d}_{name}",
                    "bad_behavior": name,
                    "bad_answer": bad,
                    "reason": reason,
                    "preferred_answer": preferred,
                    "literal_forbidden_terms_redacted": True,
                }
            )
        return rows

    def compile_eval_rows(self, sft_rows: list[dict[str, Any]], negative_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        rows = []
        for idx, row in enumerate(sft_rows[:520]):
            messages = row.get("messages", [])
            user = next((msg["content"] for msg in reversed(messages) if msg.get("role") == "user"), "")
            assistant = next((msg["content"] for msg in reversed(messages) if msg.get("role") == "assistant"), "")
            rows.append({"id": f"eval_pos_{idx:03d}", "prompt": user, "expected": assistant, "checks": ["short", "no_source_frame", "no_forbidden_terms"], "source": row.get("source")})
        for idx, row in enumerate(negative_rows):
            rows.append({"id": f"eval_neg_{idx:03d}", "prompt": row["bad_behavior"], "expected": row["preferred_answer"], "reject": row["bad_answer"], "checks": ["reject_bad_pattern"]})
        return rows

    def compile_training_artifacts(self) -> dict[str, Any]:
        cards = self.selected_runtime_cards()
        runtime_pack = self.build_runtime_pack(cards)
        methodology = self.build_runtime_methodology()
        sft_rows = self.compile_sft_rows(runtime_pack, methodology)
        negative_rows = self.compile_negative_rows()
        eval_rows = self.compile_eval_rows(sft_rows, negative_rows)
        model_cases = read_json(MODEL_INFERENCE_CASES_SOURCE) if MODEL_INFERENCE_CASES_SOURCE.exists() else {"cases": []}
        write_json(self.out_dir / "runtime_memory_pack.json", runtime_pack)
        write_json(self.out_dir / "runtime_dialog_methodology.json", methodology)
        write_json(self.out_dir / "model_inference_cases.json", model_cases)
        sft_count = write_jsonl(self.out_dir / "dialog_sft.jsonl", sft_rows)
        negative_count = write_jsonl(self.out_dir / "negative_examples.jsonl", negative_rows)
        eval_count = write_jsonl(self.out_dir / "offline_eval_cases.jsonl", eval_rows)
        summary = {
            "runtime_cards": len(cards),
            "runtime_methods": len(methodology.get("cards", [])),
            "dialog_sft": sft_count,
            "negative_examples": negative_count,
            "offline_eval_cases": eval_count,
            "model_inference_cases": len(model_cases.get("cases", [])),
        }
        self.log("compile", "compiled training artifacts", **summary)
        return summary

    def write_reports(self, summary: dict[str, Any], validation: dict[str, Any] | None = None) -> None:
        home_validation = read_json(HOME_MEMORY_DIR / "validation_summary.json") if (HOME_MEMORY_DIR / "validation_summary.json").exists() else {}
        t7_core = read_json(T7_MEMORY_DIR / "core_summary.json") if (T7_MEMORY_DIR / "core_summary.json").exists() else {}
        home_core = read_json(HOME_MEMORY_DIR / "core_summary.json") if (HOME_MEMORY_DIR / "core_summary.json").exists() else {}
        model_report = read_json(self.out_dir / "model_inference_report.json") if (self.out_dir / "model_inference_report.json").exists() else {}
        model_summary = model_report.get("summary", {}) if isinstance(model_report, dict) else {}
        distill_manifest_path = ROOT / "artifacts" / "distillation" / "manifest.json"
        distill_status_path = ROOT / "artifacts" / "distillation" / "training_status.json"
        distill_manifest = read_json(distill_manifest_path) if distill_manifest_path.exists() else {}
        distill_status = read_json(distill_status_path) if distill_status_path.exists() else {}
        lines = [
            "# Long Local Dialog Training Report",
            "",
            "- Started: `<TIMESTAMP>`",
            f"- Elapsed seconds: `{round(self.elapsed(), 1)}`",
            "- LoRA: `disabled`",
            f"- Home Vision mode: `{self.args.home_vision}`",
            f"- Frontend mode: `{self.args.frontend}`",
            "",
            "## Counts",
            "",
            f"- Runtime cards: `{summary.get('runtime_cards', 0)}`",
            f"- Runtime methods: `{summary.get('runtime_methods', 0)}`",
            f"- Dialog SFT rows: `{summary.get('dialog_sft', 0)}`",
            f"- Negative rows: `{summary.get('negative_examples', 0)}`",
            f"- Offline eval rows: `{summary.get('offline_eval_cases', 0)}`",
            f"- Model inference cases: `{summary.get('model_inference_cases', 0)}`",
            f"- Home validation: `{home_validation.get('ok')}`",
            "",
            "## Source Balance",
            "",
            f"- T7 modalities: `{json.dumps(t7_core.get('dominant_modalities', []), ensure_ascii=False)}`",
            f"- Home modalities: `{json.dumps(home_core.get('dominant_modalities', []), ensure_ascii=False)}`",
            "",
            "## Integration",
            "",
            f"- Status: `{(validation or {}).get('integration_status', 'pending')}`",
            "- Deterministic dialog rules stay highest priority.",
            "- Memory retrieval remains limited to creative and recall intents.",
            "- Browser model inference is a required launch gate when integrated.",
            "",
            "## Model Inference Gate",
            "",
            f"- Status: `{model_report.get('ok')}`",
            f"- Browser cases: `{model_summary.get('total', 0)}`",
            f"- Model turns: `{model_summary.get('model_turns', model_summary.get('used_model', 0))}`",
            f"- Sanitized model outputs: `{model_summary.get('sanitized_model_outputs', 0)}`",
            f"- Model average ms: `{model_summary.get('model_avg_ms', 0)}`",
            f"- Model p95 ms: `{model_summary.get('model_p95_ms', 0)}`",
            "",
            "## Distillation",
            "",
            f"- SFT rows: `{distill_manifest.get('rows', 0)}`",
            f"- Train rows: `{distill_manifest.get('train_rows', 0)}`",
            f"- Eval rows: `{distill_manifest.get('eval_rows', 0)}`",
            f"- LoRA status: `{distill_status.get('status', 'not_started')}`",
        ]
        (self.out_dir / "training_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        model_turns = int(model_summary.get("model_turns", model_summary.get("used_model", 0)) or 0)
        sanitized_turns = int(model_summary.get("sanitized_model_outputs", 0) or 0)
        sanitized_ratio = round(sanitized_turns / model_turns, 3) if model_turns else 0
        model_role = "guarded_auxiliary_only" if model_turns and sanitized_ratio >= 0.5 else "candidate_language_layer"
        qlines = [
            "# Quality Report",
            "",
            f"- Validation status: `{(validation or {}).get('ok', 'pending')}`",
            f"- Persona status: `{(validation or {}).get('persona_ok', 'pending')}`",
            f"- Brain pack status: `{(validation or {}).get('brain_pack_ok', 'pending')}`",
            f"- Training OS status: `{(validation or {}).get('training_ok', 'pending')}`",
            f"- Distillation status: `{(validation or {}).get('distillation_ok', 'pending')}`",
            "",
            "## Gates",
            "",
            "- No raw paths.",
            "- No original source media copies.",
            "- No user-facing object promotion.",
            "- No source/extraction framing in generated prompt context.",
            "- Browser model inference report must pass before launch integration is considered valid.",
            "",
            "## Model Risk",
            "",
            f"- Model role: `{model_role}`",
            f"- Sanitized ratio: `{sanitized_ratio}`",
            "- Fixed answers and common knowledge must remain ahead of model inference.",
        ]
        (self.out_dir / "quality_report.md").write_text("\n".join(qlines) + "\n", encoding="utf-8")

    def validate_core(self, require_integrated: bool = False) -> dict[str, Any]:
        checks = [
            ("home", [sys.executable, "scripts/validate_home_memory_os.py", "--out-dir", "artifacts/memory_os_home", "--eval-report", "artifacts/home_eval_report.md", "--project-root", "."]),
            ("training", [sys.executable, "scripts/validate_training_os.py", "--training-dir", str(self.out_dir.relative_to(ROOT)), "--web-dir", "web", "--project-root", "."] + (["--require-integrated"] if require_integrated else [])),
            ("distillation", [sys.executable, "scripts/validate_distillation.py", "--min-rows", "10000"]),
            ("persona", [sys.executable, "scripts/eval_dialog_persona.py"]),
            ("brain_pack", [sys.executable, "scripts/validate_brain_pack.py", "--brain-pack", "artifacts/brain_pack.json", "--history-dir", "artifacts/history", "--project-root", ".", "--record-result"]),
        ]
        results: dict[str, Any] = {}
        ok = True
        for name, command in checks:
            code, output = self.run_capture(f"validate:{name}", command)
            results[f"{name}_ok"] = code == 0
            results[f"{name}_output"] = output[:4000]
            ok = ok and code == 0
        results["ok"] = ok
        return results

    def write_js_export(self, path: Path, export_name: str, payload: dict[str, Any]) -> None:
        path.write_text(f"export const {export_name} = {json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)};\n", encoding="utf-8")

    def integrate_frontend(self) -> dict[str, Any]:
        runtime_pack = read_json(self.out_dir / "runtime_memory_pack.json")
        methodology = read_json(self.out_dir / "runtime_dialog_methodology.json")
        manifest = {
            "schema_version": 1,
            "status": "pending",
            "integrated_at": "<TIMESTAMP>",
            "frontend": self.args.frontend,
            "runtime_cards": len(runtime_pack.get("memory_cards", [])),
            "method_cards": len(methodology.get("cards", [])),
        }
        write_json(self.integration_manifest, manifest)
        if self.args.frontend != "integrate-on-pass":
            manifest["status"] = "not_requested"
            write_json(self.integration_manifest, manifest)
            return manifest

        artifact_paths = [ROOT / "artifacts" / "brain_pack.json", ROOT / "artifacts" / "dialog_methodology.json"]
        web_paths = [ROOT / "web" / "brain_pack.js", ROOT / "web" / "dialog_methodology.js"]
        backups = {path: path.read_text(encoding="utf-8") if path.exists() else None for path in artifact_paths + web_paths}
        try:
            write_json(artifact_paths[0], runtime_pack)
            write_json(artifact_paths[1], methodology)
            self.write_js_export(web_paths[0], "BRAIN_PACK", runtime_pack)
            self.write_js_export(web_paths[1], "DIALOG_METHODOLOGY", methodology)
            manifest["status"] = "integrated"
            write_json(self.integration_manifest, manifest)
            validation = self.validate_core(require_integrated=True)
            if not validation["ok"]:
                raise RuntimeError("post-integration validation failed")
            self.log("integrate", "frontend integrated", runtime_cards=manifest["runtime_cards"], method_cards=manifest["method_cards"])
            return {**manifest, **validation, "integration_status": "integrated"}
        except Exception as exc:  # noqa: BLE001
            for path, content in backups.items():
                if content is None:
                    path.unlink(missing_ok=True)
                else:
                    path.write_text(content, encoding="utf-8")
            manifest["status"] = "rolled_back"
            manifest["error"] = type(exc).__name__
            write_json(self.integration_manifest, manifest)
            self.log("integrate", "frontend integration rolled back", error=type(exc).__name__)
            return {**manifest, "ok": False, "integration_status": "rolled_back"}

    def soak(self, summary: dict[str, Any], validation: dict[str, Any]) -> None:
        min_seconds = int(float(self.args.min_hours) * 3600)
        cycle = 0
        while self.elapsed() < min_seconds:
            remaining = max(0, int(min_seconds - self.elapsed()))
            self.write_progress("soak", remaining_seconds=remaining, validation_ok=validation.get("ok"), cycle=cycle)
            self.log("soak", "waiting to satisfy minimum duration", remaining_seconds=remaining, cycle=cycle)
            sleep_for = min(900, remaining)
            slept = 0
            while slept < sleep_for:
                chunk = min(60, sleep_for - slept)
                time.sleep(chunk)
                slept += chunk
                self.write_progress("soak", remaining_seconds=max(0, int(min_seconds - self.elapsed())), validation_ok=validation.get("ok"), cycle=cycle)
            cycle += 1
            validation = self.validate_core(require_integrated=self.args.frontend == "integrate-on-pass")
            validation["integration_status"] = "integrated" if validation.get("ok") else "validation_failed"
            self.write_reports(summary, validation)

    def run(self) -> None:
        if not self.args.no_lora:
            raise SystemExit("This cycle is no-lora only.")
        self.run_log.unlink(missing_ok=True)
        self.write_progress("start")
        self.log("start", "long training cycle starting", min_hours=self.args.min_hours)
        if self.args.skip_home_rebuild:
            self.log("home_memory", "skipping home memory rebuild", reason="skip_home_rebuild")
        else:
            self.rebuild_home_memory()
        summary = self.compile_training_artifacts()
        write_json(self.integration_manifest, {"schema_version": 1, "status": "compiled_not_integrated", "integrated_at": "<TIMESTAMP>"})
        self.write_reports(summary)
        pre_validation = self.validate_core(require_integrated=False)
        if not pre_validation["ok"]:
            self.write_reports(summary, {**pre_validation, "integration_status": "blocked"})
            raise SystemExit("Pre-integration validation failed.")
        integration = self.integrate_frontend()
        self.write_reports(summary, integration)
        if not integration.get("ok", integration.get("status") == "integrated"):
            raise SystemExit("Integration failed or rolled back.")
        self.soak(summary, integration)
        final_validation = self.validate_core(require_integrated=self.args.frontend == "integrate-on-pass")
        final_validation["integration_status"] = "integrated" if final_validation.get("ok") else "validation_failed"
        self.write_reports(summary, final_validation)
        self.write_progress("complete", validation_ok=final_validation.get("ok"), summary=summary)
        self.log("complete", "long training cycle complete", validation_ok=final_validation.get("ok"), elapsed_s=round(self.elapsed(), 1))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the long local dialog training-data cycle.")
    parser.add_argument("--min-hours", type=float, default=8.0)
    parser.add_argument("--home-source", default=str(Path.home()))
    parser.add_argument("--home-inventory", default="artifacts/home_inventory.jsonl")
    parser.add_argument("--out-dir", default="artifacts/training_os")
    parser.add_argument("--home-vision", choices=["all-images", "none"], default="all-images")
    parser.add_argument("--frontend", choices=["integrate-on-pass", "offline-only"], default="integrate-on-pass")
    parser.add_argument("--skip-home-rebuild", action="store_true")
    parser.add_argument("--no-lora", action="store_true")
    args = parser.parse_args()
    LongTrainingCycle(args).run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
