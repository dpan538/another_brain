#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.quantize import estimate_quantization
from src.browser_export.shard_writer import validate_shard_manifest, write_static_shards
from src.browser_export.shape_manifest import infer_config_from_state_dict, summarize_tensors, synthetic_state_dict
from scripts.r27b1a_common import ARTIFACT_ROOT, find_candidate_checkpoints, load_checkpoint_state, mark_local_only_artifact_dir, repo_rel


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--synthetic-if-missing", action="store_true")
    parser.add_argument("--out-dir", default=str(ARTIFACT_ROOT / "shards"))
    args = parser.parse_args()

    mark_local_only_artifact_dir()
    checkpoint = None
    state_dict = None
    metadata = {}
    errors = []
    for candidate in find_candidate_checkpoints(prefer_latest=True):
        try:
            state_dict, metadata = load_checkpoint_state(candidate)
            checkpoint = candidate
            break
        except Exception as error:
            errors.append({"checkpoint": repo_rel(candidate), "error": str(error)})
    if state_dict is None:
        if not args.synthetic_if_missing:
            raise SystemExit("no_supported_checkpoint_found")
        state_dict = synthetic_state_dict()
        metadata = {"synthetic": True, "vocab_size": 32, "context_length": 16}

    summary = summarize_tensors(state_dict, limit=8 if args.smoke else None)
    config = infer_config_from_state_dict(state_dict, fallback_vocab=int(metadata.get("vocab_size", 0) or 0), fallback_context=int(metadata.get("context_length", 0) or 0))
    quant = estimate_quantization(summary["params"], "q4", tensor_count=summary["tensor_count"]).to_dict()
    manifest = write_static_shards(output_dir=Path(args.out_dir), tensors=summary["tensors"], config={**config, "source_checkpoint": repo_rel(checkpoint) if checkpoint else None}, quantization=quant)
    manifest["checkpoint_errors"] = errors
    failures = validate_shard_manifest(manifest)
    if failures:
        raise SystemExit("shard_manifest_invalid:" + ",".join(failures))
    print(f"R27B1A static shard smoke wrote {args.out_dir}")
    print(f"source_checkpoint={repo_rel(checkpoint) if checkpoint else None} shards={len(manifest['tensor_shards'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
