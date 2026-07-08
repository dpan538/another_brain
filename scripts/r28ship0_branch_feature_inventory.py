#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "r28ship0" / "reports" / "branch_feature_inventory.json"

BRANCHES = [
    "origin/r28hotfix3-q4-asset-path-fix",
    "origin/r28load0-model-loading-state-machine",
    "origin/r28hotfix2-nonblocking-selfcheck",
    "origin/r28rout1-fuzzy-intent-surfaces",
    "origin/r28surf3-anchor-natural-surfaces",
    "origin/r28rag3-lightweight-profile-rag",
    "origin/r28ux5-chat-dashboard-split",
]

FEATURE_PATTERNS = {
    "q4 asset path normalizer": ["normalizeBrowserAssetPath", "asset_path_normalizer"],
    "absolute same-origin shard URL": ["sameOriginAssetUrl", "non_same_origin_asset_rejected"],
    "non-blocking self-check": ["self_check_worker", "runQ4SelfCheckSmoke", "deepSelfCheckModelPath"],
    "loading state machine": ["MODEL_LOADING_STATES", "Q4_MOUNT_STATES", "checking_manifest", "warming_q4"],
    "route loop fix": ["event_listener_missing", "another_brain_chat/?v=", "route_loop"],
    "fuzzy intent router": ["matchMicroIntent", "fuzzy", "MICRO_INTENT"],
    "natural answer surfaces": ["SURFACE_FRAGMENTS", "answer_surface", "natural"],
    "minimal chat/dashboard split": ["dashboard-mode-button", "data-ui-mode", "Chat-Dashboard split"],
    "exact tokenizer": ["exact_runtime_tokenizer", "runtime_tokenizer.json"],
    "q4 runtime smoke": ["q4_smoke", "generateStaticQ4Draft", "q4_forward_smoke"],
}

SEARCH_PATHS = [
    "src/browser_runtime",
    "web/another_brain_chat",
    "web/another_brain",
    "scripts",
    "tests",
    "docs/r28",
]


def git(*args: str, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check,
    )


def branch_info(ref: str) -> dict:
    rev = git("rev-parse", "--verify", ref)
    if rev.returncode != 0:
        return {"ref": ref, "exists": False, "commit": "", "subject": "", "features": {}}
    commit = rev.stdout.strip()
    subject = git("log", "-1", "--format=%s", ref, check=True).stdout.strip()
    return {"ref": ref, "exists": True, "commit": commit, "subject": subject, "features": {}}


def git_grep(ref: str, pattern: str) -> list[str]:
    result = git("grep", "-n", "-F", pattern, ref, "--", *SEARCH_PATHS)
    if result.returncode not in (0, 1):
      return []
    return [line for line in result.stdout.splitlines() if line.strip()]


def detect_features(ref: str) -> dict:
    features = {}
    for feature, patterns in FEATURE_PATTERNS.items():
        matches: list[str] = []
        for pattern in patterns:
            matches.extend(git_grep(ref, pattern)[:3])
        features[feature] = {
            "present": bool(matches),
            "evidence": matches[:5],
        }
    return features


def build_inventory() -> dict:
    branches = []
    for ref in BRANCHES:
        info = branch_info(ref)
        if info["exists"]:
            info["features"] = detect_features(ref)
        branches.append(info)
    return {
        "task": "R28SHIP0",
        "base": "origin/r28ux5-chat-dashboard-split",
        "branches": branches,
        "feature_checklist": list(FEATURE_PATTERNS),
        "non_claims": {
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "training": False,
            "new_model_assets": False,
        },
    }


def main() -> int:
    report = build_inventory()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "output": str(OUT), "branches": len(report["branches"])}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
