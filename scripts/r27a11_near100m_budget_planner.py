#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.eval.near100m_budget_planner import write_budget_plan


if __name__ == "__main__":
    print(write_budget_plan())
