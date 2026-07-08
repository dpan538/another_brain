#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.curriculum.r28a13_sft_mix import DEFAULT_TOTAL_ROWS, build_sft_mix


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--total-rows", type=int, default=DEFAULT_TOTAL_ROWS)
    parser.add_argument("--seed", type=int, default=2813)
    args = parser.parse_args()
    result = build_sft_mix(total_rows=args.total_rows, seed=args.seed, root=ROOT, write_artifacts=True)
    print(json.dumps(result["report"], ensure_ascii=False, indent=2, sort_keys=True))
