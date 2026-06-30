#!/usr/bin/env python3
import argparse
import base64
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    with open(ROOT / path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def tensor_map(checkpoint):
    import numpy as np

    out = {}
    for tensor in checkpoint.get("parameter_tensors", []):
        if tensor.get("encoding") != "base64_float32_le":
            continue
        raw = base64.b64decode(tensor["values"])
        array = np.frombuffer(raw, dtype="<f4").copy().reshape(tuple(tensor["shape"]))
        out[tensor["name"]] = array
    return out


def token_pairs(sequences, pad_id):
    import numpy as np

    xs, ys = [], []
    for row in sequences:
        ids = row.get("token_ids", [])
        for left, right in zip(ids[:-1], ids[1:]):
            if int(right) == pad_id:
                break
            xs.append(int(left))
            ys.append(int(right))
    return np.asarray(xs, dtype="int64"), np.asarray(ys, dtype="int64")


def decoder_like_loss(checkpoint, heldout_dataset, emit_sequence_losses=False):
    import numpy as np

    tensors = tensor_map(checkpoint)
    required = ["embedding", "output", "bias"]
    missing = [name for name in required if name not in tensors]
    if missing:
        return {
            "ok": False,
            "reason": "checkpoint_tensor_layout_not_supported_for_local_replay",
            "missing_tensors": missing,
            "heldout_loss": None,
            "heldout_loss_finite": False
        }
    embedding = tensors["embedding"]
    output_weights = tensors["output"]
    bias = tensors["bias"]
    pad_id = int(heldout_dataset.get("pad_token_id", 0))
    sequences = heldout_dataset.get("sequences", [])
    xs, ys = token_pairs(sequences, pad_id)
    if len(xs) == 0:
        return {
            "ok": False,
            "reason": "heldout_pairs_empty",
            "heldout_loss": None,
            "heldout_loss_finite": False
        }

    losses = []
    for start in range(0, len(xs), 256):
        xb = xs[start:start + 256]
        yb = ys[start:start + 256]
        logits = embedding[xb] @ output_weights + bias
        logits -= logits.max(axis=1, keepdims=True)
        exp = np.exp(logits)
        denom = exp.sum(axis=1, keepdims=True)
        probs = exp / denom
        losses.append(float((-np.log(probs[np.arange(len(yb)), yb] + 1e-12)).mean()))
    heldout_loss = float(sum(losses) / max(len(losses), 1))
    output = {
        "ok": math.isfinite(heldout_loss),
        "reason": None,
        "heldout_pairs": int(len(xs)),
        "heldout_loss": heldout_loss,
        "heldout_loss_finite": math.isfinite(heldout_loss)
    }
    if emit_sequence_losses:
        sequence_losses = []
        for row in sequences:
            row_x, row_y = token_pairs([row], pad_id)
            if len(row_x) == 0:
                sequence_losses.append({"sample_id": row.get("sample_id"), "loss": None, "pairs": 0, "finite": False})
                continue
            logits = embedding[row_x] @ output_weights + bias
            logits -= logits.max(axis=1, keepdims=True)
            exp = np.exp(logits)
            probs = exp / exp.sum(axis=1, keepdims=True)
            loss = float((-np.log(probs[np.arange(len(row_y)), row_y] + 1e-12)).mean())
            sequence_losses.append({"sample_id": row.get("sample_id"), "loss": loss, "pairs": int(len(row_y)), "finite": math.isfinite(loss)})
        output["sequence_losses"] = sequence_losses
    return output


def causal_decoder_loss(checkpoint, heldout_dataset, emit_sequence_losses=False):
    import numpy as np
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    arch = checkpoint["architecture"]
    vocab_size = int(checkpoint["vocab_size"])
    hidden = int(arch["hidden_size"])
    heads = int(arch["attention_heads"])
    intermediate = int(arch["intermediate_size"])
    max_context = int(checkpoint["max_context_tokens"])
    pad_id = int(heldout_dataset.get("pad_token_id", 0))

    class MicroCausalDecoder(nn.Module):
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

    tensors = tensor_map(checkpoint)
    model = MicroCausalDecoder()
    state = {}
    for name, array in tensors.items():
        state[name] = torch.tensor(np.asarray(array), dtype=torch.float32)
    missing, unexpected = model.load_state_dict(state, strict=False)
    if missing or unexpected:
        return {
            "ok": False,
            "reason": "causal_decoder_state_dict_mismatch",
            "missing_tensors": list(missing),
            "unexpected_tensors": list(unexpected),
            "heldout_loss": None,
            "heldout_loss_finite": False
        }
    model.eval()
    seqs = [row.get("token_ids", []) for row in heldout_dataset.get("sequences", []) if row.get("token_ids")]
    if not seqs:
        return {
            "ok": False,
            "reason": "heldout_sequences_empty",
            "heldout_loss": None,
            "heldout_loss_finite": False
        }
    tensor = torch.tensor(seqs, dtype=torch.long)
    losses = []
    pairs = 0
    with torch.no_grad():
        for start in range(0, tensor.shape[0], 4):
            batch = tensor[start:start + 4]
            inputs = batch[:, :-1]
            labels = batch[:, 1:]
            pairs += int((labels != pad_id).sum().item())
            logits = model(inputs)
            loss = F.cross_entropy(logits.reshape(-1, vocab_size), labels.reshape(-1), ignore_index=pad_id)
            losses.append(float(loss.item()))
    heldout_loss = float(sum(losses) / max(len(losses), 1))
    output = {
        "ok": math.isfinite(heldout_loss),
        "reason": None,
        "heldout_pairs": pairs,
        "heldout_loss": heldout_loss,
        "heldout_loss_finite": math.isfinite(heldout_loss)
    }
    if emit_sequence_losses:
        sequence_losses = []
        with torch.no_grad():
            for row in heldout_dataset.get("sequences", []):
                ids = row.get("token_ids", [])
                if not ids:
                    sequence_losses.append({"sample_id": row.get("sample_id"), "loss": None, "pairs": 0, "finite": False})
                    continue
                batch = torch.tensor([ids], dtype=torch.long)
                inputs = batch[:, :-1]
                labels = batch[:, 1:]
                pair_count = int((labels != pad_id).sum().item())
                if pair_count == 0:
                    sequence_losses.append({"sample_id": row.get("sample_id"), "loss": None, "pairs": 0, "finite": False})
                    continue
                logits = model(inputs)
                loss = F.cross_entropy(logits.reshape(-1, vocab_size), labels.reshape(-1), ignore_index=pad_id)
                loss_value = float(loss.item())
                sequence_losses.append({
                    "sample_id": row.get("sample_id"),
                    "loss": loss_value,
                    "pairs": pair_count,
                    "finite": math.isfinite(loss_value)
                })
        output["sequence_losses"] = sequence_losses
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--heldout", required=True)
    parser.add_argument("--emit-sequence-losses", action="store_true")
    args = parser.parse_args()

    checkpoint = read_json(args.checkpoint)
    heldout_dataset = read_json(args.heldout)
    if checkpoint.get("model_type") == "decoder_like_next_token_pilot":
        output = decoder_like_loss(checkpoint, heldout_dataset, args.emit_sequence_losses)
    elif checkpoint.get("model_type") == "causal_decoder_pilot":
        output = causal_decoder_loss(checkpoint, heldout_dataset, args.emit_sequence_losses)
    else:
        output = {
            "ok": False,
            "reason": "checkpoint_model_type_not_supported_for_local_replay",
            "model_type": checkpoint.get("model_type"),
            "heldout_loss": None,
            "heldout_loss_finite": False
        }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if not output.get("ok"):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
