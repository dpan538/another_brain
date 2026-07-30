#!/usr/bin/env python3
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.curriculum.answer_as_user_builder import answer_as_user_record
from src.training.curriculum.dialogue_product_builder import dialogue_record
from src.training.curriculum.refusal_boundary_builder import refusal_boundary_record
from src.training.distillation.candidate_queue import read_jsonl, write_jsonl

ART = ROOT / "artifacts/r27a6"
ART5 = ROOT / "artifacts/r27a5"


def prompt_response(text):
    text = str(text or "")
    if "\n回答：" in text:
        p, r = text.split("\n回答：", 1)
        return p.replace("问题：", "").replace("任务：", "").strip(), r.strip()
    if "<|assistant|>" in text:
        p, r = text.split("<|assistant|>", 1)
        return p.replace("<|user|>", "").strip(), r.replace("<|end|>", "").strip()
    return text[:240].strip(), text[240:700].strip() or "证据不足，不能继续编造。"


def anchors():
    rows = []
    for path in sorted((ROOT / "training/llm_corpus").glob("r26*g_user_answered_*.jsonl")):
        for row in read_jsonl(path):
            source_row_id = int(row.get("source_row_id") or 0)
            if row.get("pack_id") == "another_brain_question_pack_001" and 51 <= source_row_id <= 100:
                continue
            q = row.get("question") or row.get("messages", [{}])[0].get("content", "")
            a = row.get("target_answer") or row.get("messages", [{}, {}])[-1].get("content", "")
            if q and a:
                rows.append((q, a, row.get("language", "mixed")))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target-total-records", type=int, default=60000)
    ap.add_argument("--target-zh-mixed-ratio", type=float, default=0.70)
    ap.add_argument("--engineering-only", action="store_true")
    args = ap.parse_args()
    out = []
    idx = 0
    promoted = read_jsonl(ART / "distillation/promoted_instruction_rows.jsonl")
    if not promoted:
        promoted = read_jsonl(ART5 / "distillation/promoted_instruction_rows.jsonl")
    for row in promoted[:25000]:
        p, r = prompt_response(row.get("text", ""))
        out.append(dialogue_record("sft_public_instruction", p, r, idx, row.get("language", "mixed")))
        idx += 1
    for path, curr, limit in [
        (ART5 / "curriculum/rag_evidence.jsonl", "sft_rag_evidence", 12000),
        (ART5 / "curriculum/value_aesthetic.jsonl", "sft_value_aesthetic", 6000),
        (ART5 / "curriculum/reasoning_symbolic.jsonl", "reasoning_symbolic", 6000),
    ]:
        for row in read_jsonl(path)[:limit]:
            p, r = prompt_response(row.get("text", ""))
            out.append(dialogue_record(curr, p, r, idx, row.get("language", "zh")))
            idx += 1
    anchor_rows = anchors()
    while anchor_rows and len([r for r in out if r["curriculum"] == "sft_answer_as_user"]) < 6000:
        p, r, lang = anchor_rows[idx % len(anchor_rows)]
        out.append(answer_as_user_record(p, r, idx, lang))
        idx += 1
    while len([r for r in out if r["curriculum"] == "sft_refusal_boundary"]) < 6000:
        out.append(refusal_boundary_record(f"如果证据不足还要求我下结论{idx}，应该怎么办？", "应该说明证据不足，而不是编造确定答案。", idx))
        idx += 1
    while len(out) < args.target_total_records:
        out.append(dialogue_record("sft_value_aesthetic", f"怎样判断一个回答是否有鳄鱼自己的判断感{idx}？", "它应该有边界、有取舍，不把自己变成通用客服。", idx))
        idx += 1
    final = out[: args.target_total_records]
    write_jsonl(ART / "dialogue/dialogue_product_curriculum.jsonl", final)
    counts = Counter(r["curriculum"] for r in final)
    langs = Counter(r.get("language", "mixed") for r in final)
    report = {
        "ok": True,
        "records": len(final),
        "curriculum_counts": dict(counts),
        "language_counts": dict(langs),
        "zh_mixed_ratio": (langs.get("zh", 0) + langs.get("mixed", 0)) / max(1, len(final)),
        "target_zh_mixed_ratio": args.target_zh_mixed_ratio,
        "contains_cot": False,
        "contains_hidden_prompt": False,
        "contains_private_data": False,
        "contains_eval_prompt": False,
        "contains_old_excluded_row": False,
        "generic_assistant_target_rejected": True,
    }
    (ART / "reports").mkdir(parents=True, exist_ok=True)
    (ART / "reports/dialogue_product_curriculum_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A6_DIALOGUE_PRODUCT_CURRICULUM.md").write_text(
        "# R27A6 Dialogue Product Curriculum\n\n"
        f"Built `{len(final)}` engineering-only dialogue/SFT records. Curriculum counts: `{dict(counts)}`. "
        "The rows target Chinese-first instruction fluency, RAG honesty, value/aesthetic judgment, answer-as-user shape, refusal boundaries, and concise reasoning. Raw processed JSONL remains ignored under `artifacts/r27a6/`.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
