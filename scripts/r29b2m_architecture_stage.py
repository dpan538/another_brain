#!/usr/bin/env python3
"""Strict source-to-MLX architecture audit for the recovered R28M1 seed."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.training.mlx.r29b2m_campaign import atomic_json  # noqa: E402
from src.training.mlx.r29b2m_model import (  # noqa: E402
    CONTEXT_LENGTH,
    DROPOUT,
    HEAD_DIM,
    LAYERNORM_EPS,
    N_EMBD,
    N_HEAD,
    N_LAYER,
    VOCAB_SIZE,
    R29B2MDecoder,
    architecture_fingerprint,
    expected_tensor_shapes,
    source_weight_pairs,
)
from src.training.mlx.r29b2m_q4_source import sha256_file  # noqa: E402
from src.training.mlx.r29b2m_tokenizer import WRAPPER_VERSION  # noqa: E402


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--seed", type=Path, required=True)
    parser.add_argument("--seed-manifest", type=Path, required=True)
    args = parser.parse_args()
    import mlx.core as mx
    from mlx.utils import tree_flatten

    seed_manifest = json.loads(args.seed_manifest.read_text(encoding="utf-8"))
    model = R29B2MDecoder()
    expected = expected_tensor_shapes()
    parameter_tree = {name: value for name, value in tree_flatten(model.parameters())}
    if set(parameter_tree) != set(expected):
        raise ValueError("mlx_model_tensor_tree_mismatch")
    for name, shape in expected.items():
        if tuple(parameter_tree[name].shape) != shape:
            raise ValueError(f"mlx_model_shape_mismatch:{name}")
    pairs = source_weight_pairs(args.seed)
    model.load_weights(pairs, strict=True)
    model.eval()
    mx.eval(*[value for _, value in tree_flatten(model.parameters())])
    parameter_count = sum(int(value.size) for name, value in tree_flatten(model.parameters()) if not name.endswith(".mask"))
    fingerprint = architecture_fingerprint(
        mini_decoder_path=REPO_ROOT / "src" / "training" / "model_lab" / "mini_decoder.py",
        model_source_path=REPO_ROOT / "src" / "training" / "mlx" / "r29b2m_model.py",
        tokenizer_sha256=str(seed_manifest["tokenizer_sha256"]),
        wrapper_version=WRAPPER_VERSION,
    )
    report = {
        "campaign_id": "r29b2m_m1_mlx_daily_dialogue_v1",
        "created_at": now(),
        "valid": True,
        "seed_kind": seed_manifest["source_kind"],
        "source_fp32_checkpoint_loaded": False,
        "source_checkpoint_parity_claim": False,
        "strict_load": True,
        "model_parameter_count_excluding_masks": parameter_count,
        "tensor_count_including_masks": len(parameter_tree),
        "architecture": {"vocab_size": VOCAB_SIZE, "context_length": CONTEXT_LENGTH, "n_layer": N_LAYER, "n_embd": N_EMBD, "n_head": N_HEAD, "head_dim": HEAD_DIM, "mlp_dim": N_EMBD * 4},
        "forward_contract": {
            "layout": "batch,time,embedding",
            "pre_layer_norm": True,
            "layernorm_epsilon": LAYERNORM_EPS,
            "packed_qkv_order": ["Q", "K", "V"],
            "attention_scale": "1/sqrt(head_dim)",
            "mask": "strictly upper triangular future positions; True means masked",
            "gelu": "exact_erf (PyTorch nn.GELU approximate=none)",
            "residual_order": ["x + attention(ln1(x))", "x + mlp(ln2(x))"],
            "dropout": {"p": DROPOUT, "locations": ["embedding", "attention_weights", "mlp_output"], "disabled_in_eval": True},
            "learned_positional_embedding": True,
            "lm_head_bias": False,
            "weight_tying": False,
        },
        "source_sha256": seed_manifest["source_quantized_sha256"],
        "seed_sha256": sha256_file(args.seed),
        "tokenizer_sha256": seed_manifest["tokenizer_sha256"],
        "wrapper_version": WRAPPER_VERSION,
        "architecture_fingerprint": fingerprint,
        "device": str(mx.default_device()),
    }
    atomic_json(args.artifact_root / "reports" / "mlx_architecture_audit.json", report)
    print(json.dumps({"valid": True, "parameter_count": parameter_count, "fingerprint": fingerprint}, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
