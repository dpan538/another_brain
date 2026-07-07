#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    result = subprocess.run(
        ["node", "scripts/r28tok0_node_exact_tokenizer_smoke.mjs"],
        cwd=ROOT,
        text=True,
    )
    return int(result.returncode or 0)


if __name__ == "__main__":
    raise SystemExit(main())
