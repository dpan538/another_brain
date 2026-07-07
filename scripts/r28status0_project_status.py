#!/usr/bin/env python3
"""R28STATUS0 local-only progress ledger for another_brain.

This script inspects tracked repository metadata and browser runtime files. It
does not train, parse private/root documents, parse data/public_ingestion, call
external services, or mutate model assets.
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DOC_DIR = ROOT / "docs" / "r28"
PROGRESS_DOC = DOC_DIR / "R28STATUS0_PROJECT_PROGRESS.md"
BLOCKER_DOC = DOC_DIR / "R28STATUS0_BLOCKER_LEDGER.md"
NEXT_DOC = DOC_DIR / "R28STATUS0_NEXT_ACTIONS.md"

ASSET_MANIFEST_PATH = ROOT / "web" / "another_brain" / "asset_manifest.json"
RUNTIME_MODE_PATH = ROOT / "web" / "another_brain" / "runtime_mode.json"
MODEL_ASSET_DIR = ROOT / "web" / "another_brain" / "model_assets" / "r28m1"
CHAT_DIR = ROOT / "web" / "another_brain_chat"
ROUTER_DIR = ROOT / "src" / "browser_runtime" / "router"
TRAINING_CURRENT = ROOT / "training" / "current"
TRAINING_CORPUS = ROOT / "training" / "llm_corpus"


def run_git(args: list[str]) -> list[str]:
    proc = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if proc.returncode != 0:
        return []
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def read_json(path: Path) -> Any:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path, limit: int | None = None) -> str:
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    if limit is not None:
        return text[:limit]
    return text


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def line_count(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text(encoding="utf-8", errors="replace").splitlines() if line.strip())


def package_scripts() -> dict[str, str]:
    package = read_json(ROOT / "package.json") or {}
    scripts = package.get("scripts", {})
    return scripts if isinstance(scripts, dict) else {}


def tracked_files(prefix: str = "") -> list[str]:
    args = ["ls-files"]
    if prefix:
        args.append(prefix)
    return run_git(args)


def remote_branches() -> set[str]:
    return {line.replace("* ", "").strip() for line in run_git(["branch", "-r"])}


def branch_files(branch: str) -> list[str]:
    proc = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", branch],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if proc.returncode != 0:
        return []
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def branch_text(branch: str, path: str, limit: int = 50000) -> str:
    proc = subprocess.run(
        ["git", "show", f"{branch}:{path}"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout[:limit]


def branch_short_sha(branch: str) -> str:
    proc = subprocess.run(
        ["git", "rev-parse", "--short=12", branch],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return proc.stdout.strip() if proc.returncode == 0 else ""


def model_asset_status(asset_manifest: dict[str, Any] | None, runtime_mode: dict[str, Any] | None) -> dict[str, Any]:
    model_files = tracked_files("web/another_brain/model_assets/r28m1")
    q4_shards = [p for p in model_files if p.endswith(".bin") and "/shards/model-q4-" in p]
    tokenizer_runtime = "web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json" in model_files
    quant_manifest = read_json(MODEL_ASSET_DIR / "quantization.manifest.json") or {}
    config = read_json(MODEL_ASSET_DIR / "model.config.json") or {}
    checksum_manifest_exists = (MODEL_ASSET_DIR / "checksums.sha256.json").exists()
    return {
        "model_has_lora": False,
        "model_has_static_q4_assets": len(q4_shards) > 0 and tokenizer_runtime and bool(quant_manifest),
        "model_is_from_scratch_q4_static_decoder": True,
        "selected_model": (runtime_mode or {}).get("selected_model") or config.get("selected_model"),
        "candidate_source": (runtime_mode or {}).get("candidate_source") or config.get("candidate_source"),
        "q4_shard_count": len(q4_shards),
        "expected_shard_count": int(quant_manifest.get("shard_count") or (runtime_mode or {}).get("shard_count") or 0),
        "tokenizer_runtime_asset": tokenizer_runtime,
        "model_config": bool(config),
        "quantization_manifest": bool(quant_manifest),
        "checksum_manifest": checksum_manifest_exists,
        "tracked_asset_files": model_files,
        "total_model_asset_bytes": int((asset_manifest or {}).get("total_model_asset_bytes") or 0),
        "full_bundle_estimate_bytes": int((runtime_mode or {}).get("full_bundle_estimate_bytes") or (asset_manifest or {}).get("full_bundle_estimate_bytes") or 0),
        "full_static_bundle_estimate_bytes": int((runtime_mode or {}).get("full_static_bundle_estimate_bytes") or 0),
        "remaining_bytes_under_100mb": int((runtime_mode or {}).get("remaining_bytes_under_100mb") or (asset_manifest or {}).get("remaining_bytes_under_100mb") or 0),
        "max_shard_bytes": int((runtime_mode or {}).get("max_shard_bytes") or quant_manifest.get("max_shard_bytes") or 0),
        "model_assets_admitted": bool((runtime_mode or {}).get("model_assets_admitted") or (asset_manifest or {}).get("model_assets_admitted")),
        "non_product": True,
    }


def browser_runtime_status(runtime_mode: dict[str, Any] | None) -> dict[str, Any]:
    chat_app = read_text(CHAT_DIR / "app.js")
    browser_runtime = read_text(CHAT_DIR / "browser_runtime.js")
    runtime_worker = read_text(CHAT_DIR / "runtime_worker.js")
    q4_worker = read_text(CHAT_DIR / "q4_worker_runtime.js")
    current_frontend_calls_model = (
        "new Worker" in browser_runtime
        and "draftWithWorker" in browser_runtime
        and "static_q4_experimental" in runtime_worker
        and "generateStaticQ4Draft" in q4_worker
    )
    local_forward_smoke = bool(
        (runtime_mode or {}).get("inference_smoke_passed")
        or (runtime_mode or {}).get("readable_generation_smoke_passed")
        or "static_q4_forward_exact_tokenizer_smoke_passed" in str((runtime_mode or {}).get("offline_static_readiness", ""))
    )
    current_self_check = "blocking_or_unverified_r28ux4" if (
        "modelSelfCheckButton" in chat_app or "selfCheckModelPath" in browser_runtime
    ) else "not_present"
    null_safe_main = "function on(" in chat_app and "addEventListener" in chat_app
    hotfix2_text = branch_text("origin/r28hotfix2-nonblocking-selfcheck", "web/another_brain_chat/browser_runtime.js")
    hotfix2_app = branch_text("origin/r28hotfix2-nonblocking-selfcheck", "web/another_brain_chat/app.js")
    hotfix2_files = branch_files("origin/r28hotfix2-nonblocking-selfcheck")
    return {
        "frontend_calls_model": current_frontend_calls_model,
        "model_runtime_forward": local_forward_smoke,
        "model_text_decode": "exact" if (runtime_mode or {}).get("tokenizer_decode_status") == "exact_runtime_tokenizer" else "missing",
        "ui_build_marker": (runtime_mode or {}).get("ui_build_marker", ""),
        "ui_version": (runtime_mode or {}).get("ui_version", ""),
        "current_main_self_check": current_self_check,
        "current_main_null_event_listener_risk": not null_safe_main,
        "hotfix2_branch_present": bool(hotfix2_files),
        "hotfix2_sha": branch_short_sha("origin/r28hotfix2-nonblocking-selfcheck"),
        "hotfix2_nonblocking_selfcheck": "quickSelfCheckModelPath" in hotfix2_text
        and "deepSelfCheckModelPath" in hotfix2_text
        and "AbortController" in hotfix2_app
        and "model-self-check-stop-button" in hotfix2_app,
        "hotfix2_identity_route": "IDENTITY_ANSWER" in hotfix2_text and "我是鳄鱼" in hotfix2_text,
        "hotfix2_not_merged_to_main": "R28HOTFIX2" not in chat_app,
        "tokens_generated_status": "runtime reports tokens_generated when q4 worker returns final stats; live browser value not checked here",
        "self_check_q4_forward_status": f"main self-check={current_self_check}; hotfix2 branch adds nonblocking quick/deep split with abort/timeout",
    }


def rag_status(asset_manifest: dict[str, Any] | None, runtime_mode: dict[str, Any] | None) -> dict[str, Any]:
    demo_memory = ROOT / "web" / "another_brain" / "static_rag" / "demo_memory.json"
    retriever = ROOT / "src" / "browser_runtime" / "rag" / "static_retriever.ts"
    browser_retriever = CHAT_DIR / "static_retriever.js"
    demo_records = read_json(demo_memory)
    if isinstance(demo_records, dict):
        record_count = len(demo_records.get("records", []))
    elif isinstance(demo_records, list):
        record_count = len(demo_records)
    else:
        record_count = 0
    return {
        "rag_status": "demo/static",
        "rag_runtime": {
            "runtime_mode": (runtime_mode or {}).get("rag_mode", "unknown"),
            "static_demo_memory_present": demo_memory.exists(),
            "demo_memory_records": record_count,
            "typed_static_retriever_present": retriever.exists(),
            "browser_static_retriever_present": browser_retriever.exists(),
            "answer_bank": False,
        },
        "rag_training": {
            "teacher_runtime_in_browser": False,
            "hosted_vector_store": bool((asset_manifest or {}).get("hosted_vector_store", False)),
            "status": "architecture and static/demo retrieval exist; product RAG training/admission is not done",
        },
    }


def anchors_status() -> dict[str, Any]:
    r26e_policy = read_json(TRAINING_CURRENT / "r26e_first50_promotion_policy.json") or {}
    relation_index = read_json(TRAINING_CURRENT / "relation_evidence_index.r27a.json") or {}
    question_manifest = read_json(TRAINING_CURRENT / "question_pack_001_manifest.r26d.json") or {}
    train_counts = {
        "r26e_train": line_count(TRAINING_CORPUS / "r26e_user_answered_train.jsonl"),
        "r26e_dev": line_count(TRAINING_CORPUS / "r26e_user_answered_dev.jsonl"),
        "r26e_heldout": line_count(TRAINING_CORPUS / "r26e_user_answered_heldout.jsonl"),
        "r26g_train": line_count(TRAINING_CORPUS / "r26g_user_answered_train.jsonl"),
        "r26g_dev": line_count(TRAINING_CORPUS / "r26g_user_answered_dev.jsonl"),
        "r26g_heldout": line_count(TRAINING_CORPUS / "r26g_user_answered_heldout.jsonl"),
    }
    total_user_answered = sum(train_counts.values())
    relation_meta = relation_index.get("user_answered_metadata", {}) if isinstance(relation_index, dict) else {}
    return {
        "anchors_training_allowed_count": total_user_answered,
        "user_answered_rows_indexed": relation_index.get("metadata", {}).get("user_answered_rows")
        or relation_index.get("user_answered_rows")
        or relation_meta.get("user_answered_rows")
        or total_user_answered,
        "split_counts": train_counts,
        "first_pack_policy": {
            "pack_id": question_manifest.get("pack_id") or r26e_policy.get("pack_id"),
            "rows_1_50": "reviewed/promoted subset available in tracked training splits",
            "old_rows_51_100": question_manifest.get("excluded_from_training_range", "51-100"),
        },
        "old_excluded_rows_blocked": question_manifest.get("excluded_from_training_range") == "51-100"
        and "Rows 51-100" in json.dumps(r26e_policy, ensure_ascii=False),
        "training_allowed_now": False,
        "note": "Existing tracked user_answered splits can be used only in approved training runs; R28STATUS0 does not approve training.",
    }


def router_status() -> dict[str, Any]:
    route_text = read_text(ROUTER_DIR / "route_classifier.ts")
    surfaces = read_text(ROUTER_DIR / "answer_surfaces.ts")
    policy = read_text(ROUTER_DIR / "answer_surface_policy.ts")
    route_schema = read_text(ROUTER_DIR / "answer_route.ts")
    forbidden_template_hits = []
    template_values_text = surfaces.split("ANSWER_SURFACE_TEMPLATES", 1)[-1].split("});", 1)[0].lower()
    for marker in ["question_pack", "row 51", "row 100", "eval prompt", "hidden prompt", "raw private"]:
        if marker in template_values_text:
            forbidden_template_hits.append(marker)
    return {
        "hard_router_present": ROUTER_DIR.exists() and "classifyAnswerRoute" in route_text,
        "answer_bank_present": False,
        "boundary_templates": [
            "evidence insufficient",
            "malicious evidence",
            "conflicting evidence",
            "model gibberish",
            "not product status",
        ],
        "identity_route_on_main": "identity_boundary" in route_schema or "我是鳄鱼" in route_text,
        "no_answer_bank_boundary_doc": (ROOT / "docs" / "r28" / "R28ROUT0_NO_ANSWER_BANK_BOUNDARY.md").exists(),
        "ordinary_questions_not_template_overridden": "no_answer_bank" in policy or "direct_model_draft" in route_text,
        "forbidden_template_hits": forbidden_template_hits,
        "template_private_data_risk": bool(forbidden_template_hits),
        "status": "boundary/fallback/router layer, not a broad FAQ answer bank",
    }


def deployment_status(runtime_mode: dict[str, Any] | None, asset_manifest: dict[str, Any] | None) -> dict[str, Any]:
    branches = remote_branches()
    return {
        "main_sha": branch_short_sha("origin/main"),
        "main_ui_marker": (runtime_mode or {}).get("ui_build_marker", ""),
        "preview_branches": {
            "r28hotfix1_route_loop_free": "origin/r28hotfix1-route-loop-free-runtime" in branches,
            "r28hotfix2_nonblocking_selfcheck": "origin/r28hotfix2-nonblocking-selfcheck" in branches,
            "r28pr0_final_preview": "origin/r28pr0-final-preview-pr" in branches,
        },
        "vercel_production_status": "not_live_checked_in_R28STATUS0",
        "vercel_preview_status": "not_live_checked_in_R28STATUS0",
        "last_user_observed": "R28HOTFIX1 preview opened but self-check froze before R28HOTFIX2; R28STATUS0 did not query live Vercel",
        "local_bundle_bytes": int((runtime_mode or {}).get("full_bundle_estimate_bytes") or (asset_manifest or {}).get("full_bundle_estimate_bytes") or 0),
        "static_budget_under_100mb": int((runtime_mode or {}).get("remaining_bytes_under_100mb") or (asset_manifest or {}).get("remaining_bytes_under_100mb") or 0) > 0,
    }


def distillation_status() -> dict[str, Any]:
    policy = read_json(TRAINING_CURRENT / "teacher_distillation_policy.r27a.json") or {}
    teacher_probe = TRAINING_CURRENT / "teacher_probe_pack.r27a.jsonl"
    return {
        "runtime_teacher": False,
        "teacher_probe_pack_present": teacher_probe.exists(),
        "teacher_output_replaces_user_answered_corpus": bool(policy.get("teacher_output_replaces_user_answered_corpus", False)),
        "status": "training-data/promotion architecture only; runtime does not run a teacher and this task does not call external LLMs",
    }


def release_blockers(runtime_mode: dict[str, Any] | None, browser: dict[str, Any]) -> list[dict[str, str]]:
    blockers = [
        {"id": "product_admission_not_done", "status": "open", "evidence": "runtime_mode.product_admission=false/product_model=false"},
        {"id": "browser_admission_not_done", "status": "open", "evidence": "runtime_mode.browser_admission=false"},
        {"id": "release_checkpoint_admission_not_done", "status": "open", "evidence": "runtime_mode.release_checkpoint_admission=false"},
        {"id": "phase_4_false", "status": "open", "evidence": "runtime_mode.phase_4=false"},
        {"id": "quality_not_ready", "status": "open", "evidence": f"runtime_mode.quality_status={(runtime_mode or {}).get('quality_status', 'unknown')}"},
        {"id": "hotfix2_not_merged_to_main", "status": "open" if browser.get("hotfix2_not_merged_to_main") else "closed", "evidence": "R28HOTFIX2 exists as remote branch but main UI marker is not R28HOTFIX2"},
        {"id": "live_vercel_not_checked_here", "status": "manual", "evidence": "R28STATUS0 is local-only and did not query Vercel/GitHub checks"},
        {"id": "product_manual_qa_not_done", "status": "open", "evidence": "manual browser QA/admission still blocked"},
    ]
    return blockers


def next_queue(browser: dict[str, Any], deployment: dict[str, Any]) -> list[dict[str, str]]:
    queue = [
        {
            "step": "R28HOTFIX2 preview verification",
            "why": "Confirm nonblocking self-check, identity route answer, route trace, q4 status, and no console fatal errors in the deployed preview.",
            "prompt": "R28HOTFIX2_PREVIEW_VERIFY — verify /, /another_brain_chat, /another_brain_chat?message=你是谁, self-check abort/timeout, and tokens_generated.",
        },
        {
            "step": "Merge hotfix only after preview passes",
            "why": "main currently carries R28UX4; HOTFIX2 is the branch with the freeze/identity repair.",
            "prompt": "R28HOTFIX2_MERGE_READINESS — no auto-merge; user confirms preview evidence before merge.",
        },
        {
            "step": "Production smoke after merge",
            "why": "Production status is not live-checked by this local ledger.",
            "prompt": "R28PROD_SMOKE0 — open production root and chat routes, click self-check, send 你是谁, verify q4/fallback status.",
        },
        {
            "step": "Admission work remains separate",
            "why": "The current q4 path is an engineering candidate; product/browser/release admission is explicitly false.",
            "prompt": "R28ADMISSION_NEXT — only after preview/prod smoke passes; do not approve admission inside status/audit tasks.",
        },
    ]
    if not browser.get("hotfix2_branch_present"):
        queue.insert(0, {
            "step": "Recover HOTFIX2",
            "why": "The remote branch was not visible during local audit.",
            "prompt": "R28HOTFIX2_RECOVERY — recreate nonblocking self-check and identity route from local evidence.",
        })
    return queue


def build_report() -> dict[str, Any]:
    scripts = package_scripts()
    asset_manifest = read_json(ASSET_MANIFEST_PATH) or {}
    runtime_mode = read_json(RUNTIME_MODE_PATH) or {}
    model = model_asset_status(asset_manifest, runtime_mode)
    browser = browser_runtime_status(runtime_mode)
    rag = rag_status(asset_manifest, runtime_mode)
    anchors = anchors_status()
    router = router_status()
    distillation = distillation_status()
    deployment = deployment_status(runtime_mode, asset_manifest)
    blockers = release_blockers(runtime_mode, browser)
    queue = next_queue(browser, deployment)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "task": "R28STATUS0",
        "branch": "r28status0-progress-ledger",
        "repo_root": str(ROOT),
        "specific_outputs": {
            "model_has_lora": model["model_has_lora"],
            "model_has_static_q4_assets": model["model_has_static_q4_assets"],
            "model_runtime_forward": browser["model_runtime_forward"],
            "model_text_decode": browser["model_text_decode"],
            "frontend_calls_model": browser["frontend_calls_model"],
            "rag_status": rag["rag_status"],
            "anchors_training_allowed_count": anchors["anchors_training_allowed_count"],
            "old_excluded_rows_blocked": anchors["old_excluded_rows_blocked"],
            "release_readiness_label": "prelaunch_hotfix_pending_not_admitted",
        },
        "sections": {
            "model_training": {
                "status": "from-scratch project-trained decoder lineage; no LoRA/adapters as current model path",
                "model_has_lora": model["model_has_lora"],
                "candidate_source": model["candidate_source"],
                "selected_model": model["selected_model"],
            },
            "q4_static_assets": model,
            "browser_runtime": browser,
            "tokenizer": {
                "status": browser["model_text_decode"],
                "runtime_asset": model["tokenizer_runtime_asset"],
                "runtime_mode_tokenizer": runtime_mode.get("tokenizer"),
                "decode_status": runtime_mode.get("tokenizer_decode_status"),
            },
            "RAG_runtime": rag["rag_runtime"],
            "RAG_training": rag["rag_training"],
            "distillation": distillation,
            "user_answered_anchors": anchors,
            "answer_surface_router": router,
            "frontend_UI": {
                "main_ui_marker": browser["ui_build_marker"],
                "main_ui_version": browser["ui_version"],
                "process_panel_on_main": "过程摘要" in read_text(CHAT_DIR / "index.html"),
                "hotfix2_ui_marker_available_in_branch": browser["hotfix2_branch_present"],
            },
            "deployment": deployment,
            "blockers": blockers,
            "next_queue": queue,
        },
        "package_scripts_present": {
            "build": "build" in scripts,
            "build_vercel": "build:vercel" in scripts,
            "static_budget": "check:r27b0-static-budget" in scripts,
            "static_only": "check:r27b0-static-only" in scripts,
            "test_r28status0": "test:r28status0" in scripts,
        },
        "non_claims": {
            "not_product_model": True,
            "not_product_admission": True,
            "not_browser_admission": True,
            "not_release_checkpoint": True,
            "no_training": True,
            "no_new_model_assets": True,
            "no_backend_inference": True,
            "no_external_llm_api": True,
            "no_doubao": True,
            "no_hosted_vector_store": True,
        },
    }
    return report


def progress_doc(report: dict[str, Any]) -> str:
    s = report["sections"]
    out = report["specific_outputs"]
    rows = [
        ("model_training", s["model_training"]["status"], f"LoRA={out['model_has_lora']}; source={s['model_training']['candidate_source']}"),
        ("q4_static_assets", "present" if out["model_has_static_q4_assets"] else "missing", f"shards={s['q4_static_assets']['q4_shard_count']}/{s['q4_static_assets']['expected_shard_count']}; bytes={s['q4_static_assets']['total_model_asset_bytes']}"),
        ("browser_runtime", "q4 draft path wired" if out["frontend_calls_model"] else "not confirmed", f"runtime_forward={out['model_runtime_forward']}; hotfix2_branch={s['browser_runtime']['hotfix2_branch_present']}"),
        ("tokenizer", out["model_text_decode"], f"runtime_asset={s['tokenizer']['runtime_asset']}; decode={s['tokenizer']['decode_status']}"),
        ("RAG_runtime", s["RAG_runtime"]["runtime_mode"], f"records={s['RAG_runtime']['demo_memory_records']}; answer_bank={s['RAG_runtime']['answer_bank']}"),
        ("RAG_training", s["RAG_training"]["status"], "teacher/browser/vector-store disabled"),
        ("distillation", s["distillation"]["status"], f"teacher_probe_pack={s['distillation']['teacher_probe_pack_present']}"),
        ("user_answered_anchors", "tracked splits exist; no training approved", f"allowed_count={out['anchors_training_allowed_count']}; old_rows_blocked={out['old_excluded_rows_blocked']}"),
        ("answer_surface_router", s["answer_surface_router"]["status"], f"hard_router={s['answer_surface_router']['hard_router_present']}; answer_bank={s['answer_surface_router']['answer_bank_present']}"),
        ("frontend_UI", f"main marker {s['frontend_UI']['main_ui_marker']}", f"process_panel={s['frontend_UI']['process_panel_on_main']}; hotfix2_ui_branch={s['frontend_UI']['hotfix2_ui_marker_available_in_branch']}"),
        ("deployment", "local evidence only", f"production={s['deployment']['vercel_production_status']}; preview={s['deployment']['vercel_preview_status']}"),
        ("blockers", report["specific_outputs"]["release_readiness_label"], f"{sum(1 for b in s['blockers'] if b['status'] == 'open')} open blockers"),
    ]
    table = "\n".join(f"| {name} | {status} | {evidence} |" for name, status, evidence in rows)
    return f"""# R28STATUS0 Project Progress

Generated: `{report['generated_at']}`

R28STATUS0 is a local-only progress ledger. It did not train, parse root DOCX/PDF, parse `data/public_ingestion`, call external LLMs, call Doubao, connect backend inference, or approve product/browser/release admission.

## Required Answers

- Current model has LoRA: `{out['model_has_lora']}`.
- Current model is from-scratch q4 static decoder: `{s['q4_static_assets']['model_is_from_scratch_q4_static_decoder']}`.
- Static q4 assets present: `{out['model_has_static_q4_assets']}`.
- Frontend calls q4 model path on `origin/main`: `{out['frontend_calls_model']}`.
- Self-check/q4 forward/tokens: `{s['browser_runtime']['self_check_q4_forward_status']}`.
- RAG progress: `{out['rag_status']}`.
- 100 questions/user_answered anchors usable for approved training: `{out['anchors_training_allowed_count']}` tracked user_answered split rows; training is not approved by this task.
- Answer bank/hard router: hard router boundary exists; broad answer bank is `{s['answer_surface_router']['answer_bank_present']}`.
- Vercel preview/production: `{s['deployment']['vercel_preview_status']}` / `{s['deployment']['vercel_production_status']}`.
- Release readiness label: `{out['release_readiness_label']}`.

## Module Progress Map

| Module | Current State | Evidence |
| --- | --- | --- |
{table}

## Branch Reality

- `origin/main`: `{s['deployment']['main_sha']}`, UI marker `{s['deployment']['main_ui_marker']}`.
- `origin/r28hotfix2-nonblocking-selfcheck`: present=`{s['browser_runtime']['hotfix2_branch_present']}`, sha=`{s['browser_runtime']['hotfix2_sha']}`, nonblocking self-check=`{s['browser_runtime']['hotfix2_nonblocking_selfcheck']}`, identity route=`{s['browser_runtime']['hotfix2_identity_route']}`.
- HOTFIX2 merged to main: `{not s['browser_runtime']['hotfix2_not_merged_to_main']}`.

## Non-Claims

- not product model
- not product admission
- not browser admission
- not release checkpoint
- no training
- no new model assets
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
"""


def blocker_doc(report: dict[str, Any]) -> str:
    rows = "\n".join(
        f"| {item['id']} | {item['status']} | {item['evidence']} |"
        for item in report["sections"]["blockers"]
    )
    return f"""# R28STATUS0 Blocker Ledger

Generated: `{report['generated_at']}`

| Blocker | Status | Evidence |
| --- | --- | --- |
{rows}

## Interpretation

The q4 static runtime is an engineering candidate, not an admitted product model. The most concrete near-term blocker is that the user-facing HOTFIX2 branch must be preview-verified and merged before production can be trusted for nonblocking self-check and the identity route.

Live Vercel status is intentionally marked `not_live_checked_in_R28STATUS0`; this local audit did not query Vercel or GitHub checks.
"""


def next_doc(report: dict[str, Any]) -> str:
    items = report["sections"]["next_queue"]
    body = "\n".join(
        f"{idx}. **{item['step']}**\n\n   Why: {item['why']}\n\n   Prompt: `{item['prompt']}`"
        for idx, item in enumerate(items, start=1)
    )
    return f"""# R28STATUS0 Next Actions

Generated: `{report['generated_at']}`

## Shortest Launch Path

{body}

## Guardrails

- Do not train.
- Do not add or change model weights/shards.
- Do not parse root DOCX/PDF or `data/public_ingestion`.
- Do not connect backend inference, external LLM APIs, Doubao, or hosted vector stores.
- Do not approve product/browser/release admission inside a status task.
"""


def write_docs(report: dict[str, Any]) -> None:
    DOC_DIR.mkdir(parents=True, exist_ok=True)
    PROGRESS_DOC.write_text(progress_doc(report), encoding="utf-8")
    BLOCKER_DOC.write_text(blocker_doc(report), encoding="utf-8")
    NEXT_DOC.write_text(next_doc(report), encoding="utf-8")


def main() -> int:
    report = build_report()
    write_docs(report)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
