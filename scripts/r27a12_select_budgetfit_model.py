#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.model_lab.r27a12_model_selection import select_budgetfit_model


if __name__ == "__main__":
    print(select_budgetfit_model())
