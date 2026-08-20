#!/usr/bin/env python3
"""Adopt prior R29B2M evidence by hash and quarantine R1 data."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_r2_campaign import CAMPAIGN_ID, atomic_json, utc_now  # noqa: E402
from src.training.mlx.r29b2m_r2_quarantine import rejected_dataset_registry  # noqa: E402


R1_EXPECTED = {
    "reports/adopted_evidence.json": "6ba6b9c4b4c1fb97bc0e5e85607ba1d0372d76610605118246a966f3e6036b55",
    "reports/resource_measurement.json": "abb39967e6a75ef89aa2ab8dd6e6399d81198fd2694c4c0e6a568b9a29c8bb7b",
    "dataset/dataset_manifest.json": "73b869081bb5b3ba8ec574dafd5890920858608ddb3dedcac365b006ad793960",
    "dataset/sessions.jsonl": "64c43836f5edbb424c6cb1397255c4537fae3bf88589f4ce47496760b628fb03",
    "dataset/dataset_validation.json": "c04821bad8c4f39214ed2f776d852aee66abaa1f80d462ed2abe10f27fc618b3",
    "agent_audit/semantic_audit.json": "bf742c7c628b0d922a6e121553406418e258ae14b5fa69f6ff1e6eb2821de23a",
    "reports/final_engineering_report.json": "4fd613075ef8dd72019f858bb87bff05e0231fe002e943cbfbac97b95dfc479c",
    "campaign_state.json": "d412eafcaffdecabb699e383f92d8662926c33af7e056181a98fb6852bdda5e4",
}
EXPECTED_TOKENIZER_SHA256 = "a61b7aecc96d699be421b7d8b220e5d5cf04df3da6da5943715388a95bea115b"
EXPECTED_Q4_PACKED_SHA256 = "f04db34dc26817be216d945639cd7adc15bc916cabeda5f258000b474e64b710"
EXPECTED_ARCHITECTURE_FINGERPRINT = "e8a8c4cc92db73601de79f069ada9185da76aa1f7a44e554ef7599bef2244d90"
EXPECTED_EVAL_MANIFEST_SHA256 = "aacbdfc7dc8f0a41ced8aa2d47f9606d0b344c5c49e3bce5a64dc60a4fdfc80f"
EXPECTED_EVAL_SESSIONS_SHA256 = "a4bca4c0f7cc01e983fffb6a17f5d7b2a91621351daade883a9fa123f1b7a9cd"
REQUIRED_BASE_COMMIT = "a7c633c686085e35fb2953742dcdc649782646fb"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, text=True, capture_output=True).stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--prior-root", type=Path, required=True)
    parser.add_argument("--r1-root", type=Path, required=True)
    args = parser.parse_args()
    checks = []

    def check(name: str, actual: Any, expected: Any) -> None:
        checks.append({"name": name, "actual": actual, "expected": expected, "valid": actual == expected})

    head = git("rev-parse", "HEAD")
    check("repository.branch", git("branch", "--show-current"), "main")
    ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", REQUIRED_BASE_COMMIT, head], cwd=ROOT).returncode == 0
    check("repository.required_lineage", ancestor, True)

    r1_hashes = {}
    for relative, expected in R1_EXPECTED.items():
        path = args.r1_root / relative
        actual = sha256_file(path) if path.is_file() else None
        r1_hashes[relative] = actual
        check(f"r1.sha256.{relative}", actual, expected)
    old_state = load_json(args.r1_root / "campaign_state.json")
    old_adopted = load_json(args.r1_root / "reports" / "adopted_evidence.json")
    resource = load_json(args.r1_root / "reports" / "resource_measurement.json")
    old_audit = load_json(args.r1_root / "agent_audit" / "semantic_audit.json")
    check("r1.terminal_state", old_state.get("state"), "BLOCKED_DATA_QUALITY_WITH_EVIDENCE")
    check("r1.training_started", old_state.get("training_started"), False)
    check("r1.optimizer_tokens", old_state.get("optimizer_tokens"), 0)
    check("r1.assistant_target_tokens", old_state.get("assistant_target_tokens"), 0)
    check("r1.resource_decision", resource.get("decision"), "RESOURCE_READY")
    check("r1.policy_language_hits", old_audit.get("supporting_counts", {}).get("sample_targets_with_explicit_generator_policy_language"), 162)
    check("r1.grammar_collision_hits", old_audit.get("supporting_counts", {}).get("sample_targets_with_stock_closure_or_grammatical_collision"), 83)
    check("tokenizer.sha256", old_adopted.get("tokenizer_sha256"), EXPECTED_TOKENIZER_SHA256)
    check("q4.packed_sha256", old_adopted.get("q4_source_sha256"), EXPECTED_Q4_PACKED_SHA256)
    check("architecture.fingerprint", old_adopted.get("architecture_fingerprint"), EXPECTED_ARCHITECTURE_FINGERPRINT)

    prior_files = {
        "orientation": args.prior_root / "reports" / "orientation.json",
        "mlx_environment": args.prior_root / "reports" / "mlx_environment.json",
        "q4_source_audit": args.prior_root / "reports" / "q4_source_audit.json",
        "seed_manifest": args.prior_root / "seed" / "seed_manifest.json",
        "mlx_architecture_audit": args.prior_root / "reports" / "mlx_architecture_audit.json",
        "mlx_full_context": args.prior_root / "reports" / "mlx_full_context.json",
        "mlx_kv_parity": args.prior_root / "reports" / "mlx_kv_parity.json",
        "seed_baseline": args.prior_root / "reports" / "seed_baseline.json",
    }
    prior_hashes = {}
    expected_prior_hashes = old_adopted.get("evidence_file_sha256", {})
    for name, path in prior_files.items():
        actual = sha256_file(path) if path.is_file() else None
        prior_hashes[name] = actual
        expected = expected_prior_hashes.get(path.name)
        check(f"prior.sha256.{name}", actual, expected)

    eval_manifest = ROOT / "evals" / "r29b2m_daily_dialogue_v2" / "manifest.json"
    eval_sessions = ROOT / "evals" / "r29b2m_daily_dialogue_v2" / "sessions.jsonl"
    check("eval_v2.manifest_sha256", sha256_file(eval_manifest), EXPECTED_EVAL_MANIFEST_SHA256)
    check("eval_v2.sessions_sha256", sha256_file(eval_sessions), EXPECTED_EVAL_SESSIONS_SHA256)
    check("eval_v2.manifest_sessions_sha256", load_json(eval_manifest).get("sessions_sha256"), EXPECTED_EVAL_SESSIONS_SHA256)

    valid = all(item["valid"] for item in checks)
    report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": valid,
        "adoption_kind": "read_only_hash_and_contract_reference",
        "source_main_sha": head,
        "required_ancestor_sha": REQUIRED_BASE_COMMIT,
        "prior_r29b2m_file_sha256": prior_hashes,
        "r1_file_sha256": r1_hashes,
        "tokenizer_sha256": EXPECTED_TOKENIZER_SHA256,
        "q4_packed_sha256": EXPECTED_Q4_PACKED_SHA256,
        "architecture_fingerprint": EXPECTED_ARCHITECTURE_FINGERPRINT,
        "eval_v2_manifest_sha256": EXPECTED_EVAL_MANIFEST_SHA256,
        "eval_v2_sessions_sha256": EXPECTED_EVAL_SESSIONS_SHA256,
        "rejected_dataset_manifest_sha256": R1_EXPECTED["dataset/dataset_manifest.json"],
        "rejected_semantic_audit_sha256": R1_EXPECTED["agent_audit/semantic_audit.json"],
        "resource_decision": resource.get("decision"),
        "checks": checks,
        "copied_seed_or_dataset_or_weights": False,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "parent_checkpoint": None,
        "candidate_checkpoint": None,
    }
    atomic_json(args.artifact_root / "reports" / "adopted_evidence.json", report)
    registry = rejected_dataset_registry()
    registry.update({"campaign_id": CAMPAIGN_ID, "created_at": utc_now(), "valid": valid})
    atomic_json(args.artifact_root / "reports" / "rejected_dataset_registry.json", registry)
    print(json.dumps({"valid": valid, "checks": len(checks), "r1_terminal": old_state.get("state")}, sort_keys=True))
    return 0 if valid else 2


if __name__ == "__main__":
    raise SystemExit(main())
