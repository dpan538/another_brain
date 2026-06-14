#!/usr/bin/env python3
"""Validate frozen train/dev/blind dataset split manifest."""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "evals" / "dataset_splits" / "dataset_split_manifest.json"
REQUIRED_DATASETS = {
    "identity_surface",
    "help_onboarding",
    "privacy_boundary",
    "voice_style",
    "logic_psych_ethics",
    "rewrite_short",
    "adversarial",
}
REQUIRED_FIELDS = {"id", "family_id", "source", "visibility", "split", "action"}
VALID_SPLITS = {"train", "dev", "blind"}
PUBLIC_VISIBILITIES = {"public", "allowed_if_asked", "style_only"}
TARGET_RATIOS = {"train": 0.70, "dev": 0.15, "blind": 0.15}


def fail(message: str) -> int:
    print(f"dataset split validation failed: {message}", file=sys.stderr)
    return 2


def load_manifest(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise RuntimeError(f"missing manifest: {path.relative_to(ROOT)}") from None
    except json.JSONDecodeError as error:
        raise RuntimeError(f"invalid JSON: {error}") from None


def main() -> int:
    manifest_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_MANIFEST
    try:
        manifest = load_manifest(manifest_path)
    except RuntimeError as error:
        return fail(str(error))

    cases = manifest.get("cases", [])
    if not isinstance(cases, list) or not cases:
        return fail("manifest must contain non-empty cases list")

    datasets = {item.get("dataset") for item in cases}
    missing_datasets = sorted(REQUIRED_DATASETS - datasets)
    if missing_datasets:
        return fail(f"missing datasets: {', '.join(missing_datasets)}")

    seen_ids = set()
    family_splits: dict[tuple[str, str], set[str]] = defaultdict(set)
    split_counts_by_dataset: dict[str, Counter] = defaultdict(Counter)
    training_blind_cases = []

    for index, item in enumerate(cases):
        if not isinstance(item, dict):
            return fail(f"case at index {index} is not an object")
        missing = REQUIRED_FIELDS - item.keys()
        if missing:
            return fail(f"{item.get('id', index)} missing fields: {', '.join(sorted(missing))}")
        if "dataset" not in item:
            return fail(f"{item['id']} missing dataset")
        if item["id"] in seen_ids:
            return fail(f"duplicate id: {item['id']}")
        seen_ids.add(item["id"])
        if item["split"] not in VALID_SPLITS:
            return fail(f"{item['id']} has invalid split: {item['split']}")
        if item["visibility"] not in PUBLIC_VISIBILITIES:
            return fail(f"{item['id']} has non-public visibility: {item['visibility']}")
        if item.get("used_for_training") and item["split"] == "blind":
            training_blind_cases.append(item["id"])
        family_splits[(item["dataset"], item["family_id"])].add(item["split"])
        split_counts_by_dataset[item["dataset"]][item["split"]] += 1

    if training_blind_cases:
        return fail(f"blind cases marked used_for_training: {', '.join(training_blind_cases[:10])}")

    leaked_families = [
        f"{dataset}:{family_id}"
        for (dataset, family_id), splits in family_splits.items()
        if len(splits) > 1
    ]
    if leaked_families:
        return fail(f"families appear in multiple splits: {', '.join(leaked_families[:10])}")

    ratio_summary = {}
    for dataset in sorted(REQUIRED_DATASETS):
        counts = split_counts_by_dataset[dataset]
        if set(counts) != VALID_SPLITS:
            return fail(f"{dataset} must include train/dev/blind splits")
        total = sum(counts.values())
        ratios = {split: counts[split] / total for split in sorted(VALID_SPLITS)}
        ratio_summary[dataset] = {"total": total, "counts": dict(counts), "ratios": ratios}
        for split, target in TARGET_RATIOS.items():
            if abs(ratios[split] - target) > 0.001:
                return fail(f"{dataset} split {split} ratio {ratios[split]:.3f} != {target:.2f}")

    report = {
        "ok": True,
        "manifest": str(manifest_path.relative_to(ROOT)),
        "cases": len(cases),
        "datasets": sorted(datasets),
        "ratioSummary": ratio_summary,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
