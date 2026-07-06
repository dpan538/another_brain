#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.quantize import estimate_quantization
from src.browser_export.shape_manifest import summarize_tensors, synthetic_state_dict
from scripts.r27b1a_common import ARTIFACT_ROOT, find_candidate_checkpoints, load_checkpoint_state, mark_local_only_artifact_dir, repo_rel, write_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--synthetic-if-missing", action="store_true")
    parser.add_argument("--quant", default="q4", choices=["fp32", "fp16", "int8", "q4", "int4"])
    parser.add_argument("--out-dir", default=str(ARTIFACT_ROOT / "quantized_model"))
    args = parser.parse_args()

    mark_local_only_artifact_dir()
    checkpoint = None
    state_dict = None
    errors = []
    for candidate in find_candidate_checkpoints(prefer_latest=True):
        try:
            state_dict, _metadata = load_checkpoint_state(candidate)
            checkpoint = candidate
            break
        except Exception as error:
            errors.append({"checkpoint": repo_rel(candidate), "error": str(error)})
    if state_dict is None:
        if not args.synthetic_if_missing:
            raise SystemExit("no_supported_checkpoint_found")
        state_dict = synthetic_state_dict()

    summary = summarize_tensors(state_dict, limit=20)
    plan = estimate_quantization(summary["params"], args.quant, tensor_count=summary["tensor_count"]).to_dict()
    report = {
        "smoke": args.smoke,
        "source_checkpoint": repo_rel(checkpoint) if checkpoint else None,
        "source_mode": "checkpoint" if checkpoint else "synthetic_in_memory",
        "tensor_count": summary["tensor_count"],
        "params": summary["params"],
        "quantization": plan,
        "writes_quantized_assets": False,
        "checkpoint_errors": errors,
    }
    out_dir = Path(args.out_dir)
    write_json(out_dir / "quantization_manifest.json", report)
    print(f"R27B1A quantization manifest wrote {out_dir / 'quantization_manifest.json'}")
    print(f"source_mode={report['source_mode']} quant={args.quant} total_bytes={plan['total_bytes']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
