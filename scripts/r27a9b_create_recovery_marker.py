from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.campaign.r27a9b_candidate_freeze import create_recovery_marker


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", required=True)
    parser.add_argument("--wall-clock-cap-hours", type=float, required=True)
    parser.add_argument("--max-optimizer-tokens", type=int, required=True)
    parser.add_argument("--max-segments", type=int, required=True)
    args = parser.parse_args()
    print(json.dumps(create_recovery_marker(args), ensure_ascii=False, indent=2, sort_keys=True))
