"""Actual 96M CPU FP32 reference helpers for R29B1R.

The model is instantiated with the project's real training implementation.  A
small explicit cache runner mirrors its documented pre-LN MHA/MLP order for
CPU parity tests; it is not the old R29B0 list-based fixture.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class ExactRuntimeTokenizer:
    """Python implementation of the committed q4 worker's exact BPE contract."""

    def __init__(self, payload: dict[str, Any]):
        self.payload = payload
        self.vocab = payload.get("vocab") or payload.get("model", {}).get("vocab") or {}
        self.merges = payload.get("merges") or payload.get("model", {}).get("merges") or []
        self.bos = int(self.vocab["<bos>"])
        self.eos = int(self.vocab["<eos>"])
        self.unk = int(self.vocab.get(payload.get("unk_token", "<unk>"), 1))
        self.inverse = {int(value): key for key, value in self.vocab.items()}
        self.byte_encoder, self.byte_decoder = self._byte_maps()
        self.ranks = self._merge_ranks()
        self.special_ids = {int(self.vocab[token]) for token in ("<bos>", "<eos>", "<unk>") if token in self.vocab}

    @classmethod
    def from_file(cls, path: Path) -> "ExactRuntimeTokenizer":
        payload = json.loads(path.read_text(encoding="utf-8"))
        vocab = payload.get("vocab") or payload.get("model", {}).get("vocab") or {}
        if payload.get("exact_runtime_tokenizer") is not True or payload.get("runtime_compatible") is not True:
            raise ValueError("exact_runtime_tokenizer_flags_missing")
        if len(vocab) != 16000 or any(token not in vocab for token in ("<bos>", "<eos>", "<unk>")):
            raise ValueError("exact_runtime_tokenizer_contract_mismatch")
        return cls(payload)

    @staticmethod
    def _byte_maps() -> tuple[dict[int, str], dict[str, int]]:
        bs = list(range(33, 127)) + list(range(161, 173)) + list(range(174, 256))
        cs = list(bs)
        extra = 0
        for byte in range(256):
            if byte not in bs:
                bs.append(byte)
                cs.append(256 + extra)
                extra += 1
        encoder = {byte: chr(code) for byte, code in zip(bs, cs)}
        return encoder, {value: key for key, value in encoder.items()}

    def _merge_ranks(self) -> dict[tuple[str, str], int]:
        out = {}
        for rank, merge in enumerate(self.merges):
            if isinstance(merge, list) and len(merge) >= 2:
                out[(str(merge[0]), str(merge[1]))] = rank
            elif isinstance(merge, str):
                parts = merge.split()
                if len(parts) >= 2:
                    out[(parts[0], parts[1])] = rank
        return out

    @staticmethod
    def _split_cjk(text: str) -> list[str]:
        parts, current = [], ""
        for char in text:
            if "\u4e00" <= char <= "\u9fff":
                if current:
                    parts.append(current)
                parts.append(char)
                current = ""
            else:
                current += char
        if current:
            parts.append(current)
        return parts

    def _bpe(self, symbols: list[str]) -> list[str]:
        pieces = list(symbols)
        while len(pieces) > 1:
            ranked = [(self.ranks[(pieces[index], pieces[index + 1])], index) for index in range(len(pieces) - 1) if (pieces[index], pieces[index + 1]) in self.ranks]
            if not ranked:
                break
            _, index = min(ranked)
            pieces = pieces[:index] + [pieces[index] + pieces[index + 1]] + pieces[index + 2 :]
        return pieces

    def encode(self, text: str, *, max_tokens: int = 256, add_bos: bool = True) -> list[int]:
        ids = [self.bos] if add_bos else []
        for part in self._split_cjk(str(text)):
            symbols = [self.byte_encoder[byte] for byte in part.encode("utf-8")]
            ids.extend(int(self.vocab.get(piece, self.unk)) for piece in self._bpe(symbols))
        return ids[-max_tokens:]

    def decode(self, ids: list[int]) -> str:
        pieces = [self.inverse.get(int(item), "") for item in ids if int(item) not in self.special_ids]
        raw = bytes(self.byte_decoder[piece] for char in "".join(pieces) for piece in [char] if piece in self.byte_decoder)
        return raw.decode("utf-8", errors="replace").replace("\uFFfd", "�").strip()


def wrapper_for_user(text: str, *, category: str = "普通问答", length_target: str = "简短", evidence_policy: str = "不确定时说明") -> str:
    return "\n".join([f"用户：{text}", f"类别：{category}", f"长度：{length_target}", f"证据边界：{evidence_policy}", "回答："])


def build_actual_model(torch: Any, config: dict[str, Any]) -> Any:
    from src.training.model_lab.mini_decoder import build_tiny_gpt

    return build_tiny_gpt(
        vocab_size=int(config["vocab_size"]),
        context_length=int(config["context_length"]),
        n_layer=int(config["n_layer"]),
        n_head=int(config["n_head"]),
        n_embd=int(config["n_embd"]),
        dropout=0.05,
    )


def state_dict_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    value = payload.get("model_state_dict", payload)
    if not isinstance(value, dict):
        raise ValueError("checkpoint_model_state_dict_missing")
    return value


def model_config_from_payload(payload: dict[str, Any]) -> dict[str, int]:
    config = payload.get("config", {}) if isinstance(payload, dict) else {}
    required = {"context_length": 256, "n_layer": 7, "n_head": 14, "n_embd": 896}
    result = {name: int(config.get(name, expected)) for name, expected in required.items()}
    result["vocab_size"] = int(config.get("vocab_size", 16000))
    return result


def tensor_inventory(torch: Any, state_dict: dict[str, Any]) -> dict[str, Any]:
    entries = []
    parameters = 0
    nonfinite = []
    for name, tensor in state_dict.items():
        if not hasattr(tensor, "shape"):
            entries.append({"name": name, "kind": type(tensor).__name__})
            continue
        numel = int(tensor.numel())
        parameters += numel
        finite = bool(torch.isfinite(tensor).all()) if tensor.is_floating_point() else True
        if not finite:
            nonfinite.append(name)
        entries.append({"name": name, "shape": list(tensor.shape), "dtype": str(tensor.dtype), "numel": numel, "finite": finite})
    digest = hashlib.sha256(json.dumps([(entry.get("name"), entry.get("shape"), entry.get("dtype")) for entry in entries], sort_keys=True).encode("utf-8")).hexdigest()
    return {"entries": entries, "state_dict_key_count": len(state_dict), "tensor_numel": parameters, "nonfinite": nonfinite, "ordered_tensor_digest": digest}


class CachedActualGPT:
    """Per-layer K/V CPU cache implementing the actual model's forward contract."""

    def __init__(self, torch: Any, state: dict[str, Any], config: dict[str, int]):
        self.torch = torch
        self.F = torch.nn.functional
        self.state = state
        self.config = config
        self.head_dim = config["n_embd"] // config["n_head"]
        self.keys: list[Any] = []
        self.values: list[Any] = []
        self.length = 0

    def reset(self) -> None:
        self.keys = []
        self.values = []
        self.length = 0

    def _linear(self, value: Any, prefix: str) -> Any:
        # nn.MultiheadAttention stores packed Q/K/V under in_proj_weight,
        # unlike nn.Linear's conventional ``.weight`` suffix.
        if prefix.endswith(".attn.attn.in_proj"):
            return self.F.linear(value, self.state[f"{prefix}_weight"], self.state.get(f"{prefix}_bias"))
        return self.F.linear(value, self.state[f"{prefix}.weight"], self.state.get(f"{prefix}.bias"))

    def _layer_norm(self, value: Any, prefix: str) -> Any:
        return self.F.layer_norm(value, (self.config["n_embd"],), self.state[f"{prefix}.weight"], self.state[f"{prefix}.bias"], 1e-5)

    def append(self, token_id: int) -> Any:
        if self.length >= self.config["context_length"]:
            raise ValueError("context_overflow")
        torch = self.torch
        token = torch.tensor([[token_id]], dtype=torch.long)
        pos = torch.tensor([[self.length]], dtype=torch.long)
        x = self.F.embedding(token, self.state["token_emb.weight"]) + self.F.embedding(pos, self.state["pos_emb.weight"])
        for layer in range(self.config["n_layer"]):
            prefix = f"blocks.{layer}"
            normalized = self._layer_norm(x, f"{prefix}.ln1")
            packed = self._linear(normalized, f"{prefix}.attn.attn.in_proj")
            q, k, v = packed.chunk(3, dim=-1)
            def shaped(value: Any) -> Any:
                return value.view(1, 1, self.config["n_head"], self.head_dim).transpose(1, 2)
            q, k, v = shaped(q), shaped(k), shaped(v)
            if self.length == 0:
                cached_k, cached_v = k, v
            else:
                cached_k = torch.cat([self.keys[layer], k], dim=2)
                cached_v = torch.cat([self.values[layer], v], dim=2)
            attention = torch.softmax((q @ cached_k.transpose(-2, -1)) / math.sqrt(self.head_dim), dim=-1)
            attended = (attention @ cached_v).transpose(1, 2).contiguous().view(1, 1, self.config["n_embd"])
            x = x + self._linear(attended, f"{prefix}.attn.attn.out_proj")
            mlp_input = self._layer_norm(x, f"{prefix}.ln2")
            mlp_hidden = self.F.gelu(self._linear(mlp_input, f"{prefix}.mlp.0"), approximate="none")
            x = x + self._linear(mlp_hidden, f"{prefix}.mlp.2")
            if self.length == 0:
                self.keys.append(cached_k)
                self.values.append(cached_v)
            else:
                self.keys[layer], self.values[layer] = cached_k, cached_v
        self.length += 1
        return self._linear(self._layer_norm(x, "ln_f"), "lm_head")[:, -1, :]

    def prefill(self, token_ids: list[int]) -> Any:
        self.reset()
        logits = None
        for token_id in token_ids:
            logits = self.append(int(token_id))
        if logits is None:
            raise ValueError("prefill_empty")
        return logits


def greedy_generate(torch: Any, model: Any, ids: list[int], *, eos: int, context_length: int, max_new_tokens: int = 24) -> tuple[list[int], list[int]]:
    generated: list[int] = []
    sequence = list(ids)
    with torch.inference_mode():
        for _ in range(max_new_tokens):
            input_ids = torch.tensor([sequence[-context_length:]], dtype=torch.long)
            logits, _ = model(input_ids)
            token = int(logits[0, -1].argmax().item())
            generated.append(token)
            sequence.append(token)
            if token == eos:
                break
    return sequence, generated
