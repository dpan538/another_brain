"""R28P1 release-candidate intake and gate helpers.

R28P1 is a release-candidate gate for the static demo shell. It reads A12 and
R28P0B metadata, but it does not admit or copy model assets.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Callable, Iterable

ROOT = Path(__file__).resolve().parents[2]
A12_WORKTREE = Path(os.environ.get("R28P1_A12_WORKTREE", "/Users/jarlgiovanni/Desktop/another_brain_train_r27a12"))
ARTIFACT_ROOT = ROOT / "artifacts" / "r28p1"
REPORT_DIR = ARTIFACT_ROOT / "reports"
MAX_STATIC_BYTES = 100_000_000
RELEASE_CANDIDATE_MODE = "demo_static_with_engineering_candidate_metadata"

RUNTIME_MODE_PATH = ROOT / "web" / "another_brain" / "runtime_mode.json"
ASSET_MANIFEST_PATH = ROOT / "web" / "another_brain" / "asset_manifest.json"
CHAT_INDEX_PATH = ROOT / "web" / "another_brain_chat" / "index.html"
CHAT_APP_PATH = ROOT / "web" / "another_brain_chat" / "app.js"
CHAT_RUNTIME_PATH = ROOT / "web" / "another_brain_chat" / "browser_runtime.js"

MODEL_ASSET_SUFFIXES = (".pt", ".pth", ".safetensors", ".ckpt", ".onnx", ".gguf", ".bin")
TOKENIZER_FILENAMES = ("tokenizer.json", "tokenizer.model")
ALLOWED_LEGACY_TOKENIZER_FIXTURES = {"static_llm/fixtures/tiny_decoder_fixture/tokenizer.json"}

REQUIRED_RELEASE_BLOCKERS = [
    "real_model_assets_not_admitted_or_committed",
    "same_origin_model_shard_loader_not_tested_with_real_committed_shards",
    "product_model_admission_not_done",
    "browser_admission_not_done",
    "release_checkpoint_admission_not_done",
    "vercel_preview_must_pass",
    "100mb_margin_tight",
    "final_merge_to_main_pending",
]

NON_CLAIMS = {
    "product_model": False,
    "product_admission": False,
    "browser_admission": False,
    "release_checkpoint_admission": False,
    "phase_4": False,
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def first_existing(paths: Iterable[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def default_summary_paths(root: Path = ROOT, a12_worktree: Path = A12_WORKTREE) -> list[Path]:
    return [
        root / "data" / "training_registry" / "r27a12_browser_handoff_summary.json",
        a12_worktree / "data" / "training_registry" / "r27a12_browser_handoff_summary.json",
    ]


def default_handoff_paths(root: Path = ROOT, a12_worktree: Path = A12_WORKTREE) -> list[Path]:
    return [
        root / "artifacts" / "r27a12" / "handoff" / "R27_BROWSER_CANDIDATE_HANDOFF.json",
        a12_worktree / "artifacts" / "r27a12" / "handoff" / "R27_BROWSER_CANDIDATE_HANDOFF.json",
    ]


def default_r28p0b_metadata_paths(root: Path = ROOT) -> list[Path]:
    return [
        root / "artifacts" / "r28p0b" / "reports" / "candidate_binding.json",
        root / "artifacts" / "r28p0b" / "reports" / "prelaunch_acceptance.json",
        root / "web" / "another_brain" / "runtime_mode.json",
    ]


def default_bundle_report_paths(root: Path = ROOT) -> list[Path]:
    return [
        root / "artifacts" / "r28p1" / "reports" / "bundle_report.json",
        root / "artifacts" / "r28p0b" / "reports" / "prelaunch_acceptance.json",
        root / "artifacts" / "r27b4" / "reports" / "bundle_report.json",
    ]


def normalize_candidate_route(*values: str | None) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            route = value.strip()
            if route == "product_path":
                return "product_path_engineering_candidate"
            return route
    return "no_model"


def bool_false(value: object) -> bool:
    return value is False


def tracked_files(root: Path = ROOT) -> list[str]:
    result = subprocess.run(["git", "ls-files"], cwd=root, text=True, capture_output=True, check=True)
    return result.stdout.splitlines()


def classify_tracked_forbidden_assets(files: Iterable[str]) -> dict:
    model_assets: list[str] = []
    tokenizer_artifacts: list[str] = []
    exported_or_sharded_assets: list[str] = []
    forbidden_source_surfaces: list[str] = []
    allowed_legacy_fixtures: list[str] = []

    for rel in files:
        lowered = rel.lower()
        name = Path(rel).name
        if lowered.endswith(MODEL_ASSET_SUFFIXES):
            model_assets.append(rel)
            if any(part in lowered for part in ("shard", "quant", "onnx", "gguf", "model_candidates", "models_staging")):
                exported_or_sharded_assets.append(rel)
        if name in TOKENIZER_FILENAMES:
            if rel in ALLOWED_LEGACY_TOKENIZER_FIXTURES:
                allowed_legacy_fixtures.append(rel)
            else:
                tokenizer_artifacts.append(rel)
        if (
            "raw_public_samples" in lowered
            or "clean_public_samples" in lowered
            or "training_mix" in lowered
            or lowered.startswith("data/public_ingestion")
        ):
            forbidden_source_surfaces.append(rel)
        if lowered.endswith((".docx", ".pdf")) and "/" not in rel:
            forbidden_source_surfaces.append(rel)

    return {
        "model_assets": sorted(model_assets),
        "tokenizer_artifacts": sorted(tokenizer_artifacts),
        "exported_or_sharded_assets": sorted(set(exported_or_sharded_assets)),
        "forbidden_source_surfaces": sorted(set(forbidden_source_surfaces)),
        "allowed_legacy_fixtures": sorted(allowed_legacy_fixtures),
    }


def load_bundle_report(root: Path = ROOT, *, live_bundle: bool = True) -> tuple[dict, str]:
    existing = first_existing(default_bundle_report_paths(root))
    if existing:
        payload = read_json(existing)
        if "runtime_bundle_report" in payload and isinstance(payload["runtime_bundle_report"], dict):
            return payload["runtime_bundle_report"], existing.as_posix()
        return payload, existing.as_posix()
    if not live_bundle:
        return {}, "not_available"
    from scripts.r27b4_bundle_report import make_bundle_report

    return make_bundle_report(), "computed:scripts.r27b4_bundle_report"


def load_prelaunch_sources(
    *,
    root: Path = ROOT,
    a12_worktree: Path = A12_WORKTREE,
    live_bundle: bool = True,
) -> dict:
    summary_path = first_existing(default_summary_paths(root, a12_worktree))
    handoff_path = first_existing(default_handoff_paths(root, a12_worktree))
    r28p0b_path = first_existing(default_r28p0b_metadata_paths(root))
    bundle, bundle_source = load_bundle_report(root, live_bundle=live_bundle)

    return {
        "summary": read_json(summary_path) if summary_path else {},
        "summary_source": summary_path.as_posix() if summary_path else None,
        "handoff": read_json(handoff_path) if handoff_path else {},
        "handoff_source": handoff_path.as_posix() if handoff_path else None,
        "r28p0b_metadata": read_json(r28p0b_path) if r28p0b_path else {},
        "r28p0b_metadata_source": r28p0b_path.as_posix() if r28p0b_path else None,
        "runtime_mode": read_json(root / "web" / "another_brain" / "runtime_mode.json"),
        "asset_manifest": read_json(root / "web" / "another_brain" / "asset_manifest.json"),
        "bundle_report": bundle,
        "bundle_report_source": bundle_source,
    }


def first_value(*values: object) -> object:
    for value in values:
        if value is not None:
            return value
    return None


def build_prelaunch_intake(
    *,
    root: Path = ROOT,
    a12_worktree: Path = A12_WORKTREE,
    live_bundle: bool = True,
    tracked_files_loader: Callable[[Path], list[str]] | None = None,
) -> dict:
    sources = load_prelaunch_sources(root=root, a12_worktree=a12_worktree, live_bundle=live_bundle)
    summary = sources["summary"]
    handoff = sources["handoff"]
    metadata = sources["r28p0b_metadata"]
    runtime = sources["runtime_mode"]
    manifest = sources["asset_manifest"]
    bundle = sources["bundle_report"]

    budget_row = handoff.get("budget_row") or summary.get("budget_row") or {}
    candidate_route = normalize_candidate_route(
        handoff.get("candidate_route"),
        summary.get("candidate_route"),
        metadata.get("candidate_route"),
        runtime.get("candidate_route"),
        runtime.get("handoff_status"),
    )
    selected_model = first_value(handoff.get("selected_model"), summary.get("selected_model"), metadata.get("selected_model"), runtime.get("selected_model"), "no_model")
    estimated_full_bundle_bytes = int(
        first_value(
            budget_row.get("full_static_bundle_estimate_bytes"),
            metadata.get("full_static_bundle_estimate_bytes"),
            metadata.get("full_bundle_size"),
            runtime.get("full_static_bundle_estimate_bytes"),
            0,
        )
        or 0
    )
    budget_margin_bytes = int(
        first_value(
            budget_row.get("remaining_bytes_under_100mb"),
            runtime.get("remaining_bytes_under_100mb"),
            MAX_STATIC_BYTES - estimated_full_bundle_bytes if estimated_full_bundle_bytes else None,
            0,
        )
        or 0
    )
    bundle_bytes = int(first_value(bundle.get("build_output_bytes"), manifest.get("total_declared_bytes"), 0) or 0)

    loaded_tracked = (tracked_files_loader or tracked_files)(root)
    forbidden = classify_tracked_forbidden_assets(loaded_tracked)
    model_assets_declared = manifest.get("model_assets", [])
    tokenizer_assets_declared = manifest.get("tokenizer_assets", [])
    metadata_binding_present = candidate_route == "product_path_engineering_candidate" and str(selected_model) != "no_model"
    real_browser_model_runtime = bool(
        runtime.get("product_model") is True
        or runtime.get("candidate_static_bundle") is True
        or model_assets_declared
        or tokenizer_assets_declared
    )
    static_shell_ready = bool(
        runtime.get("delivery_mode") == "demo_static"
        and bool_false(runtime.get("backend_inference"))
        and bool_false(runtime.get("external_llm_api"))
        and manifest.get("backend_inference") is False
        and (root / "web" / "another_brain_chat" / "index.html").exists()
        and (root / "web" / "another_brain_chat" / "app.js").exists()
    )

    hard_blockers = list(REQUIRED_RELEASE_BLOCKERS)
    if not metadata_binding_present:
        hard_blockers.insert(0, "a12_engineering_candidate_metadata_missing")
    if real_browser_model_runtime:
        hard_blockers.insert(0, "unexpected_real_browser_model_runtime")
    if estimated_full_bundle_bytes >= MAX_STATIC_BYTES:
        hard_blockers.insert(0, "estimated_full_bundle_not_under_100mb")
    if forbidden["model_assets"]:
        hard_blockers.insert(0, "tracked_model_assets_present")
    if forbidden["tokenizer_artifacts"]:
        hard_blockers.insert(0, "tracked_tokenizer_artifacts_present")

    report = {
        "ok": metadata_binding_present and static_shell_ready and not real_browser_model_runtime,
        "a12_candidate_route": candidate_route,
        "model": selected_model,
        "model_assets_committed": bool(forbidden["model_assets"]),
        "metadata_binding_present": metadata_binding_present,
        "real_browser_model_runtime": real_browser_model_runtime,
        "static_shell_ready": static_shell_ready,
        "bundle_bytes": bundle_bytes,
        "estimated_full_bundle_bytes": estimated_full_bundle_bytes,
        "budget_margin_bytes": budget_margin_bytes,
        "release_candidate_mode": RELEASE_CANDIDATE_MODE,
        "hard_blockers": sorted(set(hard_blockers), key=hard_blockers.index),
        "release_blockers": list(REQUIRED_RELEASE_BLOCKERS),
        "tokenizer_artifacts_committed": bool(forbidden["tokenizer_artifacts"]),
        "exported_or_sharded_assets_committed": bool(forbidden["exported_or_sharded_assets"]),
        "forbidden_source_surfaces_committed": bool(forbidden["forbidden_source_surfaces"]),
        "asset_manifest_model_assets": len(model_assets_declared),
        "asset_manifest_tokenizer_assets": len(tokenizer_assets_declared),
        "non_claims": dict(NON_CLAIMS),
        "sources": {
            "a12_summary": sources["summary_source"],
            "a12_handoff": sources["handoff_source"],
            "r28p0b_metadata": sources["r28p0b_metadata_source"],
            "runtime_mode": (root / "web" / "another_brain" / "runtime_mode.json").as_posix(),
            "asset_manifest": (root / "web" / "another_brain" / "asset_manifest.json").as_posix(),
            "bundle_report": sources["bundle_report_source"],
        },
        "forbidden_asset_scan": forbidden,
    }
    return report


def write_prelaunch_intake(report: dict, artifact_root: Path = ARTIFACT_ROOT) -> Path:
    path = artifact_root / "reports" / "prelaunch_intake.json"
    write_json(path, report)
    return path


def generate_prelaunch_intake(*, artifact_root: Path = ARTIFACT_ROOT, live_bundle: bool = True) -> dict:
    report = build_prelaunch_intake(live_bundle=live_bundle)
    write_prelaunch_intake(report, artifact_root)
    return report
