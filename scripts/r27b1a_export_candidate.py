#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.export_manifest import make_export_manifest, validate_export_manifest
from src.browser_export.shape_manifest import infer_config_from_state_dict, summarize_tensors, synthetic_state_dict
from scripts.r27b1a_common import ARTIFACT_ROOT, find_candidate_checkpoints, load_checkpoint_state, mark_local_only_artifact_dir, repo_rel, write_json


def export_manifest_for_state(state_dict, checkpoint: Path | None, metadata: dict, smoke: bool) -> dict:
    shape_summary = summarize_tensors(state_dict, limit=None)
    config = infer_config_from_state_dict(state_dict, fallback_vocab=int(metadata.get("vocab_size", 0) or 0), fallback_context=int(metadata.get("context_length", 0) or 0))
    return make_export_manifest(
        source_checkpoint=repo_rel(checkpoint) if checkpoint else None,
        config={**config, "smoke": smoke},
        tensors=shape_summary["tensors"],
        assets=[],
        onnx={"attempted": False, "supported": False, "blocker": "r27b1a_custom_static_path_first"},
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--synthetic-if-missing", action="store_true")
    parser.add_argument("--out-dir", default=str(ARTIFACT_ROOT / "exported_model"))
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

    manifest = export_manifest_for_state(state_dict, checkpoint, metadata, args.smoke)
    manifest["checkpoint_errors"] = errors
    failures = validate_export_manifest(manifest)
    if failures:
        raise SystemExit("manifest_invalid:" + ",".join(failures))
    out_dir = Path(args.out_dir)
    write_json(out_dir / "export_manifest.json", manifest)
    print(f"R27B1A export candidate manifest wrote {out_dir / 'export_manifest.json'}")
    print(f"source_checkpoint={manifest['source_checkpoint']} tensors={len(manifest['tensors'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
