#!/usr/bin/env python3
"""Create or confirm the R28PR0 final preview PR.

Preferred path is gh CLI, then GitHub REST with GITHUB_TOKEN, then explicit
manual_required output. Tokens are never printed or written.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OWNER = "dpan538"
REPO = "another_brain"
BASE = "main"
HEAD = "r28pr0-final-preview-pr"
TITLE = "R28PR0 final preview candidate"
BODY_FILE = ROOT / "docs" / "r28" / "R28PR0_FINAL_PREVIEW_PR.md"
MANUAL_URL = f"https://github.com/{OWNER}/{REPO}/compare/{BASE}...{HEAD}?expand=1"


def run(command: list[str], *, timeout: int = 120) -> dict[str, Any]:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=timeout)
    return {
        "command": command,
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
    }


def gh_available_and_auth() -> bool:
    if shutil.which("gh") is None:
        return False
    return run(["gh", "auth", "status"], timeout=60)["ok"]


def gh_existing_pr() -> dict[str, Any] | None:
    result = run([
        "gh",
        "pr",
        "list",
        "--head",
        HEAD,
        "--base",
        BASE,
        "--state",
        "open",
        "--json",
        "number,url,headRefName,baseRefName,title",
    ])
    if not result["ok"]:
        return None
    rows = json.loads(result["stdout"] or "[]")
    return rows[0] if rows else None


def gh_create_pr() -> dict[str, Any]:
    result = run([
        "gh",
        "pr",
        "create",
        "--base",
        BASE,
        "--head",
        HEAD,
        "--title",
        TITLE,
        "--body-file",
        str(BODY_FILE),
    ])
    if not result["ok"]:
        return {"ok": False, "error": result["stderr"] or result["stdout"]}
    return {"ok": True, "url": result["stdout"].splitlines()[-1].strip()}


def github_request(method: str, path: str, *, token: str, body: dict[str, Any] | None = None) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.github.com{path}",
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "another-brain-r28pr0",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def rest_existing_pr(token: str) -> dict[str, Any] | None:
    query = urllib.parse.urlencode({
        "head": f"{OWNER}:{HEAD}",
        "base": BASE,
        "state": "open",
    })
    rows = github_request("GET", f"/repos/{OWNER}/{REPO}/pulls?{query}", token=token)
    return rows[0] if rows else None


def rest_create_pr(token: str) -> dict[str, Any]:
    body = BODY_FILE.read_text(encoding="utf-8")
    pr = github_request(
        "POST",
        f"/repos/{OWNER}/{REPO}/pulls",
        token=token,
        body={"title": TITLE, "head": HEAD, "base": BASE, "body": body},
    )
    return {"ok": True, "url": pr.get("html_url"), "number": pr.get("number")}


def build_manual_required_report(reason: str = "no_gh_auth_or_github_token") -> dict[str, Any]:
    return {
        "ok": False,
        "pr_status": "manual_required",
        "reason": reason,
        "manual_url": MANUAL_URL,
        "base": BASE,
        "head": HEAD,
        "title": TITLE,
        "must_not_claim_created": True,
    }


def write_manual_required_report(report: dict[str, Any], *, root: Path = ROOT) -> Path:
    out_dir = root / "artifacts" / "r28pr0" / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "PR_MANUAL_REQUIRED.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    return path


def try_copy_and_open_manual_url(url: str) -> dict[str, Any]:
    copied = False
    opened = False
    if shutil.which("pbcopy"):
        proc = subprocess.run(["pbcopy"], input=url, text=True, capture_output=True)
        copied = proc.returncode == 0
    if shutil.which("open"):
        proc = subprocess.run(["open", url], cwd=ROOT, text=True, capture_output=True)
        opened = proc.returncode == 0
    return {"copied_to_clipboard": copied, "opened": opened}


def create_or_confirm_pr(*, allow_side_effects: bool = True) -> dict[str, Any]:
    if not BODY_FILE.exists():
        return {"ok": False, "pr_status": "blocked", "reason": "body_file_missing", "body_file": str(BODY_FILE)}

    if gh_available_and_auth():
        existing = gh_existing_pr()
        if existing:
            return {"ok": True, "pr_status": "already_exists", "url": existing.get("url"), "number": existing.get("number"), "provider": "gh"}
        created = gh_create_pr()
        if created.get("ok"):
            return {"ok": True, "pr_status": "created", "url": created.get("url"), "provider": "gh"}
        return {"ok": False, "pr_status": "failed", "provider": "gh", "reason": created.get("error")}

    token = os.environ.get("GITHUB_TOKEN")
    if token:
        try:
            existing = rest_existing_pr(token)
            if existing:
                return {
                    "ok": True,
                    "pr_status": "already_exists",
                    "url": existing.get("html_url"),
                    "number": existing.get("number"),
                    "provider": "github_rest",
                }
            created = rest_create_pr(token)
            return {**created, "pr_status": "created", "provider": "github_rest"}
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            return {"ok": False, "pr_status": "failed", "provider": "github_rest", "reason": str(error)}

    report = build_manual_required_report()
    if allow_side_effects:
        path = write_manual_required_report(report)
        report["manual_report_path"] = str(path.relative_to(ROOT))
        report.update(try_copy_and_open_manual_url(MANUAL_URL))
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--no-side-effects", action="store_true")
    args = parser.parse_args()
    report = create_or_confirm_pr(allow_side_effects=not args.no_side_effects)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report.get("ok") else (3 if report.get("pr_status") == "manual_required" else 2)


if __name__ == "__main__":
    raise SystemExit(main())
