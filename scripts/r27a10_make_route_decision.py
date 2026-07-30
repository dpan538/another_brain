#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a10_route_decision import write_route_decision


if __name__ == "__main__":
    print(write_route_decision())
