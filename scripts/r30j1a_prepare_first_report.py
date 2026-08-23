#!/usr/bin/env python3
"""Freeze the required aggregate R30J1A report before optimizer step 1."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def command(*args: str) -> str:
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, sort_keys=True, indent=2)
            handle.write("\n"); handle.flush(); os.fsync(handle.fileno())
        os.chmod(temporary, 0o600); os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def directory_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file()) if path.exists() else 0


def swap() -> dict[str, int]:
    import re

    result = subprocess.run(["sysctl", "-n", "vm.swapusage"], capture_output=True, text=True, check=True)
    output = {}
    for name, number, unit in re.findall(r"(total|used|free) = ([0-9.]+)([MG])", result.stdout):
        output[f"{name}_bytes"] = int(float(number) * (1024 ** (2 if unit == "M" else 3)))
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-root", type=Path, default=ROOT / "artifacts" / "r30j1a")
    args = parser.parse_args()
    head = command("git", "rev-parse", "HEAD")
    origin = command("git", "rev-parse", "origin/main")
    porcelain = command("git", "status", "--porcelain")
    if porcelain:
        raise ValueError("first_report_requires_clean_worktree")
    manifest = json.loads((args.artifact_root / "dataset" / "dataset_manifest.json").read_text(encoding="utf-8"))
    architecture = json.loads((args.artifact_root / "architecture" / "architecture_measurement.json").read_text(encoding="utf-8"))
    baselines = json.loads((args.artifact_root / "reports" / "shortcut_baselines.json").read_text(encoding="utf-8"))
    campaign = json.loads((args.artifact_root / "campaign_state.json").read_text(encoding="utf-8"))
    if int(campaign.get("global_optimizer_step", -1)) != 0 or campaign.get("training_started") is not False:
        raise ValueError("optimizer_step_one_already_started")
    import psutil

    memory = psutil.virtual_memory()
    report = {
        "schema_version": "r30j1a.first-report.v1",
        "status": "READY_FOR_10_STEP_RESOURCE_REHEARSAL",
        "head": head,
        "origin_main": origin,
        "head_equals_origin_main": head == origin,
        "worktree_clean": True,
        "campaign_id": "r30j1a_personal_representation_bootstrap_v1",
        "historical_p2_preserved": True,
        "historical_states": {
            "r30j0_p": "PERSONAL_SOURCE_EVIDENCE_READY",
            "r30j0": "HUMAN_OWNER_REVIEW_REQUIRED",
            "r30j0_p2": "R30J0_P2_PERSONA_EXCAVATION_READY",
            "r30j0_p2_expected_next": "HUMAN_PERSONA_ELICITATION_REQUIRED"
        },
        "descriptive_bootstrap_authorized": True,
        "normative_persona_training_authorized": False,
        "final_persona_training_authorized": False,
        "training_dataset_examples": manifest["example_count"],
        "authentic_owner_examples": manifest["authentic_owner_examples"],
        "controlled_variants": manifest["controlled_owner_variants"],
        "generic_examples": manifest["generic_examples"],
        "other_public_safe_examples": manifest["other_public_safe_examples"],
        "register_distribution": manifest["register_distribution"],
        "train_dev_heldout_source_counts": manifest["split_source_counts"],
        "source_leakage": manifest["source_leakage"],
        "semantic_family_leakage": manifest["semantic_family_leakage"],
        "mutation_family_leakage": manifest["mutation_family_leakage"],
        "model_source_base_params_without_lm_head": architecture["expected"]["source_base_without_lm_head_and_before_extension"],
        "model_expanded_base_params": architecture["actual"]["expanded_base_with_512_positions"],
        "projection_params": architecture["actual"]["projection"],
        "head_params": architecture["actual"]["heads"],
        "probe_trainable_params": architecture["actual"]["probe_trainable"],
        "planned_partial_adaptation_trainable_params": architecture["actual"]["last_two_partial_adaptation_trainable"],
        "context": 512,
        "normal_target": 448,
        "reserved_tokens": 64,
        "lm_head_absent": True,
        "autoregressive_decode": False,
        "surface_baseline_domain_macro_f1": baselines["surface_s1"]["domain"]["macro_f1"],
        "surface_baseline_register_macro_f1": baselines["surface_s1"]["register"]["macro_f1"],
        "lexical_baseline_domain_macro_f1": baselines["lexical_s2"]["domain"]["macro_f1"],
        "free_disk_bytes": shutil.disk_usage(args.artifact_root).free,
        "campaign_storage_budget_preferred_bytes": 14_000_000_000,
        "campaign_storage_budget_hard_bytes": 16_000_000_000,
        "campaign_storage_bytes_before_training": directory_bytes(args.artifact_root),
        "measured_pretraining_ram": {
            "total_bytes": int(memory.total),
            "available_bytes": int(memory.available),
            "percent": float(memory.percent),
        },
        "swap": swap(),
        "foreground_training": True,
        "background_training": False,
        "automation": False,
        "detached_process": False,
        "optimizer_step": 0,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "heldout_opened": False,
        "network_api_requests": 0,
        "contains_owner_text": False,
    }
    if not report["head_equals_origin_main"]:
        raise ValueError("first_report_requires_head_equal_origin_main")
    atomic_json(args.artifact_root / "reports" / "first_report_before_optimizer_step_1.json", report)
    print(json.dumps({key: report[key] for key in (
        "head", "origin_main", "worktree_clean", "training_dataset_examples", "authentic_owner_examples",
        "controlled_variants", "generic_examples", "probe_trainable_params",
        "planned_partial_adaptation_trainable_params", "free_disk_bytes", "foreground_training",
        "background_training", "optimizer_step", "heldout_opened",
    )}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
