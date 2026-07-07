#!/usr/bin/env python3
"""Shard the ignored R28M0 q4 dry-run binary into same-origin chunks."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.product_prelaunch.r28m0_dryrun import parse_target_shard_mb, write_shards


def main() -> int:
    report = write_shards(target_shard_mb=parse_target_shard_mb())
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
