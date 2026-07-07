from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from src.browser_export.candidate_discovery import synthetic_candidate


ROOT = Path(__file__).resolve().parents[2]
HANDOFF_PATHS = (
    ROOT / "artifacts/r27a10/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json",
    ROOT / "artifacts/r27a9b/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json",
    ROOT / "artifacts/r27a8b/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json",
)


def repo_rel(path: Path | None) -> str:
    if not path:
        return ""
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def safe_repo_path(value: Any) -> str:
    if value in (None, ""):
        return ""
    path = Path(str(value))
    if not path.is_absolute():
        path = ROOT / path
    try:
        path.resolve().relative_to(ROOT.resolve())
    except ValueError:
        return ""
    return repo_rel(path)


def read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def dig_first(data: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(data, dict):
        for key in keys:
            if key in data and data[key] not in (None, ""):
                return data[key]
        for value in data.values():
            found = dig_first(value, keys)
            if found not in (None, ""):
                return found
    elif isinstance(data, list):
        for value in data:
            found = dig_first(value, keys)
            if found not in (None, ""):
                return found
    return None


def int_or_zero(value: Any) -> int:
    try:
        if isinstance(value, str):
            value = value.replace(",", "").strip()
        return max(0, int(float(value)))
    except (TypeError, ValueError):
        return 0


def discover_candidate_bytes(data: dict[str, Any]) -> dict[str, int]:
    model_q4 = int_or_zero(
        dig_first(
            data,
            (
                "model_q4_bytes",
                "q4_model_bytes",
                "q4_bytes",
                "int4_bytes",
                "candidate_q4_size_bytes",
                "quantized_model_bytes",
                "model_asset_bytes",
            ),
        )
    )
    tokenizer = int_or_zero(dig_first(data, ("tokenizer_bytes", "tokenizer_asset_bytes", "tokenizer_size_bytes")))
    shard_overhead = int_or_zero(dig_first(data, ("shard_overhead_bytes", "shards_overhead_bytes")))
    manifest_overhead = int_or_zero(dig_first(data, ("manifest_overhead_bytes", "manifest_bytes")))
    return {
        "candidate_model_q4_bytes": model_q4,
        "tokenizer_bytes": tokenizer,
        "shard_overhead_bytes": shard_overhead,
        "manifest_overhead_bytes": manifest_overhead,
    }


def candidate_from_handoff(path: Path, data: dict[str, Any]) -> dict[str, Any]:
    bytes_report = discover_candidate_bytes(data)
    checkpoint_path = safe_repo_path(
        dig_first(data, ("checkpoint_path", "best_checkpoint_path", "best_dev_loss_checkpoint", "final_checkpoint"))
    )
    tokenizer_path = safe_repo_path(dig_first(data, ("tokenizer_path", "tokenizer_manifest", "tokenizer")))
    candidate_id = str(dig_first(data, ("candidate_id", "run_id", "campaign_id", "id")) or path.parent.parent.name)
    model_config = dig_first(data, ("model_config", "config")) or {}
    if not isinstance(model_config, dict):
        model_config = {}
    blockers: list[str] = []
    if not bytes_report["candidate_model_q4_bytes"]:
        blockers.append("candidate_q4_bytes_missing")
    if checkpoint_path and not (ROOT / checkpoint_path).exists():
        blockers.append("checkpoint_path_missing")
    return {
        "candidate_id": candidate_id,
        "source_kind": path.parent.parent.name,
        "source_handoff": repo_rel(path),
        "checkpoint_path": checkpoint_path,
        "checkpoint_exists": bool(checkpoint_path and (ROOT / checkpoint_path).exists()),
        "tokenizer_path": tokenizer_path,
        "tokenizer_exists": bool(tokenizer_path and (ROOT / tokenizer_path).exists()),
        "model_config": model_config,
        "budget_inputs": bytes_report,
        "product_model": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "phase_4": False,
        "blockers": blockers,
    }


def synthetic_handoff(blockers: list[str] | None = None) -> dict[str, Any]:
    candidate = synthetic_candidate(blockers or ["no_a10_a9b_a8b_handoff_found"])
    candidate["source_kind"] = "b2_synthetic_fallback"
    candidate["budget_inputs"] = {
        "candidate_model_q4_bytes": 0,
        "tokenizer_bytes": 0,
        "shard_overhead_bytes": 0,
        "manifest_overhead_bytes": 0,
    }
    candidate["handoff_discovery"] = False
    return candidate


def discover_handoff_candidate(
    search_paths: tuple[Path, ...] | list[Path] | None = None,
    synthetic_if_missing: bool = True,
) -> dict[str, Any]:
    paths = tuple(search_paths or HANDOFF_PATHS)
    checked = [repo_rel(path) for path in paths]
    for path in paths:
        if not path.exists():
            continue
        candidate = candidate_from_handoff(path, read_json(path))
        candidate["handoff_discovery"] = True
        candidate["discovery_order"] = checked
        return candidate
    if synthetic_if_missing:
        fallback = synthetic_handoff()
        fallback["discovery_order"] = checked
        return fallback
    return {
        "candidate_id": "",
        "source_kind": "none",
        "source_handoff": "",
        "budget_inputs": {},
        "product_model": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "phase_4": False,
        "handoff_discovery": False,
        "discovery_order": checked,
        "blockers": ["no_a10_a9b_a8b_handoff_found"],
    }
