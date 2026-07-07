#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "web" / "another_brain" / "model_assets" / "r28m1"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    config = read_json(ASSET_ROOT / "model.config.json")
    quant = read_json(ASSET_ROOT / "quantization.manifest.json")
    tokenizer = read_json(ASSET_ROOT / "tokenizer" / "tokenizer.json")
    arch = config.get("architecture", {})
    n_embd = int(arch.get("n_embd", 0) or 0)
    n_head = int(arch.get("n_head", 0) or 0)
    tensor_names = [tensor.get("name", "") for tensor in config.get("tensors", [])]
    failures: list[str] = []
    for key in ("vocab_size", "context_length", "n_layer", "n_head", "n_embd"):
        if not int(arch.get(key, 0) or 0):
            failures.append(f"missing_architecture_field:{key}")
    if n_head <= 0 or n_embd % n_head != 0:
        failures.append("head_dim_not_integer")
    for required in ("token_emb.weight", "pos_emb.weight", "ln_f.weight", "ln_f.bias", "lm_head.weight"):
        if required not in tensor_names:
            failures.append(f"missing_tensor:{required}")
    if quant.get("quantization_kind") != "q4_symmetric_per_tensor_with_bool_bitpack":
        failures.append("unsupported_q4_packing_format")
    report = {
        "ok": not failures,
        "failures": failures,
        "architecture": {
            **arch,
            "head_dim": n_embd // n_head if n_head else 0,
            "activation": "gelu",
            "norm_type": "layer_norm",
            "positional_encoding_type": "learned_absolute",
            "attention_type": "packed_qkv_multihead_attention",
            "tied_embedding": False,
        },
        "tensor_count": len(tensor_names),
        "q4_tensor_packing_format": quant.get("quantization_kind"),
        "tokenizer_runtime_compatible": tokenizer.get("runtime_compatible") is True,
        "tokenizer_browser_inference_ready": tokenizer.get("browser_inference_ready") is True,
        "warnings": ["runtime_tokenizer_not_browser_compatible_for_text_decode"]
        if tokenizer.get("browser_inference_ready") is not True
        else [],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
