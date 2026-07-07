"""Metadata-only R28P0B candidate binding and prelaunch acceptance helpers."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from src.product_prelaunch.a12_handoff_intake import ARTIFACT_ROOT, ROOT, load_a12_handoff, write_json

MAX_STATIC_BYTES = 100_000_000
WEB_RUNTIME_PATH = ROOT / "web" / "another_brain" / "runtime_mode.json"
WEB_INDEX_PATH = ROOT / "web" / "another_brain_chat" / "index.html"
WEB_APP_PATH = ROOT / "web" / "another_brain_chat" / "app.js"
WEB_CSS_PATH = ROOT / "web" / "another_brain_chat" / "styles.css"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def budget_total(intake: dict) -> int | None:
    row = intake.get("budget_row") or {}
    value = row.get("full_static_bundle_estimate_bytes")
    return int(value) if value is not None else None


def budget_status(intake: dict) -> str:
    total = budget_total(intake)
    if total is None:
        return "unknown"
    return "under_100mb" if total <= MAX_STATIC_BYTES else "over_100mb"


def release_blockers(intake: dict) -> list[str]:
    status = intake.get("handoff_status", "no_model")
    blockers = [
        "vercel_preview_not_checked",
        "product_admission_pending",
        "browser_admission_pending",
        "release_checkpoint_pending",
    ]
    if status == "WAIT_A12_RUNNING":
        blockers.insert(0, "a12_still_running")
    elif status == "no_model":
        blockers.insert(0, "no_candidate")
    elif status != "product_path_engineering_candidate":
        blockers.insert(0, "candidate_not_ready_or_no_go")
    if budget_status(intake) == "over_100mb":
        blockers.insert(0, "budget_over_100mb")
    return blockers


def is_same_origin_path(path: str) -> bool:
    lowered = path.lower()
    return not (
        lowered.startswith(("http://", "https://", "//"))
        or ".." in Path(path).parts
        or path.startswith("/")
    )


def load_or_create_intake(synthetic_if_missing: bool = True, artifact_root: Path = ARTIFACT_ROOT) -> dict:
    report_path = artifact_root / "reports" / "a12_handoff_intake.json"
    if report_path.exists():
        return read_json(report_path)
    intake = load_a12_handoff(synthetic_if_missing=synthetic_if_missing)
    write_json(report_path, intake)
    return intake


def bind_candidate(
    *,
    synthetic_if_missing: bool = True,
    intake: dict | None = None,
    artifact_root: Path = ARTIFACT_ROOT,
) -> dict:
    intake = intake or load_or_create_intake(synthetic_if_missing, artifact_root)
    status = intake.get("handoff_status", "no_model")
    has_product_candidate = status == "product_path_engineering_candidate"
    report = {
        "ok": status != "WAIT_A12_RUNNING",
        "binding_status": "a12_metadata_bound" if has_product_candidate else "synthetic_fallback_bound",
        "candidate_route": status,
        "selected_model": intake.get("selected_model", "no_model"),
        "handoff_source": intake.get("handoff_source"),
        "source_checkpoint": intake.get("best_checkpoint_path"),
        "source_checkpoint_exists": bool(intake.get("best_checkpoint_exists")),
        "bound_model": bool(has_product_candidate),
        "synthetic_fallback": not has_product_candidate,
        "candidate_static_bundle": False,
        "model_assets_committed": False,
        "tokenizer_assets_committed": False,
        "exported_assets_committed": False,
        "artifact_root": artifact_root.as_posix(),
        "budget_status": budget_status(intake),
        "full_static_bundle_estimate_bytes": budget_total(intake),
        "budget_classification": (intake.get("budget_row") or {}).get("classification", "unknown"),
        "release_blockers": release_blockers(intake),
        "non_claims": {
            "product_model": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "phase_4": False,
        },
    }
    write_json(artifact_root / "reports" / "candidate_binding.json", report)
    return report


def export_candidate(
    *,
    synthetic_if_missing: bool = True,
    binding: dict | None = None,
    artifact_root: Path = ARTIFACT_ROOT,
) -> dict:
    binding = binding or bind_candidate(synthetic_if_missing=synthetic_if_missing, artifact_root=artifact_root)
    report = {
        "ok": bool(binding.get("ok")),
        "export_kind": "metadata_only_prelaunch_export",
        "candidate_route": binding.get("candidate_route"),
        "selected_model": binding.get("selected_model"),
        "source_checkpoint": binding.get("source_checkpoint"),
        "source_checkpoint_exists": binding.get("source_checkpoint_exists"),
        "weights_copied": False,
        "tokenizer_copied": False,
        "shards_written": False,
        "exported_assets_committed": False,
        "synthetic_fallback": binding.get("synthetic_fallback"),
    }
    write_json(artifact_root / "export" / "export_manifest.json", report)
    write_json(artifact_root / "reports" / "export_candidate.json", report)
    return report


def quantize_candidate(
    *,
    quant: str = "q4",
    synthetic_if_missing: bool = True,
    binding: dict | None = None,
    artifact_root: Path = ARTIFACT_ROOT,
) -> dict:
    binding = binding or bind_candidate(synthetic_if_missing=synthetic_if_missing, artifact_root=artifact_root)
    model_bytes = None
    if binding.get("candidate_route") == "product_path_engineering_candidate":
        intake = load_or_create_intake(synthetic_if_missing, artifact_root)
        model_bytes = (intake.get("budget_row") or {}).get("model_bytes")
    report = {
        "ok": bool(binding.get("ok")),
        "quant": quant,
        "quantization_kind": "budget_metadata_only",
        "candidate_route": binding.get("candidate_route"),
        "selected_model": binding.get("selected_model"),
        "estimated_quantized_model_bytes": model_bytes,
        "actual_quantized_assets_written": False,
        "weights_copied": False,
        "tokenizer_copied": False,
        "synthetic_fallback": binding.get("synthetic_fallback"),
    }
    write_json(artifact_root / "quantized" / f"{quant}_manifest.json", report)
    write_json(artifact_root / "reports" / "quantize_candidate.json", report)
    return report


def loader_smoke(
    *,
    synthetic_if_missing: bool = True,
    binding: dict | None = None,
    artifact_root: Path = ARTIFACT_ROOT,
) -> dict:
    binding = binding or bind_candidate(synthetic_if_missing=synthetic_if_missing, artifact_root=artifact_root)
    planned_path = f"another_brain/model_candidates/r28p0b/{binding.get('selected_model', 'synthetic')}/q4/manifest.json"
    same_origin = is_same_origin_path(planned_path)
    manifest = {
        "manifest_version": "r28p0b-prelaunch-metadata-manifest-v1",
        "candidate_route": binding.get("candidate_route"),
        "selected_model": binding.get("selected_model"),
        "same_origin_only": True,
        "metadata_only": True,
        "actual_asset_load": False,
        "planned_manifest_path": planned_path,
        "planned_model_assets": [],
        "product_model": False,
        "browser_admission": False,
        "release_checkpoint": False,
    }
    report = {
        "ok": bool(binding.get("ok")) and same_origin,
        "same_origin_manifest_smoke": same_origin,
        "candidate_route": binding.get("candidate_route"),
        "selected_model": binding.get("selected_model"),
        "actual_asset_load": False,
        "model_assets_committed": False,
        "manifest": manifest,
    }
    write_json(artifact_root / "manifests" / "candidate_static_manifest.json", manifest)
    write_json(artifact_root / "reports" / "loader_smoke.json", report)
    return report


def run_python_gate(module_path: str) -> dict:
    result = subprocess.run(
        ["python3", module_path],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "stdout_tail": result.stdout[-1200:],
        "stderr_tail": result.stderr[-1200:],
    }


def bundle_report() -> dict:
    from scripts.r27b4_bundle_report import make_bundle_report

    return make_bundle_report()


def prelaunch_acceptance(artifact_root: Path = ARTIFACT_ROOT) -> dict:
    config = read_json(WEB_RUNTIME_PATH)
    binding_path = artifact_root / "reports" / "candidate_binding.json"
    loader_path = artifact_root / "reports" / "loader_smoke.json"
    binding = read_json(binding_path) if binding_path.exists() else bind_candidate(artifact_root=artifact_root)
    loader = read_json(loader_path) if loader_path.exists() else loader_smoke(binding=binding, artifact_root=artifact_root)
    html = WEB_INDEX_PATH.read_text(encoding="utf-8", errors="ignore")
    app = WEB_APP_PATH.read_text(encoding="utf-8", errors="ignore")
    css = WEB_CSS_PATH.read_text(encoding="utf-8", errors="ignore")
    bundle = bundle_report()
    static_only = run_python_gate("scripts/r27b0_check_static_only.py")

    scenarios = {
        "build_gate_available": "build:vercel" in read_json(ROOT / "package.json").get("scripts", {}),
        "bundle_under_100mb": bundle.get("ok") is True and int(bundle.get("margin_bytes", -1)) >= 0,
        "no_backend_inference": config.get("backend_inference") is False and static_only["ok"],
        "no_external_llm": config.get("external_llm_api") is False,
        "no_doubao": "doubao" not in (html + app + css).lower(),
        "no_hosted_vector_store": config.get("hosted_vector_store") is False,
        "chat_route_files_present": WEB_INDEX_PATH.exists() and WEB_APP_PATH.exists(),
        "local_only_badge": "Local only" in html and "No backend inference" in html,
        "rag_panel": "RAG Mode" in html and "Evidence drawer" in html,
        "adapter_import_export": "context-import-button" in html and "state-export-button" in html,
        "asset_cache_status": "asset-cache-status" in html,
        "synthetic_fallback_if_no_model": binding.get("candidate_route") != "no_model" or binding.get("synthetic_fallback") is True,
        "candidate_route_visible": "candidate-route-status" in html,
        "no_product_model_claim": config.get("product_model") is False,
        "no_phase4_claim": config.get("phase_4", False) is False,
        "no_release_checkpoint_claim": config.get("release_checkpoint") is False,
        "same_origin_manifest_smoke_if_model_bound": loader.get("same_origin_manifest_smoke") is True,
        "mobile_layout": "@media (max-width: 720px)" in css,
        "accessibility_markers": 'aria-label="prelaunch candidate and release blocker status"' in html,
    }
    failures = [name for name, ok in scenarios.items() if not ok]
    report = {
        "ok": not failures,
        "failures": failures,
        "scenarios": scenarios,
        "candidate_route": binding.get("candidate_route"),
        "bound_model": binding.get("bound_model"),
        "synthetic_fallback": binding.get("synthetic_fallback"),
        "full_bundle_size": binding.get("full_static_bundle_estimate_bytes"),
        "runtime_bundle_report": bundle,
        "static_only_gate": static_only,
        "non_claims": {
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "phase_4": False,
        },
    }
    write_json(artifact_root / "reports" / "prelaunch_acceptance.json", report)
    return report
