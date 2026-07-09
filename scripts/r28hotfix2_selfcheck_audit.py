#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "artifacts" / "r28hotfix2" / "reports" / "selfcheck_audit.json"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def main() -> int:
    app = read("web/another_brain_chat/app.js")
    runtime = read("web/another_brain_chat/browser_runtime.js")
    html = read("web/another_brain_chat/index.html")
    worker = read("web/another_brain_chat/self_check_worker.js")
    checks = {
        "button_bound": 'on(modelSelfCheckButton, "click"' in app,
        "stop_button_bound": 'on(modelSelfCheckStopButton, "click"' in app,
        "boot_uses_quick_check": "runtime.quickSelfCheckModelPath" in app and "runtime.selfCheckModelPath();" not in app,
        "deep_check_uses_worker": 'new Worker(new URL("./self_check_worker.js?v=r28hotfix2-nonblocking-selfcheck"' in runtime
        or 'new Worker(new URL("./self_check_worker.js?v=r28hotfix3-q4-asset-path-fix"' in runtime,
        "worker_runs_q4_smoke": "generateStaticQ4Draft" in worker and "q4_smoke" in worker,
        "timeout_present": "self_check_timeout" in runtime and "timeoutMs: 8000" in app,
        "abort_present": "AbortController" in app and "cancelSelfCheck" in runtime,
        "progress_present": "onProgress" in app and "checking_deep" in runtime,
        "ui_not_locked": "setDisabled(input" not in app and "setDisabled(form" not in app,
        "no_120s_selfcheck": "120000" not in runtime,
        "single_active_check": "activeSelfCheckController" in app,
        "status_recovers": "finally" in app and "setDisabled(modelSelfCheckButton, false)" in app,
        "fatal_null_guard": "function on(node, eventName, handler, options)" in app,
        "identity_route": "identity_boundary" in runtime and "我是鳄鱼" in runtime,
        "visible_stop_button": "model-self-check-stop-button" in html,
    }
    report = {
        "ok": all(checks.values()),
        "checks": checks,
        "failures": [name for name, ok in checks.items() if not ok],
        "output": "artifacts/r28hotfix2/reports/selfcheck_audit.json",
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
