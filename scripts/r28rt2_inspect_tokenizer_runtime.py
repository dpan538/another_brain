#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "web" / "another_brain" / "model_assets" / "r28m1"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    runtime_tokenizer = ASSET_ROOT / "tokenizer" / "runtime_tokenizer.json"
    tokenizer = read_json(runtime_tokenizer if runtime_tokenizer.exists() else ASSET_ROOT / "tokenizer" / "tokenizer.json")
    model_config = read_json(ASSET_ROOT / "model.config.json")
    quantization = read_json(ASSET_ROOT / "quantization.manifest.json")
    vocab_size = int(tokenizer.get("vocab_size") or model_config.get("architecture", {}).get("vocab_size") or 0)
    has_vocab = isinstance(tokenizer.get("vocab"), dict) and bool(tokenizer.get("vocab"))
    exact_runtime = tokenizer.get("exact_runtime_tokenizer") is True and has_vocab
    report = {
        "ok": vocab_size == 16000 and quantization.get("quantization") == "q4",
        "tokenizer_type": "exact_runtime_tokenizer" if exact_runtime else tokenizer.get("tokenizer_kind") or tokenizer.get("type") or "runtime_lineage_metadata",
        "vocab_size": vocab_size,
        "model_vocab_size": model_config.get("architecture", {}).get("vocab_size"),
        "token_id_to_string_mapping_exists": has_vocab,
        "encode_path": "exact_runtime_tokenizer" if exact_runtime else "unicode_modulo_runtime_display_codec",
        "decode_path": "exact_runtime_tokenizer" if exact_runtime else "lossy_runtime_display_codec_emergency_fallback",
        "exact_decode_available": exact_runtime,
        "special_tokens": tokenizer.get("special_tokens") or {},
        "unknown_token_handling": "exact_unk_token_or_debug_token_id",
        "chinese_text_handling": "cjk_split_bytelevel_bpe" if exact_runtime else "unicode_codepoint_modulo_encode_with_lossy_display_decode",
        "fallback_if_insufficient": "fallback_available",
        "blocker": "" if vocab_size == 16000 else "tokenizer_runtime_asset_insufficient",
        "limitations": [
            *([] if exact_runtime else ["exact_runtime_tokenizer_vocab_missing"]),
            "readable decode is not product quality admission",
        ],
        "non_claims": {
            "product_tokenizer": False,
            "browser_admission": False,
            "tokenizer_training_artifact_committed": False,
        },
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
