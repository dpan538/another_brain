#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.disk_reclaim import execute_reclaim


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--preserve-latest-handoffs", action="store_true")
    parser.add_argument("--preserve-best-checkpoints", action="store_true")
    parser.add_argument("--target-free-gb", type=float, default=60.0)
    parser.add_argument("--minimum-free-gb", type=float, default=35.0)
    args = parser.parse_args()
    print(execute_reclaim(args.target_free_gb, args.minimum_free_gb, args.execute))
