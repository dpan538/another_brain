#!/usr/bin/env python3
"""R28D7 final preview branch audit.

This audit is static/prelaunch only. It does not train, modify model assets,
connect backend inference, or approve product/browser/release admission.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = ROOT / "web" / "another_brain"
CHAT_ROOT = ROOT / "web" / "another_brain_chat"
MAX_TOTAL_STATIC_BYTES = 100_000_000

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r28qa2_product_surface_matrix import product_surface_matrix  # noqa: E402
from src.browser_export.r28m1_asset_commit import full_bundle_budget_gate  # noqa: E402


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def scenario(name: str, ok: bool, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"name": name, "ok": bool(ok), "status": "pass" if ok else "fail", "details": details or {}}


def final_preview_audit() -> dict[str, Any]:
    runtime = read_json(STATIC_ROOT / "runtime_mode.json")
    manifest = read_json(STATIC_ROOT / "asset_manifest.json")
    budget = full_bundle_budget_gate()
    qa2 = product_surface_matrix(run_real_smoke=False)
    generation_policy_text = read_text(ROOT / "src" / "browser_runtime" / "generation_policy.ts")
    finalizer_text = read_text(ROOT / "src" / "browser_runtime" / "finalizer_adapter.ts")
    chat_html = read_text(CHAT_ROOT / "index.html")

    q4_shards = [asset for asset in manifest.get("model_assets", []) if asset.get("role") == "q4_shard"]
    tokenizer_assets = manifest.get("tokenizer_assets", [])
    release_blockers = runtime.get("release_blockers") or []
    docs = {
        "tokenizer": (ROOT / "docs" / "r28" / "R28TOK1_EXACT_TOKENIZER_RUNTIME.md").exists(),
        "generation": (ROOT / "docs" / "r28" / "R28GEN1_DETERMINISTIC_GENERATION.md").exists(),
        "qa": (ROOT / "docs" / "r28" / "R28QA2_PRODUCT_SURFACE_QA.md").exists(),
        "d7_release_blockers": (ROOT / "docs" / "r28" / "R28D7_RELEASE_BLOCKERS.md").exists(),
    }

    scenarios = [
        scenario("q4 assets present", manifest.get("model_assets_admitted") is True and len(q4_shards) == 5, {
            "shard_count": len(q4_shards),
            "total_model_asset_bytes": manifest.get("total_model_asset_bytes"),
        }),
        scenario("exact tokenizer documented", runtime.get("tokenizer_decode_status") == "exact_runtime_tokenizer" and docs["tokenizer"], {
            "tokenizer": runtime.get("tokenizer"),
            "tokenizer_decode_status": runtime.get("tokenizer_decode_status"),
            "tokenizer_asset_count": len(tokenizer_assets),
        }),
        scenario("generation policy present", "R28GEN1_POLICY_VERSION" in generation_policy_text and "R28GEN1_FINALIZER_VERSION" in finalizer_text and docs["generation"], {
            "policy_doc": docs["generation"],
        }),
        scenario("QA status documented", qa2.get("output_label") == "preview_ready_with_quality_blocker" and docs["qa"], {
            "qa2_label": qa2.get("output_label"),
            "qa2_pass_count": qa2.get("pass_count"),
            "qa2_fail_count": qa2.get("fail_count"),
        }),
        scenario("release blockers visible", len(release_blockers) >= 4 and docs["d7_release_blockers"], {
            "release_blockers": release_blockers,
        }),
        scenario("bundle under 100MB", budget.get("ok") is True and int(budget.get("full_bundle_bytes") or 0) <= MAX_TOTAL_STATIC_BYTES, {
            "full_bundle_bytes": int(budget.get("full_bundle_bytes") or 0),
            "margin_bytes": int(budget.get("margin_bytes") or 0),
        }),
        scenario("static chat route visible", (CHAT_ROOT / "index.html").exists() and "non-product-warning" in chat_html, {
            "route": "web/another_brain_chat/index.html",
        }),
        scenario("no backend or external runtime", all([
            runtime.get("backend_inference") is False,
            runtime.get("external_llm_api") is False,
            runtime.get("doubao") is False,
            runtime.get("hosted_vector_store") is False,
            manifest.get("backend_inference") is False,
            manifest.get("external_llm_api") is False,
            manifest.get("doubao") is False,
            manifest.get("hosted_vector_store") is False,
        ]), {
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
        }),
    ]
    failures = [item for item in scenarios if not item["ok"]]
    return {
        "ok": not failures,
        "branch": "r28d7-final-preview-branch",
        "base": "origin/r28qa2-product-surface-qa",
        "preview_pr_url": "https://github.com/dpan538/another_brain/pull/new/r28d7-final-preview-branch",
        "output_label": qa2.get("output_label"),
        "pass_count": len(scenarios) - len(failures),
        "fail_count": len(failures),
        "failures": [item["name"] for item in failures],
        "scenarios": scenarios,
        "tokenizer_status": {
            "tokenizer": runtime.get("tokenizer"),
            "decode_status": runtime.get("tokenizer_decode_status"),
            "exact_decode": runtime.get("tokenizer_exact_decode") is True,
        },
        "generation_status": {
            "policy_present": "R28GEN1_POLICY_VERSION" in generation_policy_text,
            "finalizer_present": "R28GEN1_FINALIZER_VERSION" in finalizer_text,
        },
        "qa_status": qa2.get("quality_summary"),
        "bundle": {
            "full_bundle_bytes": int(budget.get("full_bundle_bytes") or 0),
            "margin_bytes": int(budget.get("margin_bytes") or 0),
            "max_total_static_bytes": MAX_TOTAL_STATIC_BYTES,
        },
        "release_blockers": release_blockers,
        "non_claims": {
            "training": False,
            "new_model_assets": False,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint_admission": False,
        },
    }


def main() -> int:
    report = final_preview_audit()
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
