#!/usr/bin/env python3
"""R28D4 prelaunch PR and Vercel preview gate.

The gate prepares evidence for a PR/preview handoff. It does not train, does
not add model assets, and does not merge main automatically.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "artifacts" / "r28d4" / "reports" / "prelaunch_pr_preview_gate.json"
PR_BODY_PATH = ROOT / "artifacts" / "r28d4" / "reports" / "pr_body.md"

INPUT_BRANCHES = [
    {
        "label": "R28M0",
        "branch": "origin/r28m0-model-asset-dryrun",
        "rank": 40,
        "reason": "latest dry-run branch; contains B9 bundle diet and M0 asset admission decision",
    },
    {
        "label": "R28P1",
        "branch": "origin/r28p1-release-candidate-gate",
        "rank": 30,
        "reason": "release-candidate gate sibling branch; useful as reference evidence",
    },
    {
        "label": "R28B9",
        "branch": "origin/r28b9-static-bundle-diet",
        "rank": 20,
        "reason": "static shell bundle diet and 100MB margin hardening",
    },
    {
        "label": "R28P0B",
        "branch": "origin/r28p0b-prelaunch-integration",
        "rank": 10,
        "reason": "fallback metadata-bound prelaunch integration baseline",
    },
]

COMMAND_GATES = [
    ["npm", "run", "test:r28m0"],
    ["npm", "run", "test:r28b9"],
    ["npm", "run", "test:r28p0b"],
    ["npm", "run", "check:r27b0-static-budget"],
    ["npm", "run", "check:r27b0-static-only"],
    ["npm", "run", "build:vercel"],
]

FORBIDDEN_DIFF_SUFFIXES = {
    ".pt",
    ".pth",
    ".safetensors",
    ".ckpt",
    ".onnx",
    ".gguf",
}
FORBIDDEN_DIFF_BASENAMES = {"tokenizer.json", "tokenizer.model"}
FORBIDDEN_DIFF_PREFIXES = {
    "artifacts/",
    "data/public_ingestion/",
    "raw_public_samples/",
    "clean_public_samples/",
    "training_mix/",
}


def run(args: list[str], *, check: bool = False) -> dict:
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=False)
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"{' '.join(args)} failed")
    return {
        "command": " ".join(args),
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "stdout_tail": result.stdout[-3000:],
        "stderr_tail": result.stderr[-3000:],
    }


def git(args: list[str], *, check: bool = False) -> dict:
    return run(["git", *args], check=check)


def git_stdout(args: list[str], *, check: bool = False) -> str:
    result = git(args, check=check)
    return result["stdout_tail"].strip()


def ref_exists(ref: str) -> bool:
    return git(["rev-parse", "--verify", "--quiet", ref])["ok"]


def short_commit(ref: str) -> str | None:
    if not ref_exists(ref):
        return None
    return git_stdout(["rev-parse", "--short", ref], check=True)


def is_ancestor(ancestor: str, descendant: str) -> bool | None:
    if not ref_exists(ancestor) or not ref_exists(descendant):
        return None
    return git(["merge-base", "--is-ancestor", ancestor, descendant])["ok"]


def discover_inputs() -> list[dict]:
    rows = []
    for item in INPUT_BRANCHES:
        branch = item["branch"]
        rows.append(
            {
                **item,
                "exists": ref_exists(branch),
                "commit": short_commit(branch),
            }
        )
    return rows


def choose_branch(rows: list[dict]) -> dict:
    available = [row for row in rows if row["exists"]]
    if not available:
        return {"ok": False, "selected": None, "reason": "no_input_branches_available"}
    selected = sorted(available, key=lambda row: row["rank"], reverse=True)[0]
    notes = []
    if selected["label"] == "R28M0":
        notes.append("R28M0 selected because it includes B9 and P0B lineage plus exact asset dry-run evidence.")
        if any(row["label"] == "R28P1" and row["exists"] for row in rows):
            notes.append("R28P1 exists as sibling release-candidate gate evidence but is not merged automatically in D4.")
    return {
        "ok": True,
        "selected": selected,
        "notes": notes,
        "m0_contains_b9": is_ancestor("origin/r28b9-static-bundle-diet", "origin/r28m0-model-asset-dryrun"),
        "m0_contains_p0b": is_ancestor("origin/r28p0b-prelaunch-integration", "origin/r28m0-model-asset-dryrun"),
        "m0_contains_p1": is_ancestor("origin/r28p1-release-candidate-gate", "origin/r28m0-model-asset-dryrun"),
    }


def changed_files_against(ref: str) -> list[str]:
    if not ref_exists(ref):
        return []
    output = subprocess.run(
        ["git", "diff", "--name-only", f"{ref}...HEAD"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if output.returncode != 0:
        return []
    return [line.strip() for line in output.stdout.splitlines() if line.strip()]


def working_tree_changed_files() -> list[str]:
    paths: set[str] = set()
    for args in (["diff", "--name-only"], ["diff", "--cached", "--name-only"]):
        output = git_stdout(args)
        paths.update(line.strip() for line in output.splitlines() if line.strip())
    status = git(["status", "--short", "--untracked-files=all"])["stdout_tail"]
    for raw in status.splitlines():
        if not raw.strip():
            continue
        path = raw[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        paths.add(path)
    return sorted(paths)


def forbidden_path(path: str) -> bool:
    path_obj = Path(path)
    if path_obj.suffix.lower() in FORBIDDEN_DIFF_SUFFIXES:
        return True
    if path_obj.name in FORBIDDEN_DIFF_BASENAMES:
        return True
    if path_obj.suffix.lower() in {".docx", ".pdf"} and len(path_obj.parts) == 1:
        return True
    return any(path == prefix.rstrip("/") or path.startswith(prefix) for prefix in FORBIDDEN_DIFF_PREFIXES)


def artifact_safety(selected_ref: str) -> dict:
    tracked_artifacts = [
        line.strip()
        for line in git_stdout(["ls-files", "artifacts"]).splitlines()
        if line.strip() and line.strip() != "artifacts/.gitkeep"
    ]
    changed = changed_files_against(selected_ref)
    working_tree_changed = working_tree_changed_files()
    effective_changed = sorted(set(changed) | set(working_tree_changed))
    forbidden_changed = [path for path in effective_changed if forbidden_path(path)]
    return {
        "ok": not tracked_artifacts and not forbidden_changed,
        "selected_ref": selected_ref,
        "tracked_artifact_files_except_gitkeep": tracked_artifacts,
        "changed_files_against_selected_ref": changed,
        "working_tree_changed_files": working_tree_changed,
        "effective_changed_files_for_safety": effective_changed,
        "forbidden_changed_files": forbidden_changed,
        "model_assets_committed": False,
        "tokenizer_artifacts_committed": False,
        "shards_committed": False,
    }


def command_available(command: str) -> dict:
    path = shutil.which(command)
    report = {"available": bool(path), "path": path}
    if path:
        report["version"] = run([command, "--version"])
    return report


def run_command_gates() -> list[dict]:
    return [run(command) for command in COMMAND_GATES]


def maybe_run_vercel_build() -> dict:
    vercel = command_available("vercel")
    if not vercel["available"]:
        return {"available": False, "ran": False, "reason": "vercel_cli_not_available"}
    result = run(["vercel", "build"])
    return {"available": True, "ran": True, "result": result}


def pr_instructions(selected_branch: str) -> dict:
    title = "R28D4 prelaunch PR preview gate"
    body = f"""## Summary

- Prelaunch PR/preview gate for another_brain.
- Selected prelaunch branch input: `{selected_branch}`.
- No training and no model assets are included in this D4 commit.
- `gh` and `vercel` availability are recorded in the D4 report.

## Local gates

- `npm run test:r28m0`
- `npm run test:r28b9`
- `npm run test:r28p0b`
- `npm run check:r27b0-static-budget`
- `npm run check:r27b0-static-only`
- `npm run build:vercel`

## Non-claims

- No product model admission.
- No browser admission.
- No release checkpoint admission.
- No backend inference.
- No external LLM runtime.
- No automatic merge to main.
"""
    PR_BODY_PATH.parent.mkdir(parents=True, exist_ok=True)
    PR_BODY_PATH.write_text(body, encoding="utf-8")
    return {
        "base": "main",
        "head": "r28d4-prelaunch-pr-preview-gate",
        "title": title,
        "body_artifact": PR_BODY_PATH.as_posix(),
        "manual_command": (
            "gh pr create --base main --head r28d4-prelaunch-pr-preview-gate "
            f"--title {json.dumps(title)} --body-file {PR_BODY_PATH.as_posix()}"
        ),
        "manual_url": "https://github.com/dpan538/another_brain/pull/new/r28d4-prelaunch-pr-preview-gate",
    }


def build_report() -> dict:
    inputs = discover_inputs()
    selection = choose_branch(inputs)
    selected_ref = selection.get("selected", {}).get("branch") or "origin/r28p0b-prelaunch-integration"
    gates = run_command_gates()
    artifact_report = artifact_safety(selected_ref)
    gh_status = command_available("gh")
    vercel_status = maybe_run_vercel_build()
    failures = [gate["command"] for gate in gates if not gate["ok"]]
    if not selection["ok"]:
        failures.append("branch_selection")
    if not artifact_report["ok"]:
        failures.append("artifact_safety")
    if vercel_status.get("ran") and not vercel_status.get("result", {}).get("ok"):
        failures.append("vercel_build")
    report = {
        "ok": not failures,
        "task": "R28D4",
        "branch": "r28d4-prelaunch-pr-preview-gate",
        "inputs": inputs,
        "selection": selection,
        "command_gates": gates,
        "artifact_safety": artifact_report,
        "gh_cli": gh_status,
        "vercel_build": vercel_status,
        "pr_instructions": pr_instructions(selected_ref),
        "failures": failures,
        "no_auto_merge_main": True,
        "non_claims": {
            "training": False,
            "model_assets": False,
            "tokenizer_assets": False,
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "backend_inference": False,
            "external_llm_api": False,
        },
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    report = build_report()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
