#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.shape_manifest import estimate_sizes, infer_config_from_state_dict, summarize_tensors, synthetic_state_dict
from scripts.r27b1a_common import ARTIFACT_ROOT, find_candidate_checkpoints, load_checkpoint_state, mark_local_only_artifact_dir, repo_rel, write_json


def analyze_state_dict(state_dict, source_checkpoint: Path | None, metadata: dict) -> dict:
    shape_summary = summarize_tensors(state_dict, limit=40)
    params = shape_summary["params"]
    config = infer_config_from_state_dict(
        state_dict,
        fallback_vocab=int(metadata.get("vocab_size", metadata.get("vocab", 0)) or 0),
        fallback_context=int(metadata.get("context_length", metadata.get("block_size", 0)) or 0),
    )
    sizes = estimate_sizes(params)
    return {
        "source_checkpoint": repo_rel(source_checkpoint) if source_checkpoint else None,
        "source_mode": "checkpoint" if source_checkpoint else "synthetic_in_memory",
        "metadata": metadata,
        "params": params,
        "vocab": config["vocab_size"],
        "context": config["context_length"],
        "hidden_size_hint": config["hidden_size_hint"],
        "tensor_count": shape_summary["tensor_count"],
        "tensor_shapes": shape_summary["tensors"],
        "tensor_shapes_truncated": shape_summary["truncated"],
        "size_estimates": sizes,
        "fits_100mb_static_total": sizes["q4_bytes"] <= 100_000_000,
        "fits_70mb_model_budget": sizes["q4_bytes"] <= 70_000_000,
        "browser_runtime_compatibility_risks": [
            "checkpoint layout must be mapped to browser decoder graph",
            "tokenizer artifact is intentionally not admitted or committed in R27B1A",
            "q4 path is experimental and needs numeric quality validation before admission",
            "ONNX browser runtime is exploratory, not selected as final runtime",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prefer-latest", action="store_true")
    parser.add_argument("--out", default=str(ARTIFACT_ROOT / "reports" / "export_target_analysis.json"))
    args = parser.parse_args()

    mark_local_only_artifact_dir()
    candidates = find_candidate_checkpoints(prefer_latest=args.prefer_latest)
    report = None
    errors = []
    for checkpoint in candidates:
        try:
            state_dict, metadata = load_checkpoint_state(checkpoint)
            report = analyze_state_dict(state_dict, checkpoint, metadata)
            break
        except Exception as error:
            errors.append({"checkpoint": repo_rel(checkpoint), "error": str(error)})
    if report is None:
        state_dict = synthetic_state_dict()
        report = analyze_state_dict(state_dict, None, {"synthetic": True, "vocab_size": 32, "context_length": 16})
    report["candidate_checkpoints_seen"] = [repo_rel(path) for path in candidates]
    report["checkpoint_errors"] = errors
    write_json(Path(args.out), report)

    doc = Path("docs/r27/R27B1A_EXPORT_TARGET_ANALYSIS.md")
    doc.write_text(
        "# R27B1A Export Target Analysis\n\n"
        f"Source mode: `{report['source_mode']}`.\n\n"
        f"Source checkpoint: `{report['source_checkpoint']}`.\n\n"
        f"Params: `{report['params']}`. Vocab: `{report['vocab']}`. Context: `{report['context']}`.\n\n"
        f"Estimated sizes: `{report['size_estimates']}`.\n\n"
        f"Fits 70MB model budget with q4: `{report['fits_70mb_model_budget']}`.\n\n"
        "Compatibility risks:\n"
        + "\n".join(f"- {risk}" for risk in report["browser_runtime_compatibility_risks"])
        + "\n",
        encoding="utf-8",
    )
    print(f"R27B1A export target analysis wrote {args.out}")
    print(f"source_mode={report['source_mode']} params={report['params']} q4_bytes={report['size_estimates']['q4_bytes']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
