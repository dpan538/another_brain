#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.model_lab.tokenizer_train import train_char_tokenizer
from src.training.model_lab.tokenizer_runtime import CharTokenizer
from src.training.model_lab.train_engineering import train_bigram_decoder
from src.training.model_lab.model_config import DEFAULT_CONFIG

MIX = ROOT / "artifacts/r27a2/training_mix"
RUNS = ROOT / "artifacts/r27a2/model_lab/runs"
TOK = ROOT / "artifacts/r27a2/model_lab/tokenizer"
CKPT = ROOT / "artifacts/r27a2/model_lab/checkpoints"
LATEST = ROOT / "artifacts/r27a2/model_lab/latest_run.json"


def load_split(split):
    rows = []
    path = MIX / f"{split}.jsonl"
    if path.exists():
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    rows.append(json.loads(line))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-steps", type=int, default=100)
    ap.add_argument("--context-length", type=int, default=256)
    ap.add_argument("--run-label", default="r27a2_bounded_engineering")
    args = ap.parse_args()
    if LATEST.exists():
        raise SystemExit("blocked_r27a2_engineering_run_already_exists")
    train_rows, dev_rows, heldout_rows = load_split("train"), load_split("dev"), load_split("heldout")
    if not train_rows:
        raise SystemExit("blocked_no_training_mix_rows")
    run_id = f"{args.run_label}_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}"
    run_dir = RUNS / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    tokenizer_info = train_char_tokenizer([r["text"] for r in train_rows], TOK)
    tokenizer = CharTokenizer.from_file(tokenizer_info["tokenizer_path"])
    def encode_rows(rows):
        return [tokenizer.encode(r["text"])[:args.context_length] for r in rows if r.get("text")]
    train_seq, dev_seq, held_seq = encode_rows(train_rows), encode_rows(dev_rows), encode_rows(heldout_rows)
    model, train_metrics = train_bigram_decoder(train_seq, tokenizer_info["vocab_size"], max_steps=args.max_steps)
    CKPT.mkdir(parents=True, exist_ok=True)
    checkpoint_path = CKPT / f"{run_id}_bigram_counts.json"
    checkpoint_path.write_text(json.dumps({str(k): dict(v) for k, v in model.counts.items()}, sort_keys=True), encoding="utf-8")
    samples = []
    for prompt in ["问题：2+3等于几？\n回答：", "用户：不知道的时候应该怎么办？\n鳄鱼："]:
        ids = model.generate(tokenizer.encode(prompt), 20)
        samples.append({"prompt": prompt, "output": tokenizer.decode(ids)})
    metrics = {
        "ok": True,
        "run_id": run_id,
        "device": "cpu_python_standard_library",
        "model_config": {**DEFAULT_CONFIG, "context_length": args.context_length, "max_steps": args.max_steps, "vocab_size": tokenizer_info["vocab_size"]},
        "tokenizer": tokenizer_info,
        "train_loss_start": train_metrics["train_loss_start"],
        "train_loss_end": train_metrics["train_loss_end"],
        "dev_loss": model.loss(dev_seq),
        "heldout_loss": model.loss(held_seq),
        "steps": train_metrics["steps"],
        "train_tokens": sum(len(s) for s in train_seq),
        "dev_tokens": sum(len(s) for s in dev_seq),
        "heldout_tokens": sum(len(s) for s in held_seq),
        "checkpoint_path": str(checkpoint_path.relative_to(ROOT)),
        "product_model": False,
        "phase_4": False,
        "release_checkpoint": False,
        "remote_model_weights_downloaded": False,
        "weights_committed": False,
        "samples": samples
    }
    (run_dir / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    (run_dir / "samples.json").write_text(json.dumps(samples, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    LATEST.parent.mkdir(parents=True, exist_ok=True)
    LATEST.write_text(json.dumps({"run_id": run_id, "metrics_path": str((run_dir / "metrics.json").relative_to(ROOT))}, indent=2), encoding="utf-8")
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
