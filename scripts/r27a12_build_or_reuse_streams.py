#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.curriculum.r27a12_stream_builder import build_or_reuse_streams


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-total-tokens", type=int, default=80_000_000)
    parser.add_argument("--strict-split-dedup", action="store_true")
    parser.add_argument("--stratified-heldout", action="store_true")
    parser.add_argument("--seed", type=int, default=2712)
    args = parser.parse_args()
    print(build_or_reuse_streams(args.target_total_tokens, args.strict_split_dedup, args.stratified_heldout, args.seed))
