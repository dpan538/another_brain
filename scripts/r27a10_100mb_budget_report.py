#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.eval.full_static_budget import write_full_static_budget_report


if __name__ == "__main__":
    print(write_full_static_budget_report())
