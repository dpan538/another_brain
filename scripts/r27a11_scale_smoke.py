#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.model_lab.r27a11_scale_smoke import write_scale_smoke_report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", default="new_60m,new_80m,new_90m,new_96m,new_100m_research")
    parser.add_argument("--prefer-device", default="mps")
    parser.add_argument("--context-length", type=int, default=256)
    parser.add_argument("--max-smoke-steps", type=int, default=20)
    args = parser.parse_args()
    print(write_scale_smoke_report([item for item in args.candidates.split(",") if item], args.prefer_device, args.context_length, args.max_smoke_steps))
