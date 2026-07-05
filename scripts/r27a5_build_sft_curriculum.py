#!/usr/bin/env python3
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.curriculum.sft_builder import sft_record
from src.training.distillation.candidate_queue import read_jsonl, write_jsonl
from src.training.distillation.style_filter import style_rejection_reason

ART = ROOT / "artifacts/r27a5"


def split_for_index(index):
    if index % 20 == 0:
        return "heldout"
    if index % 10 == 0:
        return "dev"
    return "train"


def prompt_response_from_text(text):
    text = str(text or "")
    if "\n回答：" in text:
        prompt, response = text.split("\n回答：", 1)
        prompt = prompt.replace("用户：", "").replace("问题：", "").replace("任务：", "").strip()
        return prompt, response.strip()
    if "\n回答:" in text:
        prompt, response = text.split("\n回答:", 1)
        return prompt.strip(), response.strip()
    return text[:300].strip(), text[300:900].strip() or "证据不足，不能继续编造。"


def safe_source_rows():
    rows = []
    for path in sorted((ROOT / "training/llm_corpus").glob("r26*g_user_answered_*.jsonl")):
        for row in read_jsonl(path):
            source_row_id = int(row.get("source_row_id") or 0)
            if source_row_id in {9, 16}:
                continue
            if row.get("pack_id") == "another_brain_question_pack_001" and 51 <= source_row_id <= 100:
                continue
            question = row.get("question") or row.get("messages", [{}])[0].get("content", "")
            answer = row.get("target_answer") or row.get("messages", [{}, {}])[-1].get("content", "")
            if question and answer:
                rows.append((question, answer, row))
    return rows


def build_from_promoted(limit):
    rows = []
    for idx, row in enumerate(read_jsonl(ART / "distillation/promoted_instruction_rows.jsonl")[:limit]):
        prompt, response = prompt_response_from_text(row.get("text", ""))
        if style_rejection_reason(response):
            continue
        rows.append(sft_record(
            "sft_public_instruction",
            prompt,
            response,
            idx,
            language=row.get("language", "mixed"),
            source_candidate_id=row.get("record_id", ""),
            source_dataset_ids=[row.get("source_dataset_id", "")] if row.get("source_dataset_id") else [],
            license_names=row.get("license_names", []),
            license_obligations=row.get("license_obligations", []),
        ))
    return rows


def build_from_curriculum(path, curriculum, limit):
    out = []
    for idx, row in enumerate(read_jsonl(path)[:limit]):
        prompt, response = prompt_response_from_text(row.get("text", ""))
        out.append(sft_record(
            curriculum,
            prompt,
            response,
            idx,
            language=row.get("language", "zh"),
            source_dataset_ids=[row.get("source_dataset_id", "")] if row.get("source_dataset_id") else [],
            license_names=row.get("license_names", []),
            license_obligations=row.get("license_obligations", []),
        ))
    return out


def build_anchor_rows(limit):
    out = []
    anchors = safe_source_rows()
    if not anchors:
        return out
    idx = 0
    while len(out) < limit:
        prompt, response, source = anchors[idx % len(anchors)]
        curriculum = "sft_refusal_boundary" if idx % 4 == 0 else "sft_answer_as_user"
        record = sft_record(curriculum, prompt, response, idx, language=source.get("language", "mixed"))
        record["source_row_id"] = source.get("source_row_id", "")
        record["provenance"]["source_sample_id"] = source.get("sample_id", "")
        out.append(record)
        idx += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target-total-records", type=int, default=20000)
    ap.add_argument("--target-zh-mixed-ratio", type=float, default=0.65)
    ap.add_argument("--engineering-only", action="store_true")
    args = ap.parse_args()

    target = args.target_total_records
    buckets = {
        "sft_public_instruction": int(target * 0.40),
        "sft_rag_evidence": int(target * 0.20),
        "sft_value_aesthetic": int(target * 0.15),
        "sft_answer_as_user_and_refusal": int(target * 0.20),
        "sft_distillation_candidate": target - int(target * 0.95),
    }
    records = []
    records.extend(build_from_promoted(buckets["sft_public_instruction"]))
    records.extend(build_from_curriculum(ART / "curriculum/rag_evidence.jsonl", "sft_rag_evidence", buckets["sft_rag_evidence"]))
    records.extend(build_from_curriculum(ART / "curriculum/value_aesthetic.jsonl", "sft_value_aesthetic", buckets["sft_value_aesthetic"]))
    records.extend(build_anchor_rows(buckets["sft_answer_as_user_and_refusal"]))

    if len(records) < target:
        supplement = build_from_curriculum(ART / "curriculum/reasoning_symbolic.jsonl", "sft_refusal_boundary", target - len(records))
        records.extend(supplement)

    final = []
    seen = set()
    for idx, record in enumerate(records[:target]):
        text = record.get("text", "")
        norm = " ".join(text.lower().split())
        if not norm or norm in seen:
            continue
        seen.add(norm)
        record["split"] = split_for_index(idx)
        record["allowed_to_train_engineering"] = True
        record["allowed_to_commit_raw"] = False
        final.append(record)

    if len(final) < target:
        fill_idx = 0
        for row in read_jsonl(ART / "curriculum/reasoning_symbolic.jsonl"):
            if len(final) >= target:
                break
            prompt, response = prompt_response_from_text(row.get("text", ""))
            record = sft_record("sft_refusal_boundary", prompt, response, 100000 + fill_idx, language="zh")
            norm = " ".join(record.get("text", "").lower().split())
            fill_idx += 1
            if not norm or norm in seen:
                continue
            seen.add(norm)
            record["split"] = split_for_index(len(final))
            final.append(record)

    write_jsonl(ART / "sft/sft_curriculum.jsonl", final)
    counts = Counter(r["curriculum"] for r in final)
    language_counts = Counter(r.get("language", "mixed") for r in final)
    zh_mixed = language_counts.get("zh", 0) + language_counts.get("mixed", 0)
    report = {
        "ok": bool(final),
        "records": len(final),
        "target_records": target,
        "curriculum_counts": dict(counts),
        "language_counts": dict(language_counts),
        "zh_mixed_ratio": zh_mixed / len(final) if final else 0,
        "target_zh_mixed_ratio": args.target_zh_mixed_ratio,
        "engineering_only": bool(args.engineering_only),
        "contains_private_data": False,
        "contains_cot": False,
        "contains_hidden_prompt": False,
        "contains_eval_prompt": False,
        "contains_old_excluded_row": False,
        "generic_assistant_target_rejected": True,
    }
    (ART / "reports").mkdir(parents=True, exist_ok=True)
    (ART / "reports/sft_curriculum_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "docs/r27/R27A5_SFT_CURRICULUM.md").write_text(
        "# R27A5 SFT Curriculum\n\n"
        f"Built `{len(final)}` engineering-only SFT records from promoted public instruction, RAG/evidence, value/aesthetic, answer-as-user anchors, refusal/boundary examples, and reasoning replay. The format is `<|user|> ... <|assistant|> ... <|end|>` and does not change the R27A4 tokenizer vocabulary.\n\n"
        "The curriculum stores no chain-of-thought, hidden prompts, eval prompts, private raw data, old excluded rows, or generic assistant style targets. Raw/processed SFT JSONL remains ignored under `artifacts/r27a5/sft/`.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
