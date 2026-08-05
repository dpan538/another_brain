#!/usr/bin/env python3
"""Write the R29B2M orientation evidence without opening any PyTorch weight."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.training.mlx.r29b2m_campaign import atomic_json  # noqa: E402
from src.training.mlx.r29b2m_q4_source import load_r28m1_q4_source  # noqa: E402


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def command(*args: str) -> str:
    result = subprocess.run(args, cwd=REPO_ROOT, capture_output=True, text=True, check=False)
    return (result.stdout or result.stderr).strip()


def read_optional_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--prior-artifact-root", type=Path, required=True)
    args = parser.parse_args()
    source = load_r28m1_q4_source(REPO_ROOT / "web" / "another_brain" / "model_assets" / "r28m1")
    asset_manifest = json.loads((REPO_ROOT / "web" / "another_brain" / "asset_manifest.json").read_text(encoding="utf-8"))
    prior_state = read_optional_json(args.prior_artifact_root / "campaign_state.json")
    prior_attribution = read_optional_json(args.prior_artifact_root / "reports" / "prior_probe_attribution.json")
    disk = shutil.disk_usage(args.artifact_root)
    report = {
        "campaign_id": "r29b2m_m1_mlx_daily_dialogue_v1",
        "created_at": now(),
        "repository": {
            "branch": command("git", "branch", "--show-current"),
            "head": command("git", "rev-parse", "HEAD"),
            "origin_main": command("git", "rev-parse", "origin/main"),
            "status": command("git", "status", "--short"),
        },
        "hardware": {
            "machine": platform.machine(),
            "platform": platform.platform(),
            "hardware_contract": "Apple M1 / 16GB unified memory / 1TB SSD; no RTX; no CUDA; no Windows handoff",
        },
        "disk": {"free_bytes": disk.free, "training_floor_bytes": 80_000_000_000, "training_floor_currently_met": disk.free >= 80_000_000_000},
        "processes": command("pgrep", "-alf", "r29|train|supervisor"),
        "r29b0": {
            "browser_path_lacks_contextual_attention_and_kv_cache": True,
            "source": "docs/r29b0_final_report.md",
        },
        "r29b1r": {
            "pytorch_path_retired_for_r29b2m": True,
            "prior_terminal_state": None if prior_state is None else prior_state.get("state"),
            "prior_probe_reclassification": None if prior_attribution is None else prior_attribution.get("reclassification"),
        },
        "r28m1": {
            "source_kind": "r28m1_q4_recovered_seed",
            "source_fp32_checkpoint_loaded": False,
            "source_checkpoint_parity_claim": False,
            "q4_sha256": source.source_sha256,
            "tokenizer_sha256": source.tokenizer_sha256,
            "architecture": source.architecture,
            "static_bundle_bytes": asset_manifest.get("static_bundle_bytes") or asset_manifest.get("total_static_bytes") or asset_manifest.get("full_static_bundle_bytes"),
        },
        "product_scope": "short Chinese daily dialogue only; context remains 256; no training started",
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "valid": platform.machine() == "arm64" and source.architecture.get("context_length") == 256,
    }
    atomic_json(args.artifact_root / "reports" / "orientation.json", report)
    print(json.dumps({"valid": report["valid"], "head": report["repository"]["head"]}, sort_keys=True), flush=True)
    return 0 if report["valid"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
