#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.model_lab.tokenizer_train import train_bpe_tokenizer

OUT = ROOT / "artifacts/r27a3/model_lab/tokenizer"
DOC = ROOT / "docs/r27/R27A3_TOKENIZER_AND_MODEL_LAB.md"


def read_texts(path):
    with Path(path).open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                row = json.loads(line)
                if row.get("contains_eval_prompt") or row.get("contains_cot"):
                    continue
                if row.get("source_dataset_ids") and "another_brain_question_pack_001" in " ".join(row.get("source_dataset_ids", [])):
                    continue
                yield row.get("text", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vocab-size", type=int, default=8000)
    ap.add_argument("--input", required=True)
    args = ap.parse_args()
    texts = list(read_texts(ROOT / args.input if not Path(args.input).is_absolute() else args.input))
    if not texts:
        raise SystemExit("blocked_r27a3_tokenizer_no_train_texts")
    info = train_bpe_tokenizer(texts, OUT, vocab_size=args.vocab_size)
    sample_zh = "鳄鱼的另一个大脑应该能判断证据不足。"
    from src.training.model_lab.tokenizer_runtime import BPETokenizerRuntime
    tok = BPETokenizerRuntime.from_file(info["tokenizer_path"])
    encoded = tok.encode(sample_zh)
    report = {
        "ok": info["type"] != "char_fallback" and info["vocab_size"] >= 4096,
        "tokenizer_type": info["type"],
        "vocab_size": info["vocab_size"],
        "requested_vocab_size": info["requested_vocab_size"],
        "artifact_path": str(Path(info["tokenizer_path"]).relative_to(ROOT)),
        "train_texts": len(texts),
        "sample_chinese_tokens": len(encoded),
        "bounded_character_fallback": False,
    }
    (OUT / "tokenizer_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text(
        "# R27A3 Tokenizer And Model Lab\n\n"
        f"Tokenizer type: `{report['tokenizer_type']}`. Vocab size: `{report['vocab_size']}`. Artifacts are ignored under `artifacts/r27a3/model_lab/tokenizer/`.\n\n"
        "The R27A3 tokenizer is trained from the R27A3 train split only and is not the R27A2 bounded character fallback.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if not report["ok"]:
        raise SystemExit("blocked_r27a3_tokenizer_not_upgraded")


if __name__ == "__main__":
    main()
