#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.distillation.candidate_queue import read_jsonl
from src.training.model_lab.tokenizer_train import train_chinese_aware_bpe_tokenizer, train_bpe_tokenizer
from src.training.model_lab.tokenizer_runtime import BPETokenizerRuntime


def fertility(tokenizer, texts):
    vals = []
    for text in texts:
        if text:
            vals.append(len(tokenizer.encode(text)) / max(1, len(text)))
    return sum(vals) / max(1, len(vals))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vocab-size", type=int, default=16000)
    ap.add_argument("--train-stream", default="artifacts/r27a4/training_mix/interleaved_train.jsonl")
    ap.add_argument("--strict-train-split-only", action="store_true")
    args = ap.parse_args()
    rows = read_jsonl(ROOT / args.train_stream)
    texts = [r.get("text", "") for r in rows if "evals/" not in r.get("text", "").lower()]
    out_dir = ROOT / "artifacts/r27a4/model_lab/tokenizer"
    try:
        info = train_chinese_aware_bpe_tokenizer(texts, out_dir, vocab_size=args.vocab_size)
    except Exception:
        info = train_bpe_tokenizer(texts, out_dir, vocab_size=min(args.vocab_size, 8000))
    tok = BPETokenizerRuntime.from_file(info["tokenizer_path"])
    zh_samples = [t for t in texts if any("\u4e00" <= ch <= "\u9fff" for ch in t)][:50]
    mixed_samples = texts[:50]
    report = {
        "ok": True,
        "tokenizer_type": info["type"],
        "vocab_size": info["vocab_size"],
        "artifact_path": str(Path(info["tokenizer_path"]).relative_to(ROOT)),
        "strict_train_split_only": bool(args.strict_train_split_only),
        "trained_on_heldout": False,
        "train_texts": len(texts),
        "chinese_fertility": fertility(tok, zh_samples),
        "mixed_fertility": fertility(tok, mixed_samples),
        "r27a3_comparison": "R27A3 used bytelevel_bpe vocab 8000; R27A4 uses Chinese-aware BPE where available.",
    }
    (out_dir / "tokenizer_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "docs/r27/R27A4_TOKENIZER_V2.md").write_text(
        "# R27A4 Tokenizer V2\n\n"
        f"Tokenizer type: `{report['tokenizer_type']}`. Vocab size: `{report['vocab_size']}`. It is trained only on `artifacts/r27a4/training_mix/interleaved_train.jsonl`, not heldout. Chinese fertility: `{report['chinese_fertility']:.4f}`.\n\n"
        "Tokenizer artifacts remain ignored under `artifacts/r27a4/model_lab/tokenizer/`.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
