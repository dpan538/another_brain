#!/usr/bin/env python3
"""Prepare deterministic Codex-audit and later human spot-check samples."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_q4_source import sha256_file  # noqa: E402
from src.training.mlx.r29b2m_r1_campaign import CAMPAIGN_ID, atomic_json, utc_now  # noqa: E402


PRIORITY_FAMILIES = {
    "r29b2m_train_follow_up",
    "r29b2m_train_referent_order",
    "r29b2m_train_referent_attribute",
    "r29b2m_train_time_correction",
    "r29b2m_train_object_correction",
    "r29b2m_train_quantity_correction",
    "r29b2m_train_one_constraint",
    "r29b2m_train_two_constraints",
    "r29b2m_train_late_constraint",
    "r29b2m_train_removed_constraint",
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def stable_key(namespace: str, row: dict[str, Any]) -> str:
    return hashlib.sha256(f"{namespace}:{row['session_id']}".encode("utf-8")).hexdigest()


def select_family(
    rows: list[dict[str, Any]],
    count: int,
    *,
    namespace: str,
    exclude: set[str],
) -> list[dict[str, Any]]:
    candidates = [row for row in rows if row["session_id"] not in exclude]
    if len(candidates) < count:
        raise ValueError(f"review_sample_shortfall:{namespace}:{len(candidates)}:{count}")
    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    selected_seeds: set[str] = set()

    # Every family is represented in both train and dev before filling the
    # remaining quota.  Prefer complete multi-turn sessions and distinct seeds.
    for split in ("train", "dev"):
        split_rows = sorted(
            (row for row in candidates if row["split"] == split),
            key=lambda row: (-len(row["messages"]), stable_key(namespace, row)),
        )
        for row in split_rows:
            if row["scenario_seed_id"] in selected_seeds:
                continue
            selected.append(row)
            selected_ids.add(row["session_id"])
            selected_seeds.add(row["scenario_seed_id"])
            break

    distinct_seed_rows = sorted(
        candidates,
        key=lambda row: (-len(row["messages"]), stable_key(namespace, row)),
    )
    for row in distinct_seed_rows:
        if len(selected) >= count:
            break
        if row["session_id"] in selected_ids or row["scenario_seed_id"] in selected_seeds:
            continue
        selected.append(row)
        selected_ids.add(row["session_id"])
        selected_seeds.add(row["scenario_seed_id"])
    for row in distinct_seed_rows:
        if len(selected) >= count:
            break
        if row["session_id"] in selected_ids:
            continue
        selected.append(row)
        selected_ids.add(row["session_id"])
    if len(selected) != count:
        raise ValueError(f"review_sample_selection_failed:{namespace}:{len(selected)}:{count}")
    return sorted(selected, key=lambda row: row["session_id"])


def select_stratified(
    rows: list[dict[str, Any]],
    quotas: dict[str, int],
    *,
    namespace: str,
    exclude: set[str] | None = None,
) -> list[dict[str, Any]]:
    by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_family[row["family_id"]].append(row)
    if set(by_family) != set(quotas):
        raise ValueError("review_family_quota_mismatch")
    excluded = exclude or set()
    selected = []
    for family in sorted(by_family):
        selected.extend(select_family(by_family[family], quotas[family], namespace=f"{namespace}:{family}", exclude=excluded))
    return sorted(selected, key=lambda row: row["session_id"])


def jsonl_payload(rows: list[dict[str, Any]]) -> str:
    return "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows)


def sample_counts(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "families": dict(sorted(Counter(row["family_id"] for row in rows).items())),
        "splits": dict(sorted(Counter(row["split"] for row in rows).items())),
        "multi_turn_sessions": sum(len(row["messages"]) > 1 for row in rows),
        "distinct_scenario_seeds": len({row["scenario_seed_id"] for row in rows}),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    args = parser.parse_args()
    artifact_root = args.artifact_root.resolve()
    dataset_dir = artifact_root / "dataset"
    sessions_path = dataset_dir / "sessions.jsonl"
    validation_path = dataset_dir / "dataset_validation.json"
    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    if not validation.get("valid") or validation.get("sessions_sha256") != sha256_file(sessions_path):
        raise ValueError("review_requires_current_validated_dataset")
    rows = read_jsonl(sessions_path)
    families = sorted({row["family_id"] for row in rows})

    audit_quotas = {family: 26 if family in PRIORITY_FAMILIES else 10 for family in families}
    if sum(audit_quotas.values()) != 400:
        raise ValueError(f"audit_quota_total:{sum(audit_quotas.values())}")
    audit_rows = select_stratified(rows, audit_quotas, namespace="codex_audit")

    pack_quotas = {family: 8 for family in families}
    for family in sorted(PRIORITY_FAMILIES)[:8]:
        pack_quotas[family] += 1
    if sum(pack_quotas.values()) != 200:
        raise ValueError(f"review_pack_quota_total:{sum(pack_quotas.values())}")
    audit_ids = {row["session_id"] for row in audit_rows}
    pack_rows = select_stratified(rows, pack_quotas, namespace="human_pack", exclude=audit_ids)

    audit_dir = artifact_root / "agent_audit"
    review_dir = artifact_root / "review_pack"
    audit_dir.mkdir(parents=True, exist_ok=True)
    review_dir.mkdir(parents=True, exist_ok=True)
    audit_path = audit_dir / "semantic_audit_sample.jsonl"
    review_path = review_dir / "sessions.jsonl"
    audit_path.write_text(jsonl_payload(audit_rows), encoding="utf-8")
    review_path.write_text(jsonl_payload(pack_rows), encoding="utf-8")

    common = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "source_sessions_sha256": sha256_file(sessions_path),
        "dataset_validation_sha256": sha256_file(validation_path),
        "selection": "sha256_stable_family_split_seed_stratified_v1",
        "all_families_represented": True,
        "train_and_dev_represented_in_every_family": True,
    }
    audit_manifest = {
        **common,
        "purpose": "codex_agent_semantic_review",
        "reviewer_class": "codex_agent_semantic_review_not_human",
        "review_status": "pending",
        "human_review_completed": False,
        "sample_count": len(audit_rows),
        "sample_sha256": sha256_file(audit_path),
        "priority_families": sorted(PRIORITY_FAMILIES),
        "counts": sample_counts(audit_rows),
        "required_checks": [
            "expected_behaviour_satisfied",
            "natural_voice",
            "not_customer_service_template",
            "no_wrong_fact",
            "correct_referent",
            "not_overexplained",
        ],
    }
    review_manifest = {
        **common,
        "purpose": "later_independent_human_spot_check",
        "human_review_completed": False,
        "sample_count": len(pack_rows),
        "sample_sha256": sha256_file(review_path),
        "disjoint_from_codex_audit_sample": not ({row["session_id"] for row in pack_rows} & audit_ids),
        "counts": sample_counts(pack_rows),
    }
    atomic_json(audit_dir / "sample_manifest.json", audit_manifest)
    atomic_json(review_dir / "manifest.json", review_manifest)
    print(json.dumps({"audit_sample": len(audit_rows), "review_pack": len(pack_rows), "audit_counts": audit_manifest["counts"], "review_counts": review_manifest["counts"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
