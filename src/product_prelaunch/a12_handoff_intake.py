"""R28P0B intake for the R27A12 browser candidate handoff."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
A12_WORKTREE = Path(os.environ.get("R28P0B_A12_WORKTREE", "/Users/jarlgiovanni/Desktop/another_brain_train_r27a12"))
ARTIFACT_ROOT = ROOT / "artifacts" / "r28p0b"
REPORT_DIR = ARTIFACT_ROOT / "reports"

HANDOFF_STATUS_VALUES = {
    "product_path_engineering_candidate",
    "product_path_not_ready",
    "no_go_not_ready",
    "no_go_training_failure",
    "no_go_budget",
    "no_model",
    "WAIT_A12_RUNNING",
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def first_existing(paths: Iterable[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def default_handoff_paths(root: Path = ROOT, a12_worktree: Path = A12_WORKTREE) -> list[Path]:
    return [
        root / "artifacts" / "r27a12" / "handoff" / "R27_BROWSER_CANDIDATE_HANDOFF.json",
        a12_worktree / "artifacts" / "r27a12" / "handoff" / "R27_BROWSER_CANDIDATE_HANDOFF.json",
    ]


def default_summary_paths(root: Path = ROOT, a12_worktree: Path = A12_WORKTREE) -> list[Path]:
    return [
        root / "data" / "training_registry" / "r27a12_browser_handoff_summary.json",
        a12_worktree / "data" / "training_registry" / "r27a12_browser_handoff_summary.json",
    ]


def default_finalizer_paths(root: Path = ROOT, a12_worktree: Path = A12_WORKTREE) -> list[Path]:
    return [
        root / "artifacts" / "r27a12" / "reports" / "a12_finalizer_status.json",
        a12_worktree / "artifacts" / "r27a12" / "reports" / "a12_finalizer_status.json",
    ]


def normalize_handoff_status(raw_status: str | None) -> str:
    if not raw_status:
        return "no_model"
    normalized = raw_status.strip()
    if normalized == "product_path":
        return "product_path_engineering_candidate"
    if normalized in HANDOFF_STATUS_VALUES:
        return normalized
    if normalized.startswith("no_go"):
        return "no_go_not_ready"
    if normalized in {"blocked", "BLOCK_NO_CANDIDATE"}:
        return "no_go_not_ready"
    return "no_model"


def finalizer_says_running(finalizer: dict | None) -> bool:
    if not finalizer:
        return False
    return finalizer.get("a12_active") is True or finalizer.get("decision") == "WAIT_A12_RUNNING"


def resolve_a12_path(value: str | None, a12_worktree: Path = A12_WORKTREE) -> str | None:
    if not value:
        return None
    path = Path(value)
    if path.is_absolute():
        return path.as_posix()
    return (a12_worktree / path).as_posix()


def extract_checkpoint_path(handoff: dict, finalizer: dict | None, a12_worktree: Path = A12_WORKTREE) -> str | None:
    candidates = [
        (finalizer or {}).get("best_checkpoint"),
        handoff.get("best_checkpoint"),
        handoff.get("checkpoint_path"),
        handoff.get("source_checkpoint"),
        handoff.get("selected_checkpoint_path"),
    ]
    for candidate in candidates:
        resolved = resolve_a12_path(candidate, a12_worktree)
        if resolved:
            return resolved
    return None


def load_a12_handoff(
    *,
    root: Path = ROOT,
    a12_worktree: Path = A12_WORKTREE,
    handoff_paths: Iterable[Path] | None = None,
    summary_paths: Iterable[Path] | None = None,
    finalizer_paths: Iterable[Path] | None = None,
    synthetic_if_missing: bool = True,
) -> dict:
    handoff_candidates = default_handoff_paths(root, a12_worktree) if handoff_paths is None else handoff_paths
    summary_candidates = default_summary_paths(root, a12_worktree) if summary_paths is None else summary_paths
    finalizer_candidates = default_finalizer_paths(root, a12_worktree) if finalizer_paths is None else finalizer_paths
    handoff_path = first_existing(handoff_candidates)
    summary_path = first_existing(summary_candidates)
    finalizer_path = first_existing(finalizer_candidates)

    handoff = read_json(handoff_path) if handoff_path else {}
    summary = read_json(summary_path) if summary_path else {}
    finalizer = read_json(finalizer_path) if finalizer_path else None

    if finalizer_says_running(finalizer):
        status = "WAIT_A12_RUNNING"
    else:
        raw_status = (
            handoff.get("candidate_route")
            or handoff.get("handoff_status")
            or summary.get("candidate_route")
            or summary.get("handoff_status")
        )
        status = normalize_handoff_status(raw_status)

    if not handoff and status == "no_model" and not synthetic_if_missing:
        hard_blockers = ["a12_handoff_missing"]
    else:
        hard_blockers = []

    budget_row = handoff.get("budget_row") or summary.get("budget_row") or {}
    checkpoint_path = extract_checkpoint_path(handoff, finalizer, a12_worktree)
    checkpoint_exists = bool(checkpoint_path and Path(checkpoint_path).exists())

    if status == "no_model":
        hard_blockers.append("no_a12_candidate_handoff")
    if status.startswith("no_go"):
        hard_blockers.append(status)

    report = {
        "ok": status != "WAIT_A12_RUNNING",
        "decision": "WAIT_A12_RUNNING" if status == "WAIT_A12_RUNNING" else "A12_HANDOFF_INTAKEN",
        "handoff_status": status,
        "candidate_route": status,
        "handoff_exists": bool(handoff_path),
        "handoff_source": handoff_path.as_posix() if handoff_path else None,
        "summary_exists": bool(summary_path),
        "summary_source": summary_path.as_posix() if summary_path else None,
        "finalizer_exists": bool(finalizer_path),
        "finalizer_source": finalizer_path.as_posix() if finalizer_path else None,
        "a12_active": bool(finalizer_says_running(finalizer)),
        "a12_completed": (finalizer or {}).get("a12_completed"),
        "marker_consumed": (finalizer or {}).get("marker_consumed"),
        "active_approvals": int((finalizer or {}).get("active_approvals", 0) or 0),
        "selected_model": handoff.get("selected_model") or summary.get("selected_model") or "no_model",
        "campaign_id": handoff.get("campaign_id") or summary.get("campaign_id"),
        "selected_checkpoint": handoff.get("selected_checkpoint") or summary.get("selected_checkpoint"),
        "best_checkpoint_path": checkpoint_path,
        "best_checkpoint_exists": checkpoint_exists,
        "optimizer_tokens": handoff.get("optimizer_tokens") or summary.get("optimizer_tokens"),
        "wall_clock_seconds": handoff.get("wall_clock_seconds") or summary.get("wall_clock_seconds"),
        "eval_train_loss": handoff.get("eval_train_loss") or summary.get("eval_train_loss"),
        "dev_loss": handoff.get("dev_loss") or summary.get("dev_loss"),
        "stratified_heldout_loss": handoff.get("stratified_heldout_loss") or summary.get("stratified_heldout_loss"),
        "dialogue_readiness": handoff.get("dialogue_readiness") or summary.get("dialogue_readiness"),
        "rag_honesty": handoff.get("rag_honesty") or summary.get("rag_honesty"),
        "collapse_risk": handoff.get("collapse_risk") or summary.get("collapse_risk"),
        "safety_guard": handoff.get("safety_guard") or summary.get("safety_guard"),
        "full_static_100mb_fit": handoff.get("full_static_100mb_fit") or summary.get("full_static_100mb_fit"),
        "budget_row": budget_row,
        "synthetic_fallback_allowed": bool(synthetic_if_missing),
        "hard_blockers": sorted(set(hard_blockers)),
        "non_claims": {
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "phase_4": False,
        },
    }
    return report


def write_intake_report(report: dict, artifact_root: Path = ARTIFACT_ROOT) -> Path:
    path = artifact_root / "reports" / "a12_handoff_intake.json"
    write_json(path, report)
    return path
