#!/usr/bin/env python3
import argparse
import json
import math
import time
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.model_lab.model_config import R27A3_DEFAULT_CONFIG, estimate_transformer_params
from src.training.model_lab.tokenizer_runtime import BPETokenizerRuntime
from src.training.model_lab.train_engineering import train_tiny_gpt

MIX = ROOT / "artifacts/r27a3/training_mix"
TOK = ROOT / "artifacts/r27a3/model_lab/tokenizer/tokenizer.json"
RUNS = ROOT / "artifacts/r27a3/model_lab/runs"
CKPT = ROOT / "artifacts/r27a3/model_lab/checkpoints"
LATEST = ROOT / "artifacts/r27a3/model_lab/latest_run.json"


def read_rows(split):
    path = MIX / f"{split}.jsonl"
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def flatten_tokens(rows, tokenizer, max_tokens):
    tokens = []
    by_curriculum = {}
    for row in rows:
        ids = tokenizer.encode(row["text"])
        by_curriculum[row["curriculum"]] = by_curriculum.get(row["curriculum"], 0) + len(ids)
        tokens.extend(ids)
        if len(tokens) >= max_tokens:
            return tokens[:max_tokens], by_curriculum
    return tokens, by_curriculum


def device_name():
    import torch
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-steps", type=int, default=1000)
    ap.add_argument("--context-length", type=int, default=512)
    ap.add_argument("--max-train-tokens", type=int, default=2000000)
    ap.add_argument("--run-label", default="r27a3_public_tokenizer_pilot")
    args = ap.parse_args()
    if LATEST.exists():
        raise SystemExit("blocked_r27a3_engineering_run_already_exists")
    if not TOK.exists():
        raise SystemExit("blocked_r27a3_tokenizer_missing")
    train_rows, dev_rows, heldout_rows = read_rows("train"), read_rows("dev"), read_rows("heldout")
    tokenizer = BPETokenizerRuntime.from_file(TOK)
    vocab_size = tokenizer.tokenizer.get_vocab_size()
    device = device_name()
    config = dict(R27A3_DEFAULT_CONFIG)
    if device == "cpu":
        config.update({"context_length": min(args.context_length, config["cpu_context_length"]), "n_layer": config["cpu_n_layer"], "n_embd": config["cpu_n_embd"], "max_steps": min(args.max_steps, config["cpu_max_steps"])})
    else:
        config.update({"context_length": args.context_length, "max_steps": min(args.max_steps, 1500)})
    config["max_train_tokens"] = min(args.max_train_tokens, config["max_train_tokens"])
    config["vocab_size"] = vocab_size
    config["estimated_params"] = estimate_transformer_params(vocab_size, config["n_layer"], config["n_embd"], config["context_length"])
    train_tokens, train_by_curriculum = flatten_tokens(train_rows, tokenizer, config["max_train_tokens"])
    dev_tokens, _ = flatten_tokens(dev_rows, tokenizer, min(200000, config["max_train_tokens"]))
    heldout_tokens, _ = flatten_tokens(heldout_rows, tokenizer, min(200000, config["max_train_tokens"]))
    run_id = f"{args.run_label}_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}"
    run_dir = RUNS / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    model, metrics = train_tiny_gpt(train_tokens, dev_tokens, heldout_tokens, vocab_size, config, device)
    CKPT.mkdir(parents=True, exist_ok=True)
    checkpoint_path = CKPT / f"{run_id}.pt"
    import torch
    torch.save({"model_state_dict": model.state_dict(), "config": config}, checkpoint_path)
    train_ppl = math.exp(metrics["train_loss_end"]) if metrics["train_loss_end"] < 20 else None
    report = {
        "ok": True,
        "run_id": run_id,
        "device": device,
        "dependency_path": "torch_optional_training_dependency_not_browser_runtime",
        "tokenizer_type": "bytelevel_bpe",
        "tokenizer_vocab_size": vocab_size,
        "model_config": config,
        "parameter_count": sum(p.numel() for p in model.parameters()),
        "context_length": config["context_length"],
        "max_steps": args.max_steps,
        "actual_steps": metrics["steps"],
        "train_loss_start": metrics["train_loss_start"],
        "train_loss_end": metrics["train_loss_end"],
        "dev_loss": metrics["dev_loss"],
        "heldout_loss": metrics["heldout_loss"],
        "train_perplexity": train_ppl,
        "dev_perplexity": metrics["dev_perplexity"],
        "heldout_perplexity": metrics["heldout_perplexity"],
        "train_records": len(train_rows),
        "dev_records": len(dev_rows),
        "heldout_records": len(heldout_rows),
        "train_tokens": len(train_tokens),
        "dev_tokens": len(dev_tokens),
        "heldout_tokens": len(heldout_tokens),
        "tokens_by_curriculum_train": train_by_curriculum,
        "checkpoint_path": str(checkpoint_path.relative_to(ROOT)),
        "product_model": False,
        "phase_4": False,
        "release_checkpoint": False,
        "remote_model_weights_downloaded": False,
        "weights_committed": False,
        "external_llm_api_called": False,
        "doubao_called": False,
    }
    (run_dir / "metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    LATEST.parent.mkdir(parents=True, exist_ok=True)
    LATEST.write_text(json.dumps({"run_id": run_id, "metrics_path": str((run_dir / "metrics.json").relative_to(ROOT))}, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
