#!/usr/bin/env python3
"""R28SHIP2 branch feature inventory.

Read-only scan over selected remote refs. It writes only an ignored report under
artifacts/r28ship2 and does not inspect forbidden corpora or model checkpoints.
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "r28ship2" / "reports" / "branch_feature_matrix.json"

BRANCHES = [
    "origin/r28pr0-final-preview-pr",
    "origin/r28ux5-chat-dashboard-split",
    "origin/r28hotfix1-route-loop-free-runtime",
    "origin/r28hotfix2-nonblocking-selfcheck",
    "origin/r28hotfix3-q4-asset-path-fix",
    "origin/r28hotfix4-open-question-generation-sla",
    "origin/r28qa6-latency-open-question-qa",
    "origin/r28rout1-fuzzy-intent-surfaces",
    "origin/r28surf5-wide-answer-surfaces",
    "origin/r28rag3-lightweight-profile-rag",
    "origin/r28load0-model-loading-state-machine",
    "origin/r28ship0-unified-q4-mount",
    "origin/r28a13-abstract-value-sft",
]

SEARCH_PATHS = [
    ".vercelignore",
    "package.json",
    "web/another_brain",
    "web/another_brain_chat",
    "src/browser_runtime",
    "scripts",
    "tests",
    "docs/r28",
]

FEATURE_PATTERNS = {
    "q4 assets": ["web/another_brain/model_assets/r28m1/shards/model-q4-00001.bin"],
    "exact tokenizer": ["exact_runtime_tokenizer", "runtime_tokenizer.json", "R28TOK1"],
    "q4 path normalizer": ["asset_path_normalizer", "normalizeBrowserAssetPath", "sameOriginAssetUrl"],
    ".vercelignore bin fix": ["!web/another_brain/model_assets/r28m1/**", "*.bin"],
    "route loop fix": ["route_loop", "root_and_chat_same_app", "no_redirect_loop", "event_listener_missing"],
    "non-blocking self-check": ["self_check_worker", "quickSelfCheckModelPath", "deepSelfCheckModelPath", "nonblocking"],
    "model loading state machine": ["MODEL_LOADING_STATES", "model_loading_state", "checking_manifest", "warming_q4"],
    "retry before fallback": ["q4_retry_plan", "mountQ4WithRetry", "retry_before_fallback", "q4_retry_plan_exhausted"],
    "open-question SLA": ["generation_watchdog", "open_question_route", "OPEN_QUESTION", "q4_generation_timeout"],
    "QA6 latency matrix": ["r28qa6_latency_quality_matrix", "latency_quality_matrix", "R28QA6"],
    "fuzzy intent router": ["fuzzy_intent", "matchMicroIntent", "MICRO_INTENT", "intent_taxonomy"],
    "natural answer surfaces": ["surface_library", "SURFACE_FRAGMENTS", "wide answer", "answer_length_policy"],
    "lightweight RAG/profile pack": ["profile_cards.json", "profile_retriever", "rag_profile_pack", "expressive_context_pack"],
    "Chat/Dashboard UI": ["dashboard-mode-button", "chat-mode-button", "data-ui-mode", "Dashboard"],
    "mobile loading UI": ["model-loading-panel", "loading_screen", "loading-breathe", "chat_mode_default_mobile"],
    "build:vercel pass evidence": ["build:vercel", "Vercel", "check_vercel_static_build", "build/vercel"],
    "no-training gates evidence": ["check:no-training-in-routine-gates", "no training", "no new model assets", "training: false"],
}


def git(*args: str, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check,
    )


def ref_exists(ref: str) -> bool:
    return git("rev-parse", "--verify", ref).returncode == 0


def git_text(ref: str, path: str) -> str:
    result = git("show", f"{ref}:{path}")
    return result.stdout if result.returncode == 0 else ""


def git_grep(ref: str, pattern: str) -> list[str]:
    result = git("grep", "-n", "-F", pattern, ref, "--", *SEARCH_PATHS)
    if result.returncode not in (0, 1):
        return []
    return [line for line in result.stdout.splitlines() if line.strip()]


def ls_tree_has(ref: str, path: str) -> bool:
    return bool(git("ls-tree", "-r", "--name-only", ref, "--", path).stdout.strip())


def detect_feature(ref: str, feature: str, patterns: list[str]) -> dict[str, Any]:
    evidence: list[str] = []
    if feature == "q4 assets":
        asset_paths = [
            "web/another_brain/model_assets/r28m1/model.config.json",
            "web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json",
            "web/another_brain/model_assets/r28m1/shards/model-q4-00001.bin",
            "web/another_brain/model_assets/r28m1/shards/model-q4-00005.bin",
        ]
        present = all(ls_tree_has(ref, path) for path in asset_paths)
        evidence = [path for path in asset_paths if ls_tree_has(ref, path)]
        return {"present": present, "evidence": evidence}
    if feature == ".vercelignore bin fix":
        text = git_text(ref, ".vercelignore")
        present = "*.bin" in text and "!web/another_brain/model_assets/r28m1/**" in text
        evidence = [line.strip() for line in text.splitlines() if "*.bin" in line or "r28m1" in line][:5]
        return {"present": present, "evidence": evidence}
    for pattern in patterns:
        evidence.extend(git_grep(ref, pattern)[:4])
    return {"present": bool(evidence), "evidence": evidence[:8]}


def branch_record(ref: str) -> dict[str, Any]:
    if not ref_exists(ref):
        return {"ref": ref, "exists": False, "commit": "", "subject": "", "features": {}}
    commit = git("rev-parse", ref, check=True).stdout.strip()
    subject = git("log", "-1", "--format=%s", ref, check=True).stdout.strip()
    return {
        "ref": ref,
        "exists": True,
        "commit": commit,
        "subject": subject,
        "features": {
            feature: detect_feature(ref, feature, patterns)
            for feature, patterns in FEATURE_PATTERNS.items()
        },
    }


def build_matrix() -> dict[str, Any]:
    records = [branch_record(ref) for ref in BRANCHES]
    return {
        "task": "R28SHIP2",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_of_truth": {
            "model_assets": "origin/main committed R28M1 q4 assets; A13 evidence only",
            "runtime": "QA6 lineage plus selected LOAD0 state-machine compatibility",
            "ui": "UX5/SHIP0 Chat-Dashboard split preserved under QA6",
            "answer_surfaces": "SURF5 over HOTFIX4 open-question SLA",
            "rag": "static/local RAG profile pack; no hosted vector store",
        },
        "features": list(FEATURE_PATTERNS.keys()),
        "branches": records,
        "non_claims": {
            "training": False,
            "new_model_assets": False,
            "new_q4_shards": False,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
        },
    }


def main() -> int:
    report = build_matrix()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "output": str(OUT), "branches": len(report["branches"])}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
