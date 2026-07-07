#!/usr/bin/env python3
"""Read GitHub checks and Vercel preview status for the R28PR0 PR."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OWNER = "dpan538"
REPO = "another_brain"
HEAD = "r28pr0-final-preview-pr"
BASE = "main"
VERCEL_LOG_FIELDS_NEEDED = [
    "branch/SHA",
    "install command",
    "build command",
    "output directory",
    "root directory",
    "Node version",
    "first failing command",
    "exit code",
    "stack trace around first failure",
    "dashboard overrides",
    "env var errors",
]


def run(command: list[str], timeout: int = 120) -> dict[str, Any]:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=timeout)
    return {
        "command": command,
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
    }


def gh_ready() -> bool:
    return shutil.which("gh") is not None and run(["gh", "auth", "status"], timeout=60)["ok"]


def extract_preview_url(text: str) -> str:
    match = re.search(r"https://[^\s\"')]+vercel\.app[^\s\"')]*", text or "")
    return match.group(0) if match else ""


def summarize_rollup(items: list[dict[str, Any]]) -> dict[str, Any]:
    failing = []
    pending = []
    preview_url = ""
    for item in items:
        name = item.get("name") or item.get("context") or item.get("app", {}).get("name") or ""
        conclusion = item.get("conclusion") or item.get("state") or item.get("status") or ""
        details_url = item.get("detailsUrl") or item.get("details_url") or item.get("targetUrl") or item.get("target_url") or ""
        preview_url = preview_url or extract_preview_url(details_url)
        row = {"name": name, "conclusion": conclusion, "detailsUrl": details_url}
        if str(conclusion).lower() in {"failure", "failed", "error", "cancelled", "timed_out", "action_required"}:
            failing.append(row)
        elif str(conclusion).lower() in {"pending", "queued", "in_progress", "expected", ""}:
            pending.append(row)
    if failing:
        status = "failed"
    elif pending:
        status = "pending"
    elif items:
        status = "passed"
    else:
        status = "unavailable"
    return {"status": status, "failing": failing, "pending": pending, "preview_url": preview_url}


def gh_pr_status(pr: str) -> dict[str, Any]:
    view = run([
        "gh",
        "pr",
        "view",
        pr,
        "--json",
        "number,url,headRefName,baseRefName,state,mergeable,reviewDecision,statusCheckRollup",
    ])
    if not view["ok"]:
        return {"ok": False, "preview_status": "unavailable", "reason": view["stderr"] or view["stdout"]}
    data = json.loads(view["stdout"])
    rollup = data.get("statusCheckRollup") or []
    summary = summarize_rollup(rollup)
    checks = run(["gh", "pr", "checks", pr, "--json", "name,state,link,bucket,description"], timeout=120)
    checks_rows = []
    if checks["ok"] and checks["stdout"]:
        try:
            checks_rows = json.loads(checks["stdout"])
            summary = summarize_rollup([
                {"name": row.get("name"), "conclusion": row.get("state") or row.get("bucket"), "detailsUrl": row.get("link")}
                for row in checks_rows
            ] or rollup)
        except json.JSONDecodeError:
            checks_rows = []
    return {
        "ok": True,
        "provider": "gh",
        "pr": data,
        "checks": checks_rows,
        "preview_status": summary["status"],
        "preview_url": summary["preview_url"],
        "failing_checks": summary["failing"],
        "pending_checks": summary["pending"],
        "vercel_logs_needed": VERCEL_LOG_FIELDS_NEEDED if summary["status"] in {"failed", "unavailable"} else [],
    }


def github_api(path: str, token: str) -> Any:
    request = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "another-brain-r28pr0",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def rest_pr_status(token: str) -> dict[str, Any]:
    query = urllib.parse.urlencode({"head": f"{OWNER}:{HEAD}", "base": BASE, "state": "open"})
    prs = github_api(f"/repos/{OWNER}/{REPO}/pulls?{query}", token)
    if not prs:
        return {"ok": False, "preview_status": "unavailable", "reason": "open_pr_not_found"}
    pr = prs[0]
    sha = pr["head"]["sha"]
    check_runs = github_api(f"/repos/{OWNER}/{REPO}/commits/{sha}/check-runs", token).get("check_runs", [])
    statuses = github_api(f"/repos/{OWNER}/{REPO}/commits/{sha}/statuses", token)
    rows = [
        {"name": item.get("name"), "conclusion": item.get("conclusion") or item.get("status"), "detailsUrl": item.get("details_url")}
        for item in check_runs
    ] + [
        {"name": item.get("context"), "conclusion": item.get("state"), "detailsUrl": item.get("target_url")}
        for item in statuses
    ]
    summary = summarize_rollup(rows)
    return {
        "ok": True,
        "provider": "github_rest",
        "pr": {"number": pr.get("number"), "url": pr.get("html_url"), "head_sha": sha},
        "preview_status": summary["status"],
        "preview_url": summary["preview_url"],
        "failing_checks": summary["failing"],
        "pending_checks": summary["pending"],
        "vercel_logs_needed": VERCEL_LOG_FIELDS_NEEDED if summary["status"] in {"failed", "unavailable"} else [],
    }


def preview_status(pr: str = "", *, poll_seconds: int = 0, interval_seconds: int = 30) -> dict[str, Any]:
    deadline = time.time() + max(0, poll_seconds)
    last: dict[str, Any] = {}
    while True:
        if gh_ready():
            last = gh_pr_status(pr or HEAD)
        elif os.environ.get("GITHUB_TOKEN"):
            last = rest_pr_status(os.environ["GITHUB_TOKEN"])
        else:
            return {
                "ok": False,
                "provider": "none",
                "preview_status": "unavailable",
                "reason": "no_gh_auth_or_github_token",
                "vercel_logs_needed": VERCEL_LOG_FIELDS_NEEDED,
            }
        if last.get("preview_status") != "pending" or time.time() >= deadline:
            return last
        time.sleep(max(1, interval_seconds))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pr", default="")
    parser.add_argument("--poll-seconds", type=int, default=600)
    parser.add_argument("--interval-seconds", type=int, default=30)
    args = parser.parse_args()
    report = preview_status(args.pr, poll_seconds=args.poll_seconds, interval_seconds=args.interval_seconds)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report.get("preview_status") in {"passed", "pending", "unavailable"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
