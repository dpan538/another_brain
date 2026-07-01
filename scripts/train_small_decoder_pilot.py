#!/usr/bin/env python3
import argparse
import base64
import hashlib
import json
import math
import os
import random
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    with open(ROOT / path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    out = ROOT / path
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(ROOT / path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_json(value):
    text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(text).hexdigest()


def finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def load_sequences(path):
    payload = read_json(path)
    return payload, [row["token_ids"] for row in payload.get("sequences", [])]


def decode_preview(ids, tokenizer):
    by_id = {int(idx): token for token, idx in tokenizer.get("vocab", {}).items()}
    text = "".join(by_id.get(int(idx), "") for idx in ids)
    return " ".join(text.replace("<pad>", "").split())[:240]


def tensor_digest(named_tensors):
    digest = hashlib.sha256()
    summaries = []
    for name, tensor in named_tensors:
        if hasattr(tensor, "detach"):
            array = tensor.detach().cpu().contiguous().numpy()
        else:
            array = tensor
        digest.update(name.encode("utf-8"))
        digest.update(str(tuple(array.shape)).encode("utf-8"))
        digest.update(array.tobytes())
        summaries.append({
            "name": name,
            "shape": list(array.shape),
            "mean": float(array.mean()),
            "std": float(array.std())
        })
    return digest.hexdigest(), summaries


def replay_tensor(name, tensor):
    if hasattr(tensor, "detach"):
        array = tensor.detach().cpu().contiguous().numpy()
    else:
        array = tensor
    try:
        import numpy as np
        array = np.asarray(array, dtype="<f4")
    except Exception:
        pass
    raw = array.tobytes()
    return {
        "name": name,
        "shape": list(array.shape),
        "dtype": "float32",
        "encoding": "base64_float32_le",
        "values": base64.b64encode(raw).decode("ascii"),
        "sha256": hashlib.sha256(raw).hexdigest()
    }


def count_parameters_torch(model):
    return int(sum(param.numel() for param in model.parameters()))


def run_torch(config, train_sequences, dev_sequences, tokenizer, backend):
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    seed = int(config["seed"])
    random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(1)
    device = torch.device("cpu")
    vocab_size = int(tokenizer["vocab_size"])
    pad_id = int(tokenizer["vocab"].get("<pad>", 0))
    max_context = int(config["max_context_tokens"])
    arch = config["architecture"]
    hidden = int(arch["hidden_size"])
    heads = int(arch["attention_heads"])
    intermediate = int(arch["intermediate_size"])
    layers = int(arch.get("layers", 1))
    batch_size = int(config["batch_size"])
    max_steps = int(config["max_steps"])
    eval_every = int(config["eval_every"])
    lr = float(config["learning_rate"])

    class LegacySingleBlockCausalDecoder(nn.Module):
        def __init__(self):
            super().__init__()
            self.token_embedding = nn.Embedding(vocab_size, hidden)
            self.position_embedding = nn.Embedding(max_context, hidden)
            self.ln_1 = nn.LayerNorm(hidden)
            self.attention = nn.MultiheadAttention(hidden, heads, batch_first=True)
            self.ln_2 = nn.LayerNorm(hidden)
            self.mlp = nn.Sequential(nn.Linear(hidden, intermediate), nn.GELU(), nn.Linear(intermediate, hidden))
            self.ln_f = nn.LayerNorm(hidden)
            self.output = nn.Linear(hidden, vocab_size)

        def forward(self, tokens):
            batch, seq = tokens.shape
            positions = torch.arange(seq, device=tokens.device).unsqueeze(0).expand(batch, seq)
            x = self.token_embedding(tokens) + self.position_embedding(positions)
            causal_mask = torch.triu(torch.ones(seq, seq, device=tokens.device, dtype=torch.bool), diagonal=1)
            attn_in = self.ln_1(x)
            attn_out, _ = self.attention(attn_in, attn_in, attn_in, attn_mask=causal_mask, need_weights=False)
            x = x + attn_out
            x = x + self.mlp(self.ln_2(x))
            return self.output(self.ln_f(x))

    class DecoderBlock(nn.Module):
        def __init__(self):
            super().__init__()
            self.ln_1 = nn.LayerNorm(hidden)
            self.attention = nn.MultiheadAttention(hidden, heads, batch_first=True)
            self.ln_2 = nn.LayerNorm(hidden)
            self.mlp = nn.Sequential(nn.Linear(hidden, intermediate), nn.GELU(), nn.Linear(intermediate, hidden))

        def forward(self, x, causal_mask):
            attn_in = self.ln_1(x)
            attn_out, _ = self.attention(attn_in, attn_in, attn_in, attn_mask=causal_mask, need_weights=False)
            x = x + attn_out
            return x + self.mlp(self.ln_2(x))

    class StackedCausalDecoder(nn.Module):
        def __init__(self):
            super().__init__()
            self.token_embedding = nn.Embedding(vocab_size, hidden)
            self.position_embedding = nn.Embedding(max_context, hidden)
            self.blocks = nn.ModuleList([DecoderBlock() for _ in range(layers)])
            self.ln_f = nn.LayerNorm(hidden)
            self.output = nn.Linear(hidden, vocab_size)

        def forward(self, tokens):
            batch, seq = tokens.shape
            positions = torch.arange(seq, device=tokens.device).unsqueeze(0).expand(batch, seq)
            x = self.token_embedding(tokens) + self.position_embedding(positions)
            causal_mask = torch.triu(torch.ones(seq, seq, device=tokens.device, dtype=torch.bool), diagonal=1)
            for block in self.blocks:
                x = block(x, causal_mask)
            return self.output(self.ln_f(x))

    model = (LegacySingleBlockCausalDecoder() if layers == 1 else StackedCausalDecoder()).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.0)
    train_tensor = torch.tensor(train_sequences, dtype=torch.long, device=device)
    dev_tensor = torch.tensor(dev_sequences, dtype=torch.long, device=device)

    def loss_for(tensor):
        model.eval()
        losses = []
        with torch.no_grad():
            for start in range(0, tensor.shape[0], batch_size):
                batch = tensor[start:start + batch_size]
                inputs = batch[:, :-1]
                labels = batch[:, 1:]
                logits = model(inputs)
                loss = F.cross_entropy(logits.reshape(-1, vocab_size), labels.reshape(-1), ignore_index=pad_id)
                losses.append(float(loss.item()))
        return float(sum(losses) / max(len(losses), 1))

    history = []
    initial_train_loss = loss_for(train_tensor)
    initial_dev_loss = loss_for(dev_tensor)
    history.append({"step": 0, "train_loss": initial_train_loss, "dev_loss": initial_dev_loss})

    for step in range(1, max_steps + 1):
        model.train()
        indices = [((step - 1) * batch_size + offset) % train_tensor.shape[0] for offset in range(batch_size)]
        batch = train_tensor[indices]
        inputs = batch[:, :-1]
        labels = batch[:, 1:]
        optimizer.zero_grad(set_to_none=True)
        logits = model(inputs)
        loss = F.cross_entropy(logits.reshape(-1, vocab_size), labels.reshape(-1), ignore_index=pad_id)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step % eval_every == 0 or step == max_steps:
            history.append({"step": step, "train_loss": loss_for(train_tensor), "dev_loss": loss_for(dev_tensor)})

    final_train_loss = loss_for(train_tensor)
    final_dev_loss = loss_for(dev_tensor)

    model.eval()
    with torch.no_grad():
        generated = train_tensor[0, : min(8, max_context)].clone().tolist()
        for _ in range(24):
            context = torch.tensor([generated[-max_context:]], dtype=torch.long, device=device)
            logits = model(context)[:, -1, :]
            next_id = int(torch.argmax(logits, dim=-1).item())
            if next_id == pad_id:
                break
            generated.append(next_id)

    state_sha256, param_summaries = tensor_digest([(name, param) for name, param in sorted(model.state_dict().items())])
    return {
        "backend": backend,
        "backend_library_version": getattr(torch, "__version__", "unknown"),
        "model_type": "causal_decoder_pilot",
        "actual_layers": layers,
        "architecture_ablation_training": layers > 1,
        "parameter_count": count_parameters_torch(model),
        "initial_train_loss": initial_train_loss,
        "final_train_loss": final_train_loss,
        "initial_dev_loss": initial_dev_loss,
        "final_dev_loss": final_dev_loss,
        "history": history,
        "sample_generation_preview": decode_preview(generated, tokenizer),
        "state_sha256": state_sha256,
        "param_summaries": param_summaries[:12],
        "parameter_tensors": [
            replay_tensor(name, param)
            for name, param in sorted(model.state_dict().items())
        ]
    }


def run_numpy(config, train_sequences, dev_sequences, tokenizer, backend):
    import numpy as np

    seed = int(config["seed"])
    rng = np.random.default_rng(seed)
    vocab_size = int(tokenizer["vocab_size"])
    pad_id = int(tokenizer["vocab"].get("<pad>", 0))
    hidden = int(config["architecture"]["hidden_size"])
    batch_size = max(64, int(config["batch_size"]) * 16)
    max_steps = int(config["max_steps"])
    eval_every = int(config["eval_every"])
    lr = float(config["learning_rate"])
    emb = rng.normal(0, 0.02, size=(vocab_size, hidden)).astype("float32")
    out = rng.normal(0, 0.02, size=(hidden, vocab_size)).astype("float32")
    bias = np.zeros((vocab_size,), dtype="float32")

    def pairs(sequences):
        xs, ys = [], []
        for row in sequences:
            for left, right in zip(row[:-1], row[1:]):
                if right == pad_id:
                    break
                xs.append(int(left))
                ys.append(int(right))
        return np.asarray(xs, dtype=np.int64), np.asarray(ys, dtype=np.int64)

    train_x, train_y = pairs(train_sequences)
    dev_x, dev_y = pairs(dev_sequences)

    def score(xs, ys):
        if len(xs) == 0:
            return 0.0
        losses = []
        for start in range(0, len(xs), 512):
            xb = xs[start:start + 512]
            yb = ys[start:start + 512]
            logits = emb[xb] @ out + bias
            logits -= logits.max(axis=1, keepdims=True)
            probs = np.exp(logits)
            probs /= probs.sum(axis=1, keepdims=True)
            losses.append(float((-np.log(probs[np.arange(len(yb)), yb] + 1e-12)).mean()))
        return float(sum(losses) / max(len(losses), 1))

    history = []
    initial_train_loss = score(train_x, train_y)
    initial_dev_loss = score(dev_x, dev_y)
    history.append({"step": 0, "train_loss": initial_train_loss, "dev_loss": initial_dev_loss})
    for step in range(1, max_steps + 1):
        idx = (np.arange(batch_size) + (step - 1) * batch_size) % len(train_x)
        xb = train_x[idx]
        yb = train_y[idx]
        h = emb[xb]
        logits = h @ out + bias
        logits -= logits.max(axis=1, keepdims=True)
        probs = np.exp(logits)
        probs /= probs.sum(axis=1, keepdims=True)
        grad = probs
        grad[np.arange(len(yb)), yb] -= 1.0
        grad /= len(yb)
        grad_out = h.T @ grad
        grad_bias = grad.sum(axis=0)
        grad_h = grad @ out.T
        out -= lr * grad_out.astype("float32")
        bias -= lr * grad_bias.astype("float32")
        for token_id, grad_row in zip(xb, grad_h):
            emb[token_id] -= lr * grad_row.astype("float32")
        if step % eval_every == 0 or step == max_steps:
            history.append({"step": step, "train_loss": score(train_x, train_y), "dev_loss": score(dev_x, dev_y)})

    generated = list(train_sequences[0][:8])
    for _ in range(24):
        logits = emb[int(generated[-1])] @ out + bias
        next_id = int(np.argmax(logits))
        if next_id == pad_id:
            break
        generated.append(next_id)
    named_tensors = [("embedding", emb), ("output", out), ("bias", bias)]
    state_sha256, param_summaries = tensor_digest(named_tensors)
    return {
        "backend": backend,
        "backend_library_version": getattr(np, "__version__", "unknown"),
        "model_type": "decoder_like_next_token_pilot",
        "implementation_type": "numpy_decoder_like_next_token_pilot",
        "actual_layers": 0,
        "architecture_ablation_training": False,
        "parameter_count": int(emb.size + out.size + bias.size),
        "initial_train_loss": initial_train_loss,
        "final_train_loss": score(train_x, train_y),
        "initial_dev_loss": initial_dev_loss,
        "final_dev_loss": score(dev_x, dev_y),
        "history": history,
        "sample_generation_preview": decode_preview(generated, tokenizer),
        "state_sha256": state_sha256,
        "param_summaries": param_summaries,
        "parameter_tensors": [replay_tensor(name, tensor) for name, tensor in named_tensors]
    }


def run_prefix(config):
    run_id = str(config.get("run_id", ""))
    if run_id.startswith("r25v_"):
        return "r25v"
    if run_id.startswith("r25s_"):
        return "r25s"
    if run_id.startswith("r25p_"):
        return "r25p"
    return "r25m"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--backend", required=True)
    args = parser.parse_args()

    config = read_json(args.config)
    prefix = run_prefix(config)
    tokenizer_config = read_json(config["tokenizer_config"])
    artifact_dir = tokenizer_config.get("artifact_dir", "artifacts/training_os/tokenizer_dryrun/r25l")
    tokenizer = read_json(f"{artifact_dir}/r25j_tokenizer.json")
    train_dataset, train_sequences = load_sequences(f"{config['output_dir']}{prefix}_train_sequences.json")
    dev_dataset, dev_sequences = load_sequences(f"{config['output_dir']}{prefix}_dev_sequences.json")
    heldout_path = f"{config['output_dir']}{prefix}_heldout_sequences.json"
    heldout_dataset = read_json(heldout_path) if Path(ROOT / heldout_path).exists() else {"sequences": []}
    if not train_sequences or not dev_sequences:
        raise SystemExit("Small decoder pilot sequences are missing")

    if args.backend == "python_torch":
        metrics = run_torch(config, train_sequences, dev_sequences, tokenizer, args.backend)
    elif args.backend == "python_numpy":
        metrics = run_numpy(config, train_sequences, dev_sequences, tokenizer, args.backend)
    else:
        raise SystemExit(f"Unsupported R25M backend: {args.backend}")

    steps = int(config["max_steps"])
    train_loss_decreased = metrics["final_train_loss"] < metrics["initial_train_loss"]
    dev_loss_finite = finite(metrics["initial_dev_loss"]) and finite(metrics["final_dev_loss"])
    replayable_enabled = bool(config.get("replayable_checkpoint", {}).get("enabled")) and prefix in {"r25p", "r25s", "r25v"}
    checkpoint_path = f"{config['output_dir']}{prefix}_replayable_checkpoint.json" if replayable_enabled else f"{config['output_dir']}{prefix}_small_decoder_checkpoint.json"
    metrics_path = f"{config['output_dir']}{prefix}_small_decoder_metrics.json"
    run_report_path = f"{config['output_dir']}{prefix}_small_decoder_run_report.json"
    artifact_paths = [
        checkpoint_path,
        metrics_path,
        run_report_path
    ]
    metric_report = {
        "ok": train_loss_decreased and dev_loss_finite,
        "run_id": config["run_id"],
        "variant_id": config.get("variant_id"),
        "backend": metrics["backend"],
        "backend_library_version": metrics.get("backend_library_version"),
        "model_type": metrics["model_type"],
        "implementation_type": metrics.get("implementation_type", metrics["model_type"]),
        "actual_layers": metrics.get("actual_layers"),
        "architecture_ablation_training": metrics.get("architecture_ablation_training", False),
        "parameter_count": metrics["parameter_count"],
        "steps": steps,
        "initial_train_loss": metrics["initial_train_loss"],
        "final_train_loss": metrics["final_train_loss"],
        "initial_dev_loss": metrics["initial_dev_loss"],
        "final_dev_loss": metrics["final_dev_loss"],
        "train_loss_decreased": train_loss_decreased,
        "dev_loss_finite": dev_loss_finite,
        "history": metrics["history"]
    }
    if replayable_enabled:
        checkpoint = {
            "schema_version": "r25o_small_decoder_checkpoint_v1",
            "run_id": config["run_id"],
            "phase": "phase_3_small_decoder_pilot",
            "model_type": metrics["model_type"],
            "architecture": {
                "type": config["architecture"]["type"],
                "ablation": config["architecture"].get("ablation"),
                "layers": int(metrics.get("actual_layers", config["architecture"].get("layers", 1))),
                "hidden_size": int(config["architecture"]["hidden_size"]),
                "attention_heads": int(config["architecture"].get("attention_heads", 1)),
                "intermediate_size": int(config["architecture"].get("intermediate_size", config["architecture"]["hidden_size"])),
                "positional_encoding": "none_for_decoder_like_next_token" if metrics["model_type"] == "decoder_like_next_token_pilot" else "learned",
                "normalization": "none_for_decoder_like_next_token" if metrics["model_type"] == "decoder_like_next_token_pilot" else "layer_norm"
            },
            "tokenizer_id": tokenizer_config.get("tokenizer_id", "r25l_dryrun_tokenizer_v0"),
            "vocab_size": int(tokenizer["vocab_size"]),
            "max_context_tokens": int(config["max_context_tokens"]),
            "parameter_count": int(metrics["parameter_count"]),
            "parameter_tensors": metrics["parameter_tensors"],
            "optimizer_state_optional": None,
            "training_config_digest": sha256_file(args.config),
            "dataset_digest": sha256_json({
                "train": train_dataset,
                "dev": dev_dataset,
                "heldout_sequence_count": len(heldout_dataset.get("sequences", []))
            }),
            "tokenizer_digest": sha256_file(f"{artifact_dir}/r25j_tokenizer.json"),
            "metrics_digest": sha256_json(metric_report),
            "product_model": False,
            "release_checkpoint": False,
            "commit_allowed": False,
            "created_for": "small_decoder_pilot_only",
            "notes": [
                f"{prefix.upper()} replayable JSON checkpoint for ignored held-out replay only.",
                "Not a product model, not a release checkpoint, and not commit-allowed.",
                "Serialized tensors are included only because this is a bounded small-pilot artifact under ignored artifacts/."
            ]
        }
    else:
        checkpoint = {
            "checkpoint_id": "r25m_small_decoder_checkpoint_digest_v0",
            "run_id": config["run_id"],
            "architecture_id": config["architecture_id"],
            "toy_or_pilot_only": True,
            "model_type": metrics["model_type"],
            "product_model": False,
            "release_checkpoint": False,
            "formal_product_training": False,
            "long_term_training": False,
            "weights_serialized": False,
            "state_sha256": metrics["state_sha256"],
            "parameter_count": metrics["parameter_count"],
            "parameter_summaries": metrics["param_summaries"],
            "notes": [
                "This JSON is an ignored pilot checkpoint digest, not a release checkpoint.",
                "Full runtime weights are not serialized to a tracked path.",
                "R25M is a bounded mechanics pilot only."
            ]
        }
    run_report = {
        "ok": metric_report["ok"],
        "run_id": config["run_id"],
        "variant_id": config.get("variant_id"),
        "small_pilot_training_ran": True,
        "formal_product_training": False,
        "long_term_training": False,
        "phase_4_scaled_training": False,
        "product_model": False,
        "release_checkpoint": False,
        "backend": metrics["backend"],
        "backend_library_version": metrics.get("backend_library_version"),
        "architecture_type": metrics["model_type"],
        "implementation_type": metrics.get("implementation_type", metrics["model_type"]),
        "actual_layers": metrics.get("actual_layers"),
        "architecture_ablation_training": metrics.get("architecture_ablation_training", False),
        "parameter_count": metrics["parameter_count"],
        "steps": steps,
        "train_sequences": len(train_sequences),
        "dev_sequences": len(dev_sequences),
        "heldout_sequences_prepared": len(heldout_dataset.get("sequences", [])),
        "initial_train_loss": metrics["initial_train_loss"],
        "final_train_loss": metrics["final_train_loss"],
        "initial_dev_loss": metrics["initial_dev_loss"],
        "final_dev_loss": metrics["final_dev_loss"],
        "train_loss_decreased": train_loss_decreased,
        "dev_loss_finite": dev_loss_finite,
        "replayable_checkpoint_written": replayable_enabled,
        "replayable_checkpoint_path": checkpoint_path if replayable_enabled else "",
        "sample_generation_preview": metrics["sample_generation_preview"],
        "artifact_paths": artifact_paths,
        "weights_tracked": False,
        "source_files": {
            "train": train_dataset.get("source_files", []),
            "dev": dev_dataset.get("source_files", []),
            "heldout": heldout_dataset.get("source_files", [])
        },
        "notes": [
            f"{prefix.upper()} ran only because the narrow approval marker and allow flag were present.",
            "This is bounded small-pilot training, not product-scale or long-term training.",
            "Loss decrease is a mechanics signal only, not product intelligence or release admission.",
            *(
                ["Replayable checkpoint is JSON-only and ignored; it is not a release artifact."]
                if replayable_enabled else []
            )
        ]
    }
    write_json(artifact_paths[0], checkpoint)
    write_json(artifact_paths[1], metric_report)
    write_json(artifact_paths[2], run_report)
    print(json.dumps(run_report, ensure_ascii=False, indent=2))
    if not run_report["ok"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
