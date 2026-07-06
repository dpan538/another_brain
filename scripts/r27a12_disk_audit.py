#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.disk_reclaim import audit_disk


if __name__ == "__main__":
    print(audit_disk())
