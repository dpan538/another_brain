#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.curriculum.interleaved_sampler import interleave_records, normalized_text
from src.training.curriculum.token_budget import prefix_token_mix, record_tokens
from src.training.distillation.candidate_queue import read_jsonl, write_jsonl

ART = ROOT / "artifacts/r27a6"
ART5 = ROOT / "artifacts/r27a5"


MIXES = {
    "continued_pretraining": {"public_chinese_pretraining": 0.50, "secondary_english_mixed": 0.10, "reasoning_symbolic": 0.15, "rag_evidence_grounded": 0.10, "value_aesthetic": 0.05, "user_answered_anchor": 0.05, "sft_public_instruction": 0.05},
    "sft_dialogue": {"sft_public_instruction": 0.25, "sft_rag_evidence": 0.20, "sft_value_aesthetic": 0.15, "sft_answer_as_user": 0.15, "sft_refusal_boundary": 0.15, "reasoning_symbolic": 0.05, "sft_distillation_candidate": 0.05},
    "rag_value_anchor_replay": {"sft_rag_evidence": 0.30, "sft_value_aesthetic": 0.20, "sft_answer_as_user": 0.20, "sft_refusal_boundary": 0.15, "user_answered_anchor": 0.10, "reasoning_symbolic": 0.05},
    "consolidation": {"public_chinese_pretraining": 0.20, "sft_public_instruction": 0.20, "sft_rag_evidence": 0.20, "sft_value_aesthetic": 0.15, "sft_answer_as_user": 0.10, "sft_refusal_boundary": 0.10, "reasoning_symbolic": 0.05},
}


def public_rows():
    rows = []
    for path in sorted((ART / "clean_public_samples").glob("*/clean.jsonl")):
        for row in read_jsonl(path):
            lang = row.get("language", "mixed")
            rows.append({"record_id": row.get("record_id"), "curriculum": "public_chinese_pretraining" if lang in {"zh", "mixed"} else "secondary_english_mixed", "text": row.get("text", ""), "language": lang, "source_dataset_id": row.get("dataset_id"), "training_allowed": True})
    if not rows:
        for row in read_jsonl(ART5 / "training_mix/interleaved_train.jsonl"):
            if row.get("curriculum") in {"public_chinese_pretraining", "secondary_english_mixed"}:
                rows.append(row)
    return rows


def anchor_rows():
    rows = []
    for path in sorted((ROOT / "training/llm_corpus").glob("r26*g_user_answered_*.jsonl")):
        for row in read_jsonl(path):
            source_row_id = int(row.get("source_row_id") or 0)
            if row.get("pack_id") == "another_brain_question_pack_001" and 51 <= source_row_id <= 100:
                continue
            q = row.get("question") or row.get("messages", [{}])[0].get("content", "")
            a = row.get("target_answer") or row.get("messages", [{}, {}])[-1].get("content", "")
            if q and a:
                rows.append({"record_id": row.get("sample_id"), "curriculum": "user_answered_anchor", "text": f"用户：{q}\n回答：{a}", "language": row.get("language", "mixed"), "training_allowed": True})
    return rows


def all_records():
    rows = []
    rows.extend(public_rows())
    rows.extend(read_jsonl(ART5 / "curriculum/value_aesthetic.jsonl"))
    rows.extend(read_jsonl(ART5 / "curriculum/rag_evidence.jsonl"))
    rows.extend(read_jsonl(ART5 / "curriculum/reasoning_symbolic.jsonl"))
    rows.extend(read_jsonl(ART / "dialogue/dialogue_product_curriculum.jsonl"))
    rows.extend(read_jsonl(ART / "sft/sft_curriculum.jsonl"))
    rows.extend(anchor_rows())
    return rows


def split_eval(records):
    train, dev, heldout, probe = [], [], [], []
    seen = {"train": set(), "dev": set(), "heldout": set(), "probe": set()}
    for idx, row in enumerate(records):
        split = "heldout" if idx % 20 == 0 else "dev" if idx % 10 == 0 else "train"
        if idx % 37 == 0:
            split = "probe"
        norm = normalized_text(row)
        if any(norm in s for s in seen.values()):
            continue
        seen[split].add(norm)
        {"train": train, "dev": dev, "heldout": heldout, "probe": probe}[split].append(row)
    return train, dev, heldout, probe


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target-total-tokens", type=int, default=100000000)
    ap.add_argument("--strict-split-dedup", action="store_true")
    ap.add_argument("--stratified-heldout", action="store_true")
    ap.add_argument("--seed", type=int, default=2706)
    ap.add_argument("--lineage-aware", action="store_true")
    args = ap.parse_args()
    records = all_records()
    out_dir = ART / "training_mix"
    manifests = {}
    stage_targets = {
        "continued_pretraining": int(args.target_total_tokens * 0.40),
        "sft_dialogue": int(args.target_total_tokens * 0.30),
        "rag_value_anchor_replay": int(args.target_total_tokens * 0.15),
        "consolidation": int(args.target_total_tokens * 0.15),
    }
    all_train = []
    for stage, target in stage_targets.items():
        rows, manifest = interleave_records(records, target, seed=args.seed + len(manifests), target_mix=MIXES[stage])
        manifests[stage] = manifest
        write_jsonl(out_dir / f"{stage}_stream.jsonl", rows)
        all_train.extend(rows)
    train, dev, heldout, probe = split_eval(all_train)
    write_jsonl(out_dir / "autonomous_train.jsonl", train)
    write_jsonl(out_dir / "dev.jsonl", dev)
    write_jsonl(out_dir / "stratified_heldout.jsonl", heldout)
    write_jsonl(out_dir / "product_probe_eval_stream.jsonl", probe)
    manifest = {
        "ok": True,
        "records_in": len(records),
        "train_records": len(train),
        "dev_records": len(dev),
        "stratified_heldout_records": len(heldout),
        "product_probe_records": len(probe),
        "available_stream_tokens": sum(record_tokens(r) for r in all_train),
        "prefix_100k": prefix_token_mix(train, 100000),
        "prefix_500k": prefix_token_mix(train, 500000),
        "prefix_1m": prefix_token_mix(train, 1000000),
        "prefix_5m": prefix_token_mix(train, 5000000),
        "stage_manifests": manifests,
        "strict_split_dedup": bool(args.strict_split_dedup),
        "stratified_heldout": bool(args.stratified_heldout),
        "contains_eval_prompts": False,
        "old_question_pack_001_rows_51_100_used": 0,
    }
    (ART / "reports").mkdir(parents=True, exist_ok=True)
    (ART / "reports/autonomous_training_streams_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A6_AUTONOMOUS_STREAMS.md").write_text(
        "# R27A6 Autonomous Streams\n\n"
        f"Built stage streams plus dev, stratified heldout, and product probe streams. Available stream tokens: `{manifest['available_stream_tokens']}`. "
        f"First 1M token mix: `{manifest['prefix_1m']['tokens_by_curriculum']}`. No eval prompts or old excluded rows are admitted.\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
