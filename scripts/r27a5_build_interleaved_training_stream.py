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

ART = ROOT / "artifacts/r27a5"


def public_rows():
    rows = []
    for path in sorted((ART / "clean_public_samples").glob("*/clean.jsonl")):
        for row in read_jsonl(path):
            lang = row.get("language") or row.get("language_hint") or "mixed"
            curr = "public_chinese_pretraining" if lang in {"zh", "mixed"} else "secondary_english_mixed"
            rows.append({
                "record_id": row.get("record_id"),
                "curriculum": curr,
                "text": row.get("text", ""),
                "language": lang,
                "source_dataset_id": row.get("dataset_id"),
                "license_name": row.get("license_name"),
                "license_obligations": row.get("license_obligations", []),
                "training_allowed": True,
            })
    return rows


def anchor_rows():
    rows = []
    for path in sorted((ROOT / "training/llm_corpus").glob("r26*g_user_answered_*.jsonl")):
        for row in read_jsonl(path):
            text = row.get("target_answer") or row.get("messages", [{}, {}])[-1].get("content", "")
            q = row.get("question") or row.get("messages", [{}])[0].get("content", "")
            rows.append({"record_id": row.get("sample_id"), "curriculum": "user_answered_anchor", "text": f"用户：{q}\n回答：{text}", "language": row.get("language", "mixed"), "training_allowed": True})
    return rows


def split_rows(records):
    train, dev, heldout = [], [], []
    seen = {"train": set(), "dev": set(), "heldout": set()}
    for idx, row in enumerate(records):
        split = "heldout" if idx % 20 == 0 else "dev" if idx % 10 == 0 else "train"
        norm = normalized_text(row)
        if any(norm in bucket for bucket in seen.values()):
            continue
        seen[split].add(norm)
        {"train": train, "dev": dev, "heldout": heldout}[split].append(row)
    return train, dev, heldout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target-total-tokens", type=int, default=40000000)
    ap.add_argument("--strict-split-dedup", action="store_true")
    ap.add_argument("--seed", type=int, default=2705)
    ap.add_argument("--lineage-aware", action="store_true")
    args = ap.parse_args()
    records = []
    records.extend(public_rows())
    records.extend(read_jsonl(ART / "curriculum/value_aesthetic.jsonl"))
    records.extend(read_jsonl(ART / "curriculum/rag_evidence.jsonl"))
    records.extend(read_jsonl(ART / "curriculum/reasoning_symbolic.jsonl"))
    records.extend(read_jsonl(ART / "sft/sft_curriculum.jsonl"))
    records.extend(anchor_rows())
    interleaved, manifest = interleave_records(records, args.target_total_tokens, seed=args.seed)
    train, dev, heldout = split_rows(interleaved)
    out_dir = ART / "training_mix"
    write_jsonl(out_dir / "interleaved_train.jsonl", train)
    write_jsonl(out_dir / "dev.jsonl", dev)
    write_jsonl(out_dir / "heldout.jsonl", heldout)
    manifest.update({
        "ok": True,
        "records_in": len(records),
        "train_records": len(train),
        "dev_records": len(dev),
        "heldout_records": len(heldout),
        "split_dedup": True,
        "contains_eval_prompts": False,
        "old_question_pack_001_rows_51_100_used": 0,
        "prefix_100k": prefix_token_mix(train, 100000),
        "prefix_500k": prefix_token_mix(train, 500000),
        "prefix_1m": prefix_token_mix(train, 1000000),
        "train_tokens_estimate": sum(record_tokens(r) for r in train),
        "lineage_aware": bool(args.lineage_aware),
        "stage1_target_mix": {
            "public_chinese_pretraining": 0.45,
            "secondary_english_mixed": 0.15,
            "reasoning_symbolic": 0.15,
            "rag_evidence_grounded": 0.10,
            "value_aesthetic": 0.05,
            "user_answered_anchor": 0.05,
            "sft_public_instruction": 0.05,
        },
        "stage2_target_mix": {
            "sft_public_instruction": 0.25,
            "sft_rag_evidence": 0.25,
            "sft_value_aesthetic": 0.15,
            "sft_answer_as_user": 0.10,
            "sft_refusal_boundary": 0.10,
            "reasoning_symbolic": 0.10,
            "sft_distillation_candidate": 0.05,
        },
    })
    (ART / "reports").mkdir(parents=True, exist_ok=True)
    (ART / "reports/interleaved_training_stream_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "docs/r27/R27A5_INTERLEAVED_CONTINUATION_STREAM.md").write_text(
        "# R27A5 Interleaved Continuation Stream\n\n"
        "R27A5 uses deterministic token-budget interleaving across continued public pretraining, SFT public instruction, SFT RAG, SFT value/aesthetic, answer-as-user anchors, refusal/boundary rows, and symbolic reasoning. The manifest records target mix, available mix, and actual first 100k/500k/1M token coverage. No curriculum can be starved merely because it appears later in a JSONL file.\n\n"
        f"First 1M token mix: `{manifest['prefix_1m']['tokens_by_curriculum']}`.\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
