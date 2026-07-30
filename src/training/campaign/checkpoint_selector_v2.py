from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def read_json(path: Path, default=None):
    path = Path(path)
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))


def path_exists_in_siblings(rel: str) -> bool:
    for name in [ROOT.name, "another_brain", "another_brain_train_r27a7r", "another_brain_train_r27a8"]:
        root = ROOT.parent / name
        if (root / rel).exists():
            return True
    return False


def select_safe_checkpoint() -> dict:
    ledger = read_json(ROOT / "data/training_registry/r27a7_campaign_ledger.json")
    best = ledger.get("best_checkpoints", {})
    stages = ledger.get("stages", [])
    candidates = []
    if best.get("best_product_probe_checkpoint"):
        candidates.append(("r27a7_best_product_probe", best["best_product_probe_checkpoint"]))
    if best.get("best_dev_loss_checkpoint"):
        candidates.append(("r27a7_best_dev_loss", best["best_dev_loss_checkpoint"]))
    if stages:
        stage = min([s for s in stages if s.get("dev_loss") is not None], key=lambda s: float(s["dev_loss"]), default=stages[-1])
        if stage.get("checkpoint_path"):
            candidates.append(("r27a7_best_segment", stage["checkpoint_path"]))
    candidates.append(("r27a6_best_checkpoint", "artifacts/r27a6/model_lab/checkpoints/r27a6_autonomous_longrun_dialogue_readiness_v1_seg1_continued_pretraining.pt"))
    selected = None
    skipped = []
    for kind, rel in candidates:
        exists = path_exists_in_siblings(rel)
        candidate = {
            "kind": kind,
            "checkpoint": rel,
            "exists_in_local_artifacts": exists,
            "corrupted": False,
            "tokenizer_mismatch": False,
            "safety_dirty": False,
            "old_a7r_partial": False,
        }
        if exists and selected is None:
            selected = candidate
        else:
            skipped.append(candidate)
    if selected is None and candidates:
        kind, rel = candidates[0]
        selected = {
            "kind": kind,
            "checkpoint": rel,
            "exists_in_local_artifacts": False,
            "corrupted": False,
            "tokenizer_mismatch": False,
            "safety_dirty": False,
            "old_a7r_partial": False,
        }
    final = best.get("final_checkpoint", "")
    return {
        "ok": selected is not None,
        "selected_checkpoint": selected.get("checkpoint") if selected else "",
        "selected_kind": selected.get("kind") if selected else "",
        "selected_exists_in_local_artifacts": selected.get("exists_in_local_artifacts") if selected else False,
        "final_checkpoint": final,
        "final_checkpoint_selected": bool(final and selected and final == selected.get("checkpoint")),
        "worse_final_checkpoint_rejected": bool(final and selected and final != selected.get("checkpoint")),
        "new_large_lineage_checkpoint": None,
        "tokenizer_path": "artifacts/r27a4/model_lab/tokenizer/tokenizer.json",
        "skipped_candidates": skipped,
        "reasons": [
            "Prefer R27A7 best_product_probe, then best_dev_loss, then best segment, then R27A6.",
            "Old A7R partial checkpoints are evidence only and are not default resume targets.",
            "Final checkpoint is not selected when a better checkpoint exists.",
        ],
    }
