#!/usr/bin/env python3
"""Adopt R29B2M evidence only after hashes and contracts are re-verified."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.training.mlx.r29b2m_daily_eval import frozen_sessions, session_manifest_sha256  # noqa: E402
from src.training.mlx.r29b2m_model import architecture_fingerprint, expected_tensor_shapes  # noqa: E402
from src.training.mlx.r29b2m_q4_source import load_r28m1_q4_source, sha256_file  # noqa: E402
from src.training.mlx.r29b2m_r1_campaign import CAMPAIGN_ID, atomic_json, utc_now  # noqa: E402
from src.training.mlx.r29b2m_tokenizer import WRAPPER_VERSION  # noqa: E402


BASE_COMMIT = "13b45f9d7783a42b03a1e14e63ee7bdd06241c5c"
BASE_PARENT = "505d4e27a2a523e5b46e4a5d36fecffbbb7c507a"
REQUIRED_REPORTS = (
    "orientation.json",
    "mlx_environment.json",
    "q4_source_audit.json",
    "mlx_architecture_audit.json",
    "mlx_full_context.json",
    "mlx_kv_parity.json",
    "seed_baseline.json",
    "seed_failure_bank.jsonl",
    "resource_gate.json",
)


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"json_object_required:{path.name}")
    return value


def git(*args: str) -> str:
    result = subprocess.run(["git", *args], cwd=REPO_ROOT, check=True, text=True, capture_output=True)
    return result.stdout.strip()


def check(name: str, actual: Any, expected: Any, rows: list[dict[str, Any]]) -> None:
    rows.append({"name": name, "actual": actual, "expected": expected, "valid": actual == expected})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--prior-artifact-root", type=Path, required=True)
    args = parser.parse_args()
    prior = args.prior_artifact_root.resolve()
    reports = prior / "reports"
    checks: list[dict[str, Any]] = []

    branch = git("branch", "--show-current")
    head = git("rev-parse", "HEAD")
    origin_main = git("rev-parse", "origin/main")
    base_parent = git("rev-parse", f"{BASE_COMMIT}^")
    base_is_ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", BASE_COMMIT, head], cwd=REPO_ROOT).returncode == 0
    check("repository.branch", branch, "main", checks)
    check("repository.origin_main_matches_head", origin_main, head, checks)
    check("repository.r29b2m_base_parent", base_parent, BASE_PARENT, checks)
    check("repository.r29b2m_base_is_ancestor", base_is_ancestor, True, checks)

    required_paths = [reports / name for name in REQUIRED_REPORTS] + [prior / "campaign_state.json", prior / "seed" / "seed_manifest.json", prior / "seed" / "model_seed.safetensors", prior / "environment" / "environment_manifest.json", prior / "environment" / "pip_freeze.txt"]
    missing = [str(path) for path in required_paths if not path.is_file()]
    check("prior.required_evidence_files_present", missing, [], checks)
    if missing:
        raise FileNotFoundError(";".join(missing))

    orientation = load_json(reports / "orientation.json")
    environment = load_json(reports / "mlx_environment.json")
    q4_audit = load_json(reports / "q4_source_audit.json")
    seed_manifest = load_json(prior / "seed" / "seed_manifest.json")
    architecture = load_json(reports / "mlx_architecture_audit.json")
    full_context = load_json(reports / "mlx_full_context.json")
    kv = load_json(reports / "mlx_kv_parity.json")
    baseline = load_json(reports / "seed_baseline.json")
    old_gate = load_json(reports / "resource_gate.json")
    old_state = load_json(prior / "campaign_state.json")
    environment_manifest = load_json(prior / "environment" / "environment_manifest.json")

    check("prior.orientation_valid", orientation.get("valid"), True, checks)
    check("prior.orientation_source_revision", orientation.get("repository", {}).get("head"), BASE_PARENT, checks)
    check("prior.terminal_state", old_state.get("state"), "ABORTED_SAFELY", checks)
    check("prior.old_fixed_gate_terminal_unchanged", old_gate.get("decision"), "ABORTED_SAFELY", checks)
    check("prior.training_started", old_state.get("training_started"), False, checks)
    check("prior.optimizer_tokens", old_state.get("optimizer_tokens"), 0, checks)
    check("prior.assistant_target_tokens", old_state.get("assistant_target_tokens"), 0, checks)

    python = Path(str(environment_manifest["python"]))
    check("environment.python_path_from_manifest_exists", python.is_file(), True, checks)
    probe = subprocess.run([str(python), "-I", "-c", "import mlx.core as mx; print(mx.__version__)"], check=False, text=True, capture_output=True, timeout=30)
    check("environment.mlx_probe_exit", probe.returncode, 0, checks)
    check("environment.mlx_version", probe.stdout.strip(), "0.32.0", checks)
    check("environment.report_valid", environment.get("valid"), True, checks)
    check("environment.pip_freeze_sha256", sha256_file(prior / "environment" / "pip_freeze.txt"), environment_manifest.get("pip_freeze_sha256"), checks)

    source = load_r28m1_q4_source(REPO_ROOT / "web" / "another_brain" / "model_assets" / "r28m1")
    tokenizer_path = REPO_ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "tokenizer" / "runtime_tokenizer.json"
    seed_path = prior / "seed" / "model_seed.safetensors"
    seed_manifest_path = prior / "seed" / "seed_manifest.json"
    check("q4.source_sha256", source.source_sha256, q4_audit.get("q4_source_sha256"), checks)
    check("q4.source_sha256_manifest", source.source_sha256, seed_manifest.get("source_quantized_sha256"), checks)
    check("tokenizer.sha256", sha256_file(tokenizer_path), q4_audit.get("tokenizer_sha256"), checks)
    check("seed.safetensors_sha256", sha256_file(seed_path), seed_manifest.get("seed_safetensors_sha256"), checks)
    check("seed.manifest_sha256", sha256_file(seed_manifest_path), q4_audit.get("seed_manifest_sha256"), checks)
    check("seed.kind", seed_manifest.get("source_kind"), "r28m1_q4_recovered_seed", checks)
    check("seed.fp32_claim", seed_manifest.get("source_checkpoint_parity_claim"), False, checks)

    current_fingerprint = architecture_fingerprint(
        mini_decoder_path=REPO_ROOT / "src" / "training" / "model_lab" / "mini_decoder.py",
        model_source_path=REPO_ROOT / "src" / "training" / "mlx" / "r29b2m_model.py",
        tokenizer_sha256=source.tokenizer_sha256,
        wrapper_version=WRAPPER_VERSION,
    )
    parameter_count = sum(
        int(__import__("math").prod(shape))
        for name, shape in expected_tensor_shapes().items()
        if not name.endswith(".mask")
    )
    check("architecture.fingerprint", current_fingerprint, architecture.get("architecture_fingerprint"), checks)
    check("architecture.parameter_count", parameter_count, 96_421_248, checks)
    check("architecture.strict_load_prior", architecture.get("strict_load"), True, checks)
    check("full_context.all_layers", full_context.get("all_layers_executed"), True, checks)
    check("kv.valid", kv.get("valid"), True, checks)
    check("kv.incremental_tolerance", float(kv.get("incremental_max_abs_error", 1)), 0.00003147125244140625, checks)
    check("kv.greedy_sequences_match", kv.get("greedy_sequences_match"), True, checks)
    check("kv.no_future_leakage", kv.get("no_future_leak_max_abs_error"), 0.0, checks)
    check("kv.no_cross_session_contamination", kv.get("session_isolation_max_abs_error"), 0.0, checks)
    check("kv.reset_behavior", kv.get("cache_reset_max_abs_error"), 0.0, checks)

    frozen_hash = session_manifest_sha256(frozen_sessions())
    check("baseline.session_count", baseline.get("session_count"), 120, checks)
    check("baseline.session_manifest_sha256", frozen_hash, baseline.get("session_manifest_sha256"), checks)
    mojibake = sum(int(row.get("structural_review", {}).get("mojibake", False)) for row in baseline.get("sessions", []))
    repeated = sum(int(row.get("structural_review", {}).get("repeated_output", False)) for row in baseline.get("sessions", []))
    check("baseline.mojibake", mojibake, 1, checks)
    check("baseline.repeated_outputs", repeated, 4, checks)

    valid = all(row["valid"] for row in checks)
    report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "valid": valid,
        "adoption_kind": "read_only_reference_no_seed_copy",
        "source_main_sha": head,
        "origin_main_sha": origin_main,
        "r29b2m_base_commit": BASE_COMMIT,
        "prior_terminal_state_preserved": old_state["state"],
        "environment_python": str(python),
        "mlx_version": probe.stdout.strip(),
        "tokenizer_sha256": source.tokenizer_sha256,
        "q4_source_sha256": source.source_sha256,
        "seed_safetensors_sha256": sha256_file(seed_path),
        "architecture_fingerprint": current_fingerprint,
        "model_parameter_count_excluding_masks": parameter_count,
        "kv_parity": {key: kv[key] for key in ("incremental_max_abs_error", "greedy_sequences_match", "no_future_leak_max_abs_error", "session_isolation_max_abs_error", "cache_reset_max_abs_error")},
        "baseline": {"session_count": 120, "session_manifest_sha256": frozen_hash, "report_sha256": sha256_file(reports / "seed_baseline.json"), "mojibake": mojibake, "repeated_outputs": repeated},
        "evidence_file_sha256": {path.name: sha256_file(path) for path in required_paths},
        "checks": checks,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }
    atomic_json(args.artifact_root / "reports" / "adopted_evidence.json", report)
    print(json.dumps({"valid": valid, "checks": len(checks), "source_main_sha": head}, sort_keys=True), flush=True)
    return 0 if valid else 2


if __name__ == "__main__":
    raise SystemExit(main())
