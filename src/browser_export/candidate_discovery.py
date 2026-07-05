from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
CHECKPOINT_SUFFIXES = {".pt", ".pth", ".ckpt", ".safetensors"}
HANDOFF_PATHS = (
    ROOT / "artifacts/r27a9/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json",
    ROOT / "artifacts/r27a8/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json",
)
ARTIFACT_CANDIDATE_ROOTS = (
    ROOT / "artifacts/r27a7",
    ROOT / "artifacts/r27a6",
)
JSON_SCAN_HINTS = ("handoff", "latest", "ledger", "baseline", "dialogue", "campaign", "report")


def repo_rel(path: Path | None) -> str:
    if path is None:
        return ""
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def safe_under_root(path: Path) -> bool:
    try:
        path.resolve().relative_to(ROOT.resolve())
        return True
    except ValueError:
        return False


def resolve_repo_path(value: str | None) -> Path | None:
    if not value:
        return None
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    if not safe_under_root(path):
        return None
    return path


def synthetic_candidate(blockers: list[str] | None = None) -> dict[str, Any]:
    return {
        "candidate_id": "r27b2_synthetic_tiny",
        "source_kind": "synthetic_fallback",
        "source_handoff": "",
        "checkpoint_path": "",
        "checkpoint_exists": False,
        "tokenizer_path": "",
        "tokenizer_exists": False,
        "model_config": {
            "model_size": "synthetic_tiny",
            "vocab_size": 32,
            "context_length": 16,
            "n_layer": 1,
            "n_head": 4,
            "n_embd": 16,
            "dropout": 0.0,
            "estimated_params": 0,
        },
        "product_model": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "blockers": blockers or ["no_a_line_candidate_handoff_or_checkpoint_found"],
    }


def _dig_first(data: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in data:
            return data[key]
    for value in data.values():
        if isinstance(value, dict):
            found = _dig_first(value, keys)
            if found not in (None, ""):
                return found
    return None


def candidate_from_metadata(path: Path, data: dict[str, Any], source_kind: str) -> dict[str, Any] | None:
    checkpoint_value = _dig_first(
        data,
        (
            "checkpoint_path",
            "best_checkpoint_path",
            "best_product_probe_checkpoint",
            "best_dev_loss_checkpoint",
            "final_checkpoint",
        ),
    )
    checkpoint_path = resolve_repo_path(str(checkpoint_value)) if checkpoint_value else None
    model_config = _dig_first(data, ("model_config", "config")) or {}
    tokenizer_value = _dig_first(data, ("tokenizer_path", "tokenizer_manifest", "tokenizer"))
    tokenizer_path = resolve_repo_path(str(tokenizer_value)) if tokenizer_value else None
    candidate_id = str(_dig_first(data, ("candidate_id", "run_id", "campaign_id", "id")) or path.stem)

    if not checkpoint_path and source_kind != "handoff":
        return None
    if not isinstance(model_config, dict):
        model_config = {}

    blockers: list[str] = []
    if checkpoint_path and not checkpoint_path.exists():
        blockers.append("candidate_checkpoint_path_missing")
    if checkpoint_path and checkpoint_path.suffix not in CHECKPOINT_SUFFIXES:
        blockers.append("candidate_checkpoint_suffix_not_supported")

    return {
        "candidate_id": candidate_id,
        "source_kind": source_kind,
        "source_handoff": repo_rel(path),
        "checkpoint_path": repo_rel(checkpoint_path),
        "checkpoint_exists": bool(checkpoint_path and checkpoint_path.exists()),
        "tokenizer_path": repo_rel(tokenizer_path),
        "tokenizer_exists": bool(tokenizer_path and tokenizer_path.exists()),
        "model_config": model_config,
        "product_model": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "blockers": blockers,
    }


def discover_handoff() -> dict[str, Any] | None:
    for path in HANDOFF_PATHS:
        if path.exists():
            candidate = candidate_from_metadata(path, read_json(path), "handoff")
            if candidate:
                return candidate
    r27a8_root = ROOT / "artifacts/r27a8/handoff"
    if r27a8_root.exists():
        for path in sorted(r27a8_root.glob("*.json")):
            candidate = candidate_from_metadata(path, read_json(path), "handoff")
            if candidate:
                return candidate
    return None


def iter_report_json(root: Path) -> list[Path]:
    if not root.exists():
        return []
    out: list[Path] = []
    for path in root.rglob("*.json"):
        rel = path.relative_to(root).as_posix().lower()
        if any(hint in rel for hint in JSON_SCAN_HINTS):
            try:
                if path.stat().st_size <= 2_000_000:
                    out.append(path)
            except OSError:
                continue
    return sorted(out)


def discover_from_a_artifacts() -> dict[str, Any] | None:
    for root in ARTIFACT_CANDIDATE_ROOTS:
        for path in iter_report_json(root):
            candidate = candidate_from_metadata(path, read_json(path), root.name)
            if candidate and candidate.get("checkpoint_path"):
                return candidate
        checkpoint_dir = root / "model_lab" / "checkpoints"
        if checkpoint_dir.exists():
            checkpoints = sorted(
                (path for path in checkpoint_dir.rglob("*") if path.suffix in CHECKPOINT_SUFFIXES),
                key=lambda item: item.stat().st_mtime if item.exists() else 0,
                reverse=True,
            )
            if checkpoints:
                checkpoint = checkpoints[0]
                return {
                    "candidate_id": f"{root.name}_{checkpoint.stem}",
                    "source_kind": root.name,
                    "source_handoff": "",
                    "checkpoint_path": repo_rel(checkpoint),
                    "checkpoint_exists": True,
                    "tokenizer_path": "",
                    "tokenizer_exists": False,
                    "model_config": {},
                    "product_model": False,
                    "browser_admission": False,
                    "release_checkpoint": False,
                    "blockers": ["no_handoff_metadata_for_checkpoint"],
                }
    return None


def discover_candidate(prefer_handoff: bool = True, synthetic_if_missing: bool = True) -> dict[str, Any]:
    seen: list[str] = []
    if prefer_handoff:
        candidate = discover_handoff()
        if candidate:
            candidate["discovery_order"] = [repo_rel(path) for path in HANDOFF_PATHS]
            return candidate
        seen.extend(repo_rel(path) for path in HANDOFF_PATHS)
    candidate = discover_from_a_artifacts()
    if candidate:
        candidate["discovery_order"] = seen + [repo_rel(root) for root in ARTIFACT_CANDIDATE_ROOTS]
        return candidate
    if synthetic_if_missing:
        fallback = synthetic_candidate()
        fallback["discovery_order"] = seen + [repo_rel(root) for root in ARTIFACT_CANDIDATE_ROOTS]
        return fallback
    return {
        "candidate_id": "",
        "source_kind": "none",
        "source_handoff": "",
        "checkpoint_path": "",
        "checkpoint_exists": False,
        "tokenizer_path": "",
        "tokenizer_exists": False,
        "model_config": {},
        "product_model": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "blockers": ["no_a_line_candidate_handoff_or_checkpoint_found"],
    }
