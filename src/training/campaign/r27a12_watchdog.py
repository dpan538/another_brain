from __future__ import annotations

import math
import shutil
from pathlib import Path
from typing import Any


def disk_ok(path: Path, minimum_free_gb: float = 10.0) -> dict[str, Any]:
    usage = shutil.disk_usage(path)
    ok = usage.free >= int(float(minimum_free_gb) * 1_000_000_000)
    return {"ok": ok, "free_bytes": int(usage.free), "minimum_free_gb": float(minimum_free_gb), "blocker": None if ok else "disk_critical"}


def loss_ok(value: float) -> dict[str, Any]:
    ok = math.isfinite(float(value))
    return {"ok": ok, "blocker": None if ok else "nan_loss"}
