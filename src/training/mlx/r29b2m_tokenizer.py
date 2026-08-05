"""Exact local tokenizer and short-dialogue wrapper for the MLX campaign."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


WRAPPER_VERSION = "r29b2m.short_dialogue_wrapper.v1"


class ExactRuntimeTokenizer:
    """Independent Python port of the committed worker's BPE contract."""

    def __init__(self, payload: dict[str, Any]) -> None:
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
        if len(vocab) != 16_000 or any(token not in vocab for token in ("<bos>", "<eos>", "<unk>")):
            raise ValueError("exact_runtime_tokenizer_contract_mismatch")
        return cls(payload)

    @staticmethod
    def _byte_maps() -> tuple[dict[int, str], dict[str, int]]:
        bytes_in_vocab = list(range(33, 127)) + list(range(161, 173)) + list(range(174, 256))
        codepoints = list(bytes_in_vocab)
        extra = 0
        for byte in range(256):
            if byte not in bytes_in_vocab:
                bytes_in_vocab.append(byte)
                codepoints.append(256 + extra)
                extra += 1
        encoder = {byte: chr(codepoint) for byte, codepoint in zip(bytes_in_vocab, codepoints)}
        return encoder, {value: key for key, value in encoder.items()}

    def _merge_ranks(self) -> dict[tuple[str, str], int]:
        ranks: dict[tuple[str, str], int] = {}
        for rank, merge in enumerate(self.merges):
            if isinstance(merge, list) and len(merge) >= 2:
                ranks[(str(merge[0]), str(merge[1]))] = rank
            elif isinstance(merge, str):
                parts = merge.split()
                if len(parts) >= 2:
                    ranks[(parts[0], parts[1])] = rank
        return ranks

    @staticmethod
    def _split_cjk(text: str) -> list[str]:
        result: list[str] = []
        current = ""
        for char in text:
            if "\u4e00" <= char <= "\u9fff":
                if current:
                    result.append(current)
                result.append(char)
                current = ""
            else:
                current += char
        if current:
            result.append(current)
        return result

    def _bpe(self, symbols: list[str]) -> list[str]:
        pieces = list(symbols)
        while len(pieces) > 1:
            candidates = [(self.ranks[(pieces[index], pieces[index + 1])], index) for index in range(len(pieces) - 1) if (pieces[index], pieces[index + 1]) in self.ranks]
            if not candidates:
                break
            _, index = min(candidates)
            pieces = pieces[:index] + [pieces[index] + pieces[index + 1]] + pieces[index + 2 :]
        return pieces

    def encode(self, text: str, *, max_tokens: int = 256, add_bos: bool = True) -> list[int]:
        ids = [self.bos] if add_bos else []
        for part in self._split_cjk(str(text)):
            symbols = [self.byte_encoder[byte] for byte in part.encode("utf-8")]
            ids.extend(int(self.vocab.get(piece, self.unk)) for piece in self._bpe(symbols))
        return ids[-max_tokens:]

    def decode(self, ids: list[int]) -> str:
        pieces = [self.inverse.get(int(value), "") for value in ids if int(value) not in self.special_ids]
        raw = bytes(self.byte_decoder[char] for char in "".join(pieces) if char in self.byte_decoder)
        return raw.decode("utf-8", errors="replace").replace("\ufffd", "�").strip()


def wrapper_for_messages(messages: list[dict[str, str]], *, category: str = "普通问答", length_target: str = "简短", evidence_policy: str = "不确定时说明") -> str:
    """Render a bounded session without hidden state or fallback substitution."""
    rows: list[str] = []
    for message in messages:
        role, content = message.get("role"), message.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str):
            raise ValueError("invalid_dialogue_message")
        rows.append(("用户：" if role == "user" else "回答：") + content)
    rows.extend([f"类别：{category}", f"长度：{length_target}", f"证据边界：{evidence_policy}", "回答："])
    return "\n".join(rows)


def wrapper_for_user(text: str, *, category: str = "普通问答", length_target: str = "简短", evidence_policy: str = "不确定时说明") -> str:
    return wrapper_for_messages([{"role": "user", "content": text}], category=category, length_target=length_target, evidence_policy=evidence_policy)
