from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
READY = ROOT / "artifacts/r27a7r2/go/R27A8B_READY.json"
BLOCKED = ROOT / "artifacts/r27a7r2/go/R27A8B_BLOCKED.json"


REQUIRED_FALSE_FLAGS = [
    "product_training",
    "formal_decoder_training",
    "phase_4",
    "product_model_admission",
    "browser_admission",
    "release_checkpoint",
]


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def display_path(path: Path) -> str:
    path = Path(path)
    if path.is_absolute():
        try:
            return str(path.relative_to(ROOT))
        except ValueError:
            return str(path)
    return str(path)


def read_launch_config(ready_path: Path = READY, blocked_path: Path = BLOCKED) -> dict:
    ready_path = Path(ready_path)
    blocked_path = Path(blocked_path)
    if blocked_path.exists():
        blocked = read_json(blocked_path)
        return {
            "ok": False,
            "status": "blocked",
            "ready_path": display_path(ready_path),
            "blocked_path": display_path(blocked_path),
            "blockers": blocked.get("blockers", ["r27a8b_blocked_marker_present"]),
            "train_allowed": False,
            "config": {},
        }
    if not ready_path.exists():
        return {
            "ok": False,
            "status": "wait",
            "ready_path": display_path(ready_path),
            "blocked_path": display_path(blocked_path),
            "blockers": ["r27a8b_ready_missing"],
            "train_allowed": False,
            "config": {},
        }
    config = read_json(ready_path)
    blockers = []
    if config.get("ready") is not True:
        blockers.append("ready_not_true")
    if config.get("safe_to_train") is not True:
        blockers.append("safe_to_train_not_true")
    if config.get("primary_token_metric") != "optimizer_tokens":
        blockers.append("primary_token_metric_not_optimizer_tokens")
    for flag in REQUIRED_FALSE_FLAGS:
        if config.get(flag) is not False:
            blockers.append(f"{flag}_must_be_false")
    selected_model = config.get("selected_model") or ""
    if not selected_model:
        blockers.append("selected_model_missing")
    selected_device = config.get("selected_device") or ""
    if selected_device not in {"mps", "cpu", "cuda"}:
        blockers.append("selected_device_invalid")
    return {
        "ok": not blockers,
        "status": "ready" if not blockers else "blocked",
        "ready_path": display_path(ready_path),
        "blocked_path": display_path(blocked_path),
        "blockers": blockers,
        "train_allowed": not blockers,
        "selected_checkpoint": config.get("selected_checkpoint"),
        "selected_model": selected_model,
        "selected_device": selected_device,
        "resource_profile": config.get("resource_profile", {}),
        "minimum_wall_clock_before_metric_stop_hours": config.get("minimum_wall_clock_before_metric_stop_hours"),
        "minimum_optimizer_tokens_before_metric_stop": config.get("minimum_optimizer_tokens_before_metric_stop"),
        "minimum_segments_before_metric_stop": config.get("minimum_segments_before_metric_stop"),
        "wall_clock_cap_hours": config.get("wall_clock_cap_hours"),
        "max_optimizer_tokens": config.get("max_optimizer_tokens"),
        "max_segments": config.get("max_segments"),
        "capacity_risk": config.get("capacity_risk"),
        "config": config,
    }
