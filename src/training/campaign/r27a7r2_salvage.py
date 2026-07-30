from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def read_json(path: Path, default=None):
    path = Path(path)
    if not path.exists():
        return {} if default is None else default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"_read_error": repr(exc)}


def sibling_root(name: str) -> Path:
    return ROOT.parent / name


def existing_roots() -> dict:
    return {
        "main_workspace": sibling_root("another_brain"),
        "old_a7r_worktree": sibling_root("another_brain_train_r27a7r"),
        "old_a8_worktree": sibling_root("another_brain_train_r27a8"),
        "current_r27a7r2_worktree": ROOT,
    }


def pgrep(pattern: str) -> list[str]:
    try:
        proc = subprocess.run(["pgrep", "-fl", pattern], text=True, capture_output=True, check=False, timeout=5)
    except Exception as exc:
        return [f"process_check_error:{repr(exc)}"]
    if proc.returncode not in {0, 1}:
        return [f"process_check_failed:{proc.stderr.strip()}"]
    return [line for line in proc.stdout.splitlines() if line.strip()]


def checkpoint_probe(path: Path) -> dict:
    if not path.exists():
        return {"path": str(path), "exists": False, "corrupted": False}
    result = {"path": str(path), "exists": True, "bytes": path.stat().st_size, "corrupted": False}
    if result["bytes"] > 250_000_000:
        result["corruption_check_skipped"] = "file_too_large_for_safe_salvage_probe"
        return result
    if path.suffix in {".pt", ".pth", ".ckpt"}:
        try:
            import torch

            torch.load(path, map_location="cpu", weights_only=False)
        except Exception as exc:
            result["corrupted"] = True
            result["error"] = repr(exc)
    return result


def salvage_previous_a7r() -> dict:
    roots = existing_roots()
    old_a7r_root = roots["old_a7r_worktree"]
    old_a8_root = roots["old_a8_worktree"]
    marker_candidates = [
        old_a7r_root / "training/from_scratch/APPROVE_R27A7R_CORRECTED_LONGRUN_RESTART_V1.json",
        roots["main_workspace"] / "training/from_scratch/APPROVE_R27A7R_CORRECTED_LONGRUN_RESTART_V1.json",
    ]
    markers = []
    active_approval = False
    marker_unclear = False
    for marker_path in marker_candidates:
        marker = read_json(marker_path)
        if marker_path.exists():
            is_active = marker.get("approved") is True and marker.get("consumed") is not True
            active_approval = active_approval or is_active
            marker_unclear = marker_unclear or bool(marker.get("_read_error"))
            markers.append({
                "path": str(marker_path),
                "exists": True,
                "approved": marker.get("approved"),
                "consumed": marker.get("consumed"),
                "active_training_approval": is_active,
                "read_error": marker.get("_read_error", ""),
            })
        else:
            markers.append({"path": str(marker_path), "exists": False, "active_training_approval": False})
    partial_checkpoints = []
    for root_name, root in roots.items():
        for base in [root / "artifacts/r27a7r", root / "artifacts/r27a8"]:
            if base.exists():
                for path in sorted(base.glob("**/*.pt"))[:20]:
                    partial_checkpoints.append(checkpoint_probe(path))
    incomplete_ledgers = []
    for root_name, root in roots.items():
        for path in [
            root / "data/training_registry/r27a7r_campaign_ledger.json",
            root / "data/training_registry/r27a8_campaign_ledger.json",
            root / "artifacts/r27a7r/reports/corrected_campaign_decision.json",
            root / "artifacts/r27a8/reports/expansion_campaign_decision.json",
        ]:
            if path.exists():
                data = read_json(path)
                incomplete_ledgers.append({
                    "root": root_name,
                    "path": str(path),
                    "exists": True,
                    "ok": data.get("ok"),
                    "campaign_id": data.get("campaign_id"),
                    "stop_reason": data.get("stop_reason"),
                    "read_error": data.get("_read_error", ""),
                })
    processes = {
        "r27a7r_scale_smoke": pgrep("r27a7r_scale_smoke"),
        "r27a7r_longrun": pgrep("r27a7r_run_corrected_longrun"),
        "r27a8_campaign": pgrep("r27a8_run_expansion_campaign"),
    }
    corrupted = [item for item in partial_checkpoints if item.get("corrupted")]
    blockers = []
    if active_approval:
        blockers.append("active_approval_stuck")
    if marker_unclear:
        blockers.append("needs_manual_marker_cleanup")
    if corrupted:
        blockers.append("corrupted_partial_checkpoint_present")
    if any(processes.values()):
        blockers.append("training_process_still_running")
    report = {
        "ok": not blockers,
        "previous_a7r_artifacts_exist": any((root / "artifacts/r27a7r").exists() for root in roots.values()),
        "previous_a8_artifacts_exist": old_a8_root.exists() and (old_a8_root / "artifacts/r27a8").exists(),
        "markers": markers,
        "active_training_approval": active_approval,
        "needs_manual_marker_cleanup": marker_unclear,
        "partial_checkpoints": partial_checkpoints,
        "corrupted_checkpoints": corrupted,
        "incomplete_ledgers": incomplete_ledgers,
        "training_processes": processes,
        "stop_files_or_crash_traces": [],
        "old_partial_artifacts_resume_target": False,
        "blockers": blockers,
    }
    return report
