from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, write_json, write_text


DESKTOP = ROOT.parent
ART = ROOT / "artifacts/r27a12"
REPORTS = ART / "reports"
TARGET_ROUNDS = [
    "r27a2",
    "r27a3",
    "r27a4",
    "r27a5",
    "r27a6",
    "r27a7",
    "r27a7r",
    "r27a7r2",
    "r27a8b",
    "r27a9b",
    "r27a10",
    "r27a11",
    "r27a12",
]
PROTECTED_DIR_NAMES = {"private_sources", "data/public_ingestion"}
PROTECTED_SUFFIXES = {".doc", ".docx", ".pdf", ".xls", ".xlsx", ".csv"}


@dataclass(frozen=True)
class ReclaimCandidate:
    path: Path
    size_bytes: int
    reason: str


def _size_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file() or path.is_symlink():
        try:
            return int(path.stat().st_size)
        except OSError:
            return 0
    total = 0
    for root, dirs, files in os.walk(path):
        for name in files:
            try:
                total += int((Path(root) / name).lstat().st_size)
            except OSError:
                continue
    return total


def _rel_to_worktree(path: Path, worktree: Path) -> str | None:
    try:
        return str(path.relative_to(worktree))
    except ValueError:
        return None


def _worktrees() -> list[Path]:
    roots = []
    for path in sorted(DESKTOP.glob("another_brain*")):
        if (path / ".git").exists():
            roots.append(path)
    return roots


def _run_git(worktree: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", "-C", str(worktree), *args], text=True, capture_output=True, check=False)


def _is_tracked(path: Path, worktree: Path) -> bool:
    rel = _rel_to_worktree(path, worktree)
    if rel is None:
        return True
    return _run_git(worktree, ["ls-files", "--error-unmatch", "--", rel]).returncode == 0


def _is_ignored(path: Path, worktree: Path) -> bool:
    rel = _rel_to_worktree(path, worktree)
    if rel is None:
        return False
    return _run_git(worktree, ["check-ignore", "-q", "--", rel]).returncode == 0


def _is_inside_artifacts(path: Path, worktree: Path) -> bool:
    rel = _rel_to_worktree(path, worktree)
    return bool(rel and (rel == "artifacts" or rel.startswith("artifacts/")))


def _protected_path(path: Path, worktree: Path) -> bool:
    rel = _rel_to_worktree(path, worktree) or str(path)
    if any(part in rel for part in PROTECTED_DIR_NAMES):
        return True
    if len(path.parts) <= len(worktree.parts) + 1 and path.suffix.lower() in PROTECTED_SUFFIXES:
        return True
    keep_fragments = [
        "artifacts/r27a12",
        "artifacts/r27a11/handoff",
        "artifacts/r27a11/reports",
        "artifacts/r27a10/handoff",
        "artifacts/r27a10/reports",
        "artifacts/r27a9b/handoff",
        "artifacts/r27a9b/reports",
        "another_brain_train_r27a11/artifacts/r27a4/model_lab/tokenizer",
        "another_brain_train_r27a11/artifacts/r27a7/training_mix",
    ]
    compact = str(path)
    return any(fragment in compact for fragment in keep_fragments)


def _best_checkpoint_keep(path: Path) -> bool:
    text = str(path)
    keep_fragments = [
        "another_brain_train_r27a8b/artifacts/r27a8b/model_lab/checkpoints/r27a8b_resource_safe_overnight_v1_seg09",
        "another_brain_train_r27a7r/artifacts/r27a7/model_lab/checkpoints/r27a7_mps_24h_large_decoder_v1_seg3",
        "another_brain/artifacts/r27a7/model_lab/checkpoints/r27a7_mps_24h_large_decoder_v1_seg3",
    ]
    return any(fragment in text for fragment in keep_fragments)


def disk_free_report() -> dict[str, int]:
    usage = shutil.disk_usage(DESKTOP)
    return {
        "total_bytes": int(usage.total),
        "used_bytes": int(usage.used),
        "free_bytes": int(usage.free),
        "free_gb": round(usage.free / 1_000_000_000, 3),
    }


def audit_disk() -> dict[str, Any]:
    worktree_rows = []
    round_rows = []
    special_rows = []
    for worktree in _worktrees():
        artifacts = worktree / "artifacts"
        worktree_rows.append(
            {
                "worktree": str(worktree),
                "artifacts_size_bytes": _size_bytes(artifacts),
                "exists": artifacts.exists(),
            }
        )
        for round_name in TARGET_ROUNDS:
            path = artifacts / round_name
            if path.exists():
                round_rows.append({"path": str(path), "round": round_name, "size_bytes": _size_bytes(path)})
        for marker in ["model_lab/checkpoints", "raw_public_samples", "clean_public_samples", "training_mix", "model_lab/runs"]:
            for path in artifacts.glob(f"*/{marker}"):
                special_rows.append({"path": str(path), "kind": marker, "size_bytes": _size_bytes(path)})
        distillation = artifacts / "distillation"
        if distillation.exists():
            special_rows.append({"path": str(distillation), "kind": "legacy_distillation_artifacts", "size_bytes": _size_bytes(distillation)})
    report = {
        "ok": True,
        "created_at_utc": now_utc(),
        "disk": disk_free_report(),
        "repo_size_bytes": _size_bytes(ROOT),
        "worktrees": worktree_rows,
        "rounds": sorted(round_rows, key=lambda row: row["size_bytes"], reverse=True),
        "artifact_classes": sorted(special_rows, key=lambda row: row["size_bytes"], reverse=True),
        **NON_CLAIMS,
    }
    write_json(REPORTS / "disk_audit.json", report)
    write_text(ROOT / "docs/r27/R27A12_DISK_RECLAIM.md", render_disk_doc(report, None))
    return report


def _candidate_dirs(worktree: Path) -> list[ReclaimCandidate]:
    artifacts = worktree / "artifacts"
    rows: list[ReclaimCandidate] = []
    if not artifacts.exists():
        return rows
    for marker, reason in [
        ("raw_public_samples", "old_raw_public_samples"),
        ("clean_public_samples", "old_clean_public_samples"),
        ("training_mix", "duplicate_training_mix"),
        ("model_lab/runs", "old_run_logs"),
    ]:
        for path in artifacts.glob(f"*/{marker}"):
            if not path.exists() or _protected_path(path, worktree):
                continue
            rows.append(ReclaimCandidate(path=path, size_bytes=_size_bytes(path), reason=reason))
    distillation = artifacts / "distillation"
    if distillation.exists() and not _protected_path(distillation, worktree):
        rows.append(ReclaimCandidate(path=distillation, size_bytes=_size_bytes(distillation), reason="legacy_distillation_artifacts"))
    return rows


def _candidate_checkpoint_files(worktree: Path) -> list[ReclaimCandidate]:
    rows: list[ReclaimCandidate] = []
    for path in (worktree / "artifacts").glob("*/model_lab/checkpoints/**/*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".pt", ".pth", ".safetensors", ".ckpt"}:
            continue
        if _best_checkpoint_keep(path):
            continue
        rows.append(ReclaimCandidate(path=path, size_bytes=_size_bytes(path), reason="old_intermediate_checkpoint"))
    return rows


def _safe_candidate(candidate: ReclaimCandidate) -> tuple[bool, str]:
    for worktree in _worktrees():
        if _rel_to_worktree(candidate.path, worktree) is None:
            continue
        if not _is_inside_artifacts(candidate.path, worktree):
            return False, "not_inside_artifacts"
        if _protected_path(candidate.path, worktree):
            return False, "protected_path"
        if _is_tracked(candidate.path, worktree):
            return False, "tracked_file_or_dir"
        if not _is_ignored(candidate.path, worktree):
            return False, "not_gitignored"
        return True, "safe"
    return False, "outside_known_worktree"


def build_reclaim_plan(target_free_gb: float = 60.0) -> dict[str, Any]:
    current = disk_free_report()
    target_bytes = int(float(target_free_gb) * 1_000_000_000)
    needed = max(0, target_bytes - int(current["free_bytes"]))
    candidates: list[ReclaimCandidate] = []
    for worktree in _worktrees():
        candidates.extend(_candidate_checkpoint_files(worktree))
        candidates.extend(_candidate_dirs(worktree))
    safe_rows = []
    rejected_rows = []
    for candidate in sorted(candidates, key=lambda row: row.size_bytes, reverse=True):
        safe, reason = _safe_candidate(candidate)
        row = {"path": str(candidate.path), "size_bytes": candidate.size_bytes, "reason": candidate.reason, "safety": reason}
        if safe:
            safe_rows.append(row)
        else:
            rejected_rows.append(row)
    selected = []
    reclaimed = 0
    for row in safe_rows:
        if reclaimed >= needed:
            break
        selected.append(row)
        reclaimed += int(row["size_bytes"])
    return {
        "ok": True,
        "created_at_utc": now_utc(),
        "target_free_gb": float(target_free_gb),
        "disk_before": current,
        "bytes_needed_for_target": needed,
        "selected_for_delete": selected,
        "selected_bytes": reclaimed,
        "safe_candidates": safe_rows,
        "rejected_candidates": rejected_rows[:200],
        **NON_CLAIMS,
    }


def execute_reclaim(target_free_gb: float = 60.0, minimum_free_gb: float = 35.0, execute: bool = False) -> dict[str, Any]:
    plan = build_reclaim_plan(target_free_gb)
    write_json(REPORTS / "reclaim_manifest.json", plan)
    deleted = []
    failures = []
    if execute:
        for row in plan.get("selected_for_delete", []):
            path = Path(row["path"])
            try:
                if path.is_dir() and not path.is_symlink():
                    shutil.rmtree(path)
                elif path.exists():
                    path.unlink()
                deleted.append(row)
            except Exception as exc:
                failures.append({**row, "error": repr(exc)})
    after = disk_free_report()
    min_bytes = int(float(minimum_free_gb) * 1_000_000_000)
    report = {
        "ok": not failures and int(after["free_bytes"]) >= min_bytes,
        "created_at_utc": now_utc(),
        "execute": bool(execute),
        "target_free_gb": float(target_free_gb),
        "minimum_free_gb": float(minimum_free_gb),
        "disk_before": plan.get("disk_before"),
        "disk_after": after,
        "deleted": deleted,
        "deleted_bytes_planned": sum(int(row["size_bytes"]) for row in deleted),
        "failures": failures,
        "blockers": [] if int(after["free_bytes"]) >= min_bytes else ["BLOCK_DISK_SPACE"],
        **NON_CLAIMS,
    }
    write_json(REPORTS / "safe_reclaim_report.json", report)
    audit = audit_disk()
    write_text(ROOT / "docs/r27/R27A12_DISK_RECLAIM.md", render_disk_doc(audit, report))
    return report


def render_disk_doc(audit: dict[str, Any], reclaim: dict[str, Any] | None) -> str:
    top_rounds = "\n".join(
        f"- `{row['path']}`: {round(row['size_bytes'] / 1_000_000_000, 3)} GB"
        for row in audit.get("rounds", [])[:12]
    )
    reclaim_block = "Reclaim has not run yet."
    if reclaim:
        reclaim_block = (
            f"- Execute: `{reclaim.get('execute')}`\n"
            f"- Free before: `{reclaim.get('disk_before', {}).get('free_gb')}` GB\n"
            f"- Free after: `{reclaim.get('disk_after', {}).get('free_gb')}` GB\n"
            f"- Deleted entries: `{len(reclaim.get('deleted', []))}`\n"
            f"- Blockers: `{reclaim.get('blockers')}`"
        )
    return f"""# R27A12 Disk Reclaim

R27A12 may reclaim only ignored artifact outputs. It does not delete tracked files, root documents, `data/public_ingestion`, private sources, or B-line source files.

## Disk

- Free: `{audit.get('disk', {}).get('free_gb')}` GB
- Repo size: `{round(int(audit.get('repo_size_bytes', 0)) / 1_000_000_000, 3)}` GB

## Largest Artifact Rounds

{top_rounds}

## Reclaim

{reclaim_block}

Latest handoffs and the R27A11 tokenizer/stream sources needed by A12 are preserved. No weights or artifacts are committed.
"""
