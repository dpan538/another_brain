from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.campaign.r27a9b_candidate_freeze import rank_candidates


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--include-recovery", action="store_true")
    args = parser.parse_args()
    print(json.dumps(rank_candidates(include_recovery=args.include_recovery), ensure_ascii=False, indent=2, sort_keys=True))
