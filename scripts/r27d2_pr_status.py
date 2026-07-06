#!/usr/bin/env python3
"""R27D2 PR status helper for the R27D1 deployment branch."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
BASE_BRANCH = "main"
HEAD_BRANCH = "r27d1-preview-deploy-readiness"
PR_TITLE = "R27D1 preview deployment readiness"
PR_BODY_FILE = ROOT / "docs" / "r27" / "R27D1_PREVIEW_DEPLOYMENT_READINESS.md"
MANUAL_PR_URL = f"https://github.com/dpan538/another_brain/compare/{BASE_BRANCH}...{HEAD_BRANCH}?expand=1"

Runner = Callable[[list[str]], subprocess.CompletedProcess[str]]


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def run_command(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, text=True, capture_output=True)


def _manual(status: str, reason: str) -> dict[str, Any]:
    return {
        "ok": True,
        "base": BASE_BRANCH,
        "head": HEAD_BRANCH,
        "ghCliAvailable": False,
        "ghAuthenticated": False,
        "prExists": False,
        "prCreated": False,
        "status": status,
        "reason": reason,
        "manualRequired": True,
        "manualUrl": MANUAL_PR_URL,
        "manualChecklist": [
            "Open GitHub pull requests for dpan538/another_brain.",
            f"Create or confirm a PR with base {BASE_BRANCH} and head {HEAD_BRANCH}.",
            f"Use title: {PR_TITLE}.",
            "Wait for the Vercel preview deployment on that PR or branch.",
            "Do not merge raw B5 directly into main.",
            "Do not merge until preview passes or build logs show a non-repo cause.",
        ],
    }


def inspect_pr_status(
    *,
    exists: Callable[[str], bool] = command_exists,
    runner: Runner = run_command,
    create_if_missing: bool = True,
) -> dict[str, Any]:
    if not exists("gh"):
        return _manual("manual_required", "gh_cli_not_installed")

    auth = runner(["gh", "auth", "status"])
    gh_authenticated = auth.returncode == 0
    if not gh_authenticated:
        report = _manual("manual_required", "gh_cli_not_authenticated")
        report["ghCliAvailable"] = True
        report["ghAuthStderr"] = auth.stderr.strip()
        return report

    listed = runner(
        [
            "gh",
            "pr",
            "list",
            "--head",
            HEAD_BRANCH,
            "--base",
            BASE_BRANCH,
            "--json",
            "number,url,state,title,headRefName,baseRefName",
        ]
    )
    if listed.returncode != 0:
        return {
            **_manual("manual_required", "gh_pr_list_failed"),
            "ghCliAvailable": True,
            "ghAuthenticated": True,
            "ghPrListStderr": listed.stderr.strip(),
        }

    try:
        prs = json.loads(listed.stdout or "[]")
    except json.JSONDecodeError as error:
        return {
            **_manual("manual_required", "gh_pr_list_json_invalid"),
            "ghCliAvailable": True,
            "ghAuthenticated": True,
            "jsonError": str(error),
        }

    if prs:
        return {
            "ok": True,
            "base": BASE_BRANCH,
            "head": HEAD_BRANCH,
            "ghCliAvailable": True,
            "ghAuthenticated": True,
            "prExists": True,
            "prCreated": False,
            "status": "pr_exists",
            "manualRequired": False,
            "prs": prs,
        }

    if not create_if_missing:
        return {
            **_manual("manual_required", "pr_missing_create_disabled"),
            "ghCliAvailable": True,
            "ghAuthenticated": True,
        }

    created = runner(
        [
            "gh",
            "pr",
            "create",
            "--base",
            BASE_BRANCH,
            "--head",
            HEAD_BRANCH,
            "--title",
            PR_TITLE,
            "--body-file",
            str(PR_BODY_FILE),
        ]
    )
    if created.returncode != 0:
        return {
            **_manual("manual_required", "gh_pr_create_failed"),
            "ghCliAvailable": True,
            "ghAuthenticated": True,
            "ghPrCreateStderr": created.stderr.strip(),
        }

    return {
        "ok": True,
        "base": BASE_BRANCH,
        "head": HEAD_BRANCH,
        "ghCliAvailable": True,
        "ghAuthenticated": True,
        "prExists": True,
        "prCreated": True,
        "status": "pr_created",
        "manualRequired": False,
        "url": created.stdout.strip(),
    }


def main() -> int:
    report = inspect_pr_status()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
