#!/usr/bin/env python3
"""Run launch-readiness checks and summarize release blockers."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "artifacts" / "release" / "launch_readiness_report.json"
DEFAULT_MD = ROOT / "artifacts" / "release" / "launch_readiness_report.md"
RELEASE_STATUS = ROOT / "evals" / "release_policy" / "release_status.json"
TINY_ROUTER_WEB = ROOT / "web" / "tiny_router_model.generated.js"
KNOWLEDGE_SHARD_MANIFEST = ROOT / "web" / "knowledge_shards" / "manifest.json"


def run_command(name: str, command: list[str]) -> dict[str, Any]:
    proc = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    stdout = proc.stdout.strip()
    stderr = proc.stderr.strip()
    parsed: Any = None
    if stdout.startswith("{") or stdout.startswith("["):
        try:
            parsed = json.loads(stdout)
        except json.JSONDecodeError:
            parsed = None
    return {
        "name": name,
        "command": " ".join(command),
        "ok": proc.returncode == 0,
        "returncode": proc.returncode,
        "json": parsed,
        "stdout_tail": stdout[-3000:],
        "stderr_tail": stderr[-3000:],
    }


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def gate_result(check: dict[str, Any], summary: dict[str, Any] | None = None) -> dict[str, Any]:
    result = {
        "ok": bool(check.get("ok")),
        "command": check.get("command"),
    }
    if summary:
        result.update(summary)
    if not result["ok"]:
        result["stderr_tail"] = check.get("stderr_tail")
        result["stdout_tail"] = check.get("stdout_tail")
    return result


def summarize_identity_pack(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    return {
        "cards": payload.get("cards"),
        "visibility": payload.get("visibility"),
        "types": payload.get("types"),
    }


def summarize_tiny_router(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    route = payload.get("route", {})
    return {
        "webBytes": payload.get("webBytes"),
        "routeAccuracy": route.get("accuracy"),
        "total": route.get("total"),
        "correct": route.get("correct"),
        "sampleFailures": route.get("sampleFailures", [])[:5],
    }


def summarize_persona(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    golden = payload.get("golden", {})
    return {
        "total": golden.get("total"),
        "surfaceIdentityCases": golden.get("surfaceIdentityCases"),
        "relationshipTurns": golden.get("relationshipTurns"),
        "failures": len(golden.get("failures", [])),
        "forbiddenTerms": payload.get("forbidden_terms", []),
    }


def summarize_frontend_latency(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    summary = payload.get("summary", {})
    return {
        "total": summary.get("total"),
        "maxAnswerMs": summary.get("maxAnswerMs"),
        "maxAllowedMs": summary.get("maxAllowedMs"),
        "failures": summary.get("failures"),
    }


def summarize_voice_verifier(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    return payload.get("summary", {})


def summarize_fallback_overuse(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    return payload.get("summary", {})


def summarize_blind_casepacks(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    return payload.get("summary", {})


def summarize_gate_effectiveness(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    return payload.get("summary", {})


def summarize_report(path: Path) -> dict[str, Any]:
    payload = load_json(path, {})
    return payload.get("summary", payload)


def check_payload(check: dict[str, Any], artifact: Path | None = None) -> dict[str, Any]:
    payload = check.get("json")
    if isinstance(payload, dict):
        return payload
    if artifact:
        loaded = load_json(artifact, {})
        return loaded if isinstance(loaded, dict) else {}
    return {}


def max_shard_bytes() -> int:
    manifest = load_json(KNOWLEDGE_SHARD_MANIFEST, {})
    shards = manifest.get("shards", [])
    return max((int(item.get("bytes", 0)) for item in shards), default=0)


def milestone_status(report: dict[str, Any]) -> dict[str, Any]:
    status = load_json(RELEASE_STATUS, {})
    configured = status.get("milestones", {})
    thresholds = status.get("production_thresholds", {})
    tests = report["tests"]
    production = report["production_thresholds"]

    core_help_passed = (
        tests["persona"]["ok"]
        and tests["model_gate"]["ok"]
        and tests["help_onboarding"]["ok"]
        and tests["fallback_overuse"]["ok"]
    )
    all_runtime_gates = all(
        tests[name]["ok"]
        for name in [
            "release_preflight",
            "launch_policy",
            "seo_metadata",
            "knowledge_shards",
            "identity_pack",
            "dataset_splits",
            "distillation",
            "tiny_router_eval",
            "persona",
            "help_onboarding",
            "fallback_overuse",
            "frontend_latency",
            "voice_verifier",
            "output_sanitizer",
            "dialog_sanity",
            "gate_effectiveness",
            "blind_casepacks",
            "context_gate",
            "casepack_capability",
            "model_gate",
            "clone_logic_ethics_structure",
            "r6_preview_mobile",
            "r7_production_candidate",
            "r8_debug_report",
        ]
    )

    milestones = {
        "R0_surface_identity_protocol": {
            "status": "passed" if tests["persona"]["ok"] and tests["identity_pack"]["ok"] and tests["gate_effectiveness"]["ok"] else "failed",
            "notes": "Surface identity contract, persona gate, trace instrumentation, invariants, known-failure regression, fuzz, and mutation checks pass.",
        },
        "R1_help_onboarding": {
            "status": "passed" if core_help_passed else "failed",
            "notes": "Dedicated help/onboarding eval covers start, features, examples, project, privacy, limits, and memory at >= 98%, with no high-friction unknown fallback on protected entry prompts.",
        },
        "R2_training_eval_splits": {
            "status": "passed" if tests["dataset_splits"]["ok"] else "failed",
            "notes": "Train/dev/blind split manifest is frozen by family across identity, help, privacy, voice, logic/ethics, rewrite, and adversarial datasets.",
        },
        "R3_tiny_router_v2_action_classifier": {
            "status": "passed"
            if tests["tiny_router_eval"]["ok"] and tests["model_gate"]["ok"] and tests["frontend_latency"]["ok"]
            else "failed",
            "notes": "Tiny router v2 uses action labels, preserves answer-index behavior, and passes model gate plus frontend answer latency.",
        },
        "R4_language_layer_voice_verifier": {
            "status": "passed" if tests["voice_verifier"]["ok"] else "failed",
            "notes": "Voice verifier checks forbidden identity terms, privacy leakage, assistant tone, answer length, fake certainty, PR tone, and preference pairs.",
        },
        "R5_integrated_blind_eval": {
            "status": "passed" if tests["blind_casepacks"]["ok"] and tests["gate_effectiveness"]["ok"] else "failed",
            "notes": "Held-out clone logic/ethics casepacks pass integrated blind scoring, and gate effectiveness proves known failures, invariants, fuzz, and mutation probes are caught.",
        },
        "R6_vercel_preview_mobile_smoke": {
            "status": "passed" if tests["r6_preview_mobile"]["ok"] else "failed",
            "notes": "Automated preview/mobile smoke covers page load, required DOM, context toggle wiring, static responsive contract, and 100+ loaded-page runtime prompt turns within 1500ms.",
        },
        "R7_production_release_ready": {
            "status": "passed" if tests["r7_production_candidate"]["ok"] and tests["r6_preview_mobile"]["ok"] else "failed",
            "notes": "Production-candidate freeze has release preflight, knowledge-shard validation, and an explicit rollback commit. This does not automatically promote production.",
        },
        "R8_post_launch_debug_report": {
            "status": "passed" if tests["r8_debug_report"]["ok"] else "failed",
            "notes": "Local debug-report workflow can generate a schema-stable, local-only report without transcript by default and with sensitive-content scanning.",
        },
    }

    configured_summary = {
        name: configured.get(name, {}).get("status", "missing")
        for name in milestones
    }
    production_blockers = [
        name for name, item in production.items() if item.get("blocking", True) and not item.get("ok", False)
    ]
    passed_count = sum(1 for item in milestones.values() if item["status"] == "passed")
    partial_count = sum(1 for item in milestones.values() if item["status"] == "partial")
    pending_count = sum(1 for item in milestones.values() if item["status"] == "pending")
    failed_count = sum(1 for item in milestones.values() if item["status"] == "failed")
    final_allowed = (
        all(milestones[f"R{i}_{suffix}"]["status"] == "passed" for i, suffix in [
            (0, "surface_identity_protocol"),
            (1, "help_onboarding"),
            (2, "training_eval_splits"),
            (3, "tiny_router_v2_action_classifier"),
            (4, "language_layer_voice_verifier"),
            (5, "integrated_blind_eval"),
            (6, "vercel_preview_mobile_smoke"),
            (7, "production_release_ready"),
            (8, "post_launch_debug_report"),
        ])
        and not production_blockers
        and all_runtime_gates
        and bool(status.get("final_release_allowed"))
    )

    return {
        "milestones": milestones,
        "configured_release_status": configured_summary,
        "counts": {
            "passed": passed_count,
            "partial": partial_count,
            "pending": pending_count,
            "failed": failed_count,
        },
        "production_blockers": production_blockers,
        "final_release_allowed": final_allowed,
        "policy_final_release_allowed": bool(status.get("final_release_allowed")),
        "thresholds": thresholds,
    }


def threshold_report(checks: dict[str, dict[str, Any]], bench: dict[str, Any] | None) -> dict[str, Any]:
    status = load_json(RELEASE_STATUS, {})
    thresholds = status.get("production_thresholds", {})
    tiny_bytes = TINY_ROUTER_WEB.stat().st_size if TINY_ROUTER_WEB.exists() else 0
    shard_bytes = max_shard_bytes()
    knowledge_p99 = (bench or {}).get("p99Ms")
    frontend_latency = check_payload(
        checks.get("frontend_latency", {}),
        ROOT / "artifacts" / "release" / "frontend_latency_report.json",
    ).get("summary", {})
    return {
        "tiny_router_web_bytes": {
            "ok": True,
            "blocking": False,
            "actual": tiny_bytes,
            "max": "observed",
        },
        "frontend_answer_ms": {
            "ok": frontend_latency.get("maxAnswerMs") is not None
            and float(frontend_latency.get("maxAnswerMs")) <= float(thresholds.get("frontend_answer_max_ms", 0)),
            "actual": frontend_latency.get("maxAnswerMs"),
            "max": thresholds.get("frontend_answer_max_ms"),
        },
        "knowledge_shard_bytes": {
            "ok": shard_bytes <= int(thresholds.get("knowledge_shard_bytes_max", 0)),
            "actual": shard_bytes,
            "max": thresholds.get("knowledge_shard_bytes_max"),
        },
        "knowledge_p99_ms": {
            "ok": knowledge_p99 is not None and knowledge_p99 < float(thresholds.get("knowledge_p99_ms_max", 0)),
            "actual": knowledge_p99,
            "max": thresholds.get("knowledge_p99_ms_max"),
        },
        "critical_failures": {
            "ok": checks["model_gate"]["json"].get("summary", {}).get("failed", 0) == 0
            if checks["model_gate"].get("json")
            else False,
            "actual": checks["model_gate"]["json"].get("summary", {}).get("failed")
            if checks["model_gate"].get("json")
            else None,
            "max": thresholds.get("critical_failures_max"),
        },
    }


def write_markdown(report: dict[str, Any], path: Path) -> None:
    lines = [
        "# Launch Readiness Report",
        "",
        f"Final release allowed: `{str(report['final_release_allowed']).lower()}`",
        f"Policy final_release_allowed: `{str(report['milestone_summary']['policy_final_release_allowed']).lower()}`",
        "",
        "## Test Gates",
        "",
        "| Gate | Status | Key result |",
        "| --- | --- | --- |",
    ]
    for name, item in report["tests"].items():
        status = "PASS" if item.get("ok") else "FAIL"
        key = item.get("summary") or {k: v for k, v in item.items() if k not in {"command", "stderr_tail", "stdout_tail"}}
        lines.append(f"| `{name}` | {status} | `{json.dumps(key, ensure_ascii=False)[:180]}` |")
    lines += [
        "",
        "## Production Thresholds",
        "",
        "| Threshold | Status | Actual | Target |",
        "| --- | --- | ---: | ---: |",
    ]
    for name, item in report["production_thresholds"].items():
        status = "PASS" if item.get("ok") else "FAIL"
        lines.append(f"| `{name}` | {status} | `{item.get('actual')}` | `{item.get('max')}` |")
    lines += [
        "",
        "## Milestones",
        "",
        "| Milestone | Status | Notes |",
        "| --- | --- | --- |",
    ]
    for name, item in report["milestone_summary"]["milestones"].items():
        lines.append(f"| `{name}` | {item['status']} | {item['notes']} |")
    lines += [
        "",
        "## Blockers",
        "",
    ]
    blockers = report["milestone_summary"]["production_blockers"]
    if blockers:
        lines.extend(f"- `{item}`" for item in blockers)
    else:
        lines.append("- None from numeric thresholds.")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate launch readiness.")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--md-out", default=str(DEFAULT_MD))
    parser.add_argument("--bench-iterations", type=int, default=5000)
    args = parser.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    md_out = Path(args.md_out)
    md_out.parent.mkdir(parents=True, exist_ok=True)

    checks = {
        "release_preflight": run_command("release_preflight", ["bash", "scripts/check_release.sh"]),
        "launch_policy": run_command("launch_policy", ["python3", "scripts/validate_launch_policy.py"]),
        "seo_metadata": run_command(
            "seo_metadata",
            [
                "node",
                "scripts/eval_seo_metadata.mjs",
                "--out",
                "artifacts/release/seo_metadata_report.json",
            ],
        ),
        "knowledge_shards": run_command("knowledge_shards", ["python3", "scripts/validate_knowledge_shards.py"]),
        "identity_pack": run_command("identity_pack", ["python3", "scripts/validate_identity_pack.py"]),
        "dataset_splits": run_command("dataset_splits", ["python3", "scripts/validate_dataset_splits.py"]),
        "distillation": run_command("distillation", ["python3", "scripts/validate_distillation.py"]),
        "tiny_router_eval": run_command("tiny_router_eval", ["python3", "scripts/eval_tiny_router.py"]),
        "persona": run_command("persona", ["python3", "scripts/eval_dialog_persona.py"]),
        "help_onboarding": run_command("help_onboarding", ["python3", "scripts/eval_help_onboarding.py"]),
        "fallback_overuse": run_command("fallback_overuse", ["python3", "scripts/eval_fallback_overuse.py"]),
        "frontend_latency": run_command("frontend_latency", ["node", "scripts/eval_frontend_latency.mjs", "--max-answer-ms", "1500", "--out", "artifacts/release/frontend_latency_report.json"]),
        "voice_verifier": run_command("voice_verifier", ["python3", "scripts/eval_voice_verifier.py"]),
        "output_sanitizer": run_command("output_sanitizer", ["node", "scripts/eval_output_sanitizer.mjs"]),
        "dialog_sanity": run_command("dialog_sanity", ["node", "scripts/eval_dialog_sanity.mjs"]),
        "gate_effectiveness": run_command("gate_effectiveness", ["node", "scripts/eval_gate_effectiveness.mjs", "--out", "artifacts/release/gate_effectiveness_report.json"]),
        "blind_casepacks": run_command("blind_casepacks", ["node", "scripts/eval_blind_casepacks_node.mjs", "--median-min", "11", "--p25-min", "8", "--critical-failures", "0", "--out", "artifacts/release/blind_casepack_eval_report.json"]),
        "context_static": run_command("context_static", ["python3", "scripts/validate_context_stress_cases.py"]),
        "clone_logic_ethics_structure": run_command("clone_logic_ethics_structure", ["python3", "scripts/validate_clone_logic_ethics.py"]),
        "context_gate": run_command(
            "context_gate",
            [
                "node",
                "scripts/eval_context_gate_node.mjs",
                "--out",
                "artifacts/release/context_gate_report.json",
            ],
        ),
        "casepack_capability": run_command(
            "casepack_capability",
            [
                "node",
                "scripts/eval_casepacks_node.mjs",
                "--min-score",
                "0.88",
                "--out",
                "artifacts/release/casepack_eval_report.json",
            ],
        ),
        "model_gate": run_command(
            "model_gate",
            [
                "node",
                "scripts/run_model_gate_node.mjs",
                "--out",
                "artifacts/release/model_inference_report.json",
            ],
        ),
        "r6_preview_mobile": run_command(
            "r6_preview_mobile",
            [
                "node",
                "scripts/eval_r6_preview_mobile.mjs",
                "--prompts",
                "evals/r6_mobile/prompts.jsonl",
                "--out",
                "artifacts/release/r6_preview_mobile_report.json",
            ],
        ),
        "r7_production_candidate": run_command(
            "r7_production_candidate",
            [
                "python3",
                "scripts/eval_r7_production_candidate.py",
                "--rollback",
                "auto",
                "--out",
                "artifacts/release/r7_production_candidate_report.json",
            ],
        ),
        "r8_debug_report": run_command(
            "r8_debug_report",
            [
                "node",
                "scripts/eval_r8_debug_report.mjs",
                "--out",
                "artifacts/release/r8_debug_report_workflow.json",
            ],
        ),
    }
    bench = run_command("knowledge_runtime", ["python3", "scripts/bench_knowledge_runtime.py", str(args.bench_iterations)])
    checks["knowledge_runtime"] = bench

    tests = {
        "release_preflight": gate_result(checks["release_preflight"]),
        "launch_policy": gate_result(checks["launch_policy"], {"summary": checks["launch_policy"].get("json")}),
        "seo_metadata": gate_result(
            checks["seo_metadata"],
            {
                "summary": check_payload(
                    checks["seo_metadata"],
                    ROOT / "artifacts" / "release" / "seo_metadata_report.json",
                ).get("summary")
            },
        ),
        "knowledge_shards": gate_result(checks["knowledge_shards"], {"summary": checks["knowledge_shards"].get("json")}),
        "identity_pack": gate_result(checks["identity_pack"], {"summary": summarize_identity_pack(checks["identity_pack"].get("json"))}),
        "dataset_splits": gate_result(checks["dataset_splits"], {"summary": checks["dataset_splits"].get("json")}),
        "distillation": gate_result(checks["distillation"], {"summary": checks["distillation"].get("json")}),
        "tiny_router_eval": gate_result(checks["tiny_router_eval"], {"summary": summarize_tiny_router(checks["tiny_router_eval"].get("json"))}),
        "persona": gate_result(checks["persona"], {"summary": summarize_persona(checks["persona"].get("json"))}),
        "help_onboarding": gate_result(checks["help_onboarding"], {"summary": check_payload(checks["help_onboarding"]).get("summary")}),
        "fallback_overuse": gate_result(checks["fallback_overuse"], {"summary": summarize_fallback_overuse(checks["fallback_overuse"].get("json"))}),
        "frontend_latency": gate_result(checks["frontend_latency"], {"summary": summarize_frontend_latency(check_payload(checks["frontend_latency"], ROOT / "artifacts" / "release" / "frontend_latency_report.json"))}),
        "voice_verifier": gate_result(checks["voice_verifier"], {"summary": summarize_voice_verifier(checks["voice_verifier"].get("json"))}),
        "output_sanitizer": gate_result(checks["output_sanitizer"], {"summary": check_payload(checks["output_sanitizer"]).get("summary")}),
        "dialog_sanity": gate_result(checks["dialog_sanity"], {"summary": check_payload(checks["dialog_sanity"]).get("summary")}),
        "gate_effectiveness": gate_result(checks["gate_effectiveness"], {"summary": summarize_gate_effectiveness(checks["gate_effectiveness"].get("json"))}),
        "blind_casepacks": gate_result(checks["blind_casepacks"], {"summary": summarize_blind_casepacks(checks["blind_casepacks"].get("json"))}),
        "context_static": gate_result(checks["context_static"]),
        "clone_logic_ethics_structure": gate_result(checks["clone_logic_ethics_structure"]),
        "context_gate": gate_result(checks["context_gate"], {"summary": check_payload(checks["context_gate"], ROOT / "artifacts" / "release" / "context_gate_report.json").get("summary")}),
        "casepack_capability": gate_result(checks["casepack_capability"], {"summary": check_payload(checks["casepack_capability"], ROOT / "artifacts" / "release" / "casepack_eval_report.json").get("summary")}),
        "model_gate": gate_result(checks["model_gate"], {"summary": check_payload(checks["model_gate"], ROOT / "artifacts" / "release" / "model_inference_report.json").get("summary")}),
        "r6_preview_mobile": gate_result(checks["r6_preview_mobile"], {"summary": check_payload(checks["r6_preview_mobile"], ROOT / "artifacts" / "release" / "r6_preview_mobile_report.json").get("summary")}),
        "r7_production_candidate": gate_result(checks["r7_production_candidate"], {"summary": check_payload(checks["r7_production_candidate"], ROOT / "artifacts" / "release" / "r7_production_candidate_report.json").get("summary")}),
        "r8_debug_report": gate_result(checks["r8_debug_report"], {"summary": check_payload(checks["r8_debug_report"], ROOT / "artifacts" / "release" / "r8_debug_report_workflow.json").get("summary")}),
        "knowledge_runtime": gate_result(checks["knowledge_runtime"], {"summary": checks["knowledge_runtime"].get("json")}),
    }

    report: dict[str, Any] = {
        "schema_version": 1,
        "tests": tests,
        "production_thresholds": threshold_report(checks, checks["knowledge_runtime"].get("json")),
    }
    report["milestone_summary"] = milestone_status(report)
    report["final_release_allowed"] = bool(report["milestone_summary"]["final_release_allowed"])
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(report, md_out)

    print(
        json.dumps(
            {
                "ok": True,
                "final_release_allowed": report["final_release_allowed"],
                "milestones": report["milestone_summary"]["counts"],
                "production_blockers": report["milestone_summary"]["production_blockers"],
                "report": str(out.relative_to(ROOT)),
                "markdown": str(md_out.relative_to(ROOT)),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
