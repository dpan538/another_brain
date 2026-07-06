#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27b1a_common import ARTIFACT_ROOT, find_candidate_checkpoints, mark_local_only_artifact_dir, repo_rel, write_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--out", default=str(ARTIFACT_ROOT / "exported_model" / "onnx_exploratory_report.json"))
    args = parser.parse_args()

    mark_local_only_artifact_dir()
    candidates = find_candidate_checkpoints(prefer_latest=True)
    report = {
        "attempted": True,
        "supported": False,
        "smoke": args.smoke,
        "candidate_checkpoints_seen": [repo_rel(path) for path in candidates],
        "onnx_artifact_written": False,
        "blocker": "R27B1A does not define a torch.nn.Module reconstruction path for local checkpoints yet.",
        "notes": [
            "ONNX is exploratory only.",
            "Any future .onnx outputs must stay under ignored artifacts/r27b1a/exported_model/.",
            "Custom static shard format remains the primary R27B1A implementation path.",
        ],
    }
    write_json(Path(args.out), report)
    print(f"R27B1A ONNX exploratory report wrote {args.out}")
    print(f"supported={report['supported']} blocker={report['blocker']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
