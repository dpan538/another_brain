#!/usr/bin/env python3
"""Detect overuse of the high-friction unknown fallback."""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "training_os" / "fallback_overuse_report.json"
HIGH_FRICTION_FALLBACK = "也许发生过，不在我眼前。"

PROTECTED_CASES = [
    ("help_start", "我该怎么开始？"),
    ("help_features", "你有什么功能？"),
    ("help_examples", "可以问什么？"),
    ("help_project", "这个网页是什么？"),
    ("help_privacy_single", "隐私安全吗？"),
    ("help_privacy_combined", "会上传吗？隐私安全吗？"),
    ("help_memory", "你会记住我吗？"),
    ("help_limits", "你不能做什么？"),
    ("identity_self", "你是谁？"),
    ("identity_alias", "你是鳄鱼吗？"),
    ("identity_copy_refusal", "你是谁的复制体？"),
    ("conversation_start", "如果我不提问，你可以说话吗？"),
    ("creative_photo", "你怎么看失败的照片？"),
    ("comfort_check", "你是在安慰我吗？"),
    ("rewrite_short", "把这句话缩短：这张照片有点糊，但是颜色很好看。"),
]

ALLOWED_UNKNOWN_CASES = [
    ("unknown_fact", "一个完全陌生的事实发生过吗？"),
    ("unknown_name", "阿伏咕噜是什么？"),
    ("unknown_hearsay", "听说阿伏咕噜出现过，是真的吗？"),
]


def run_runtime(cases: list[tuple[str, str]]) -> list[dict[str, str]]:
    payload = [{"id": case_id, "prompt": prompt} for case_id, prompt in cases]
    script = f"""
import {{
  createDialogState,
  detectIntent,
  directAnswerForIntent,
  fallbackForIntent
}} from './web/dialog_rules.js?v=test';
import {{ sanitizeSurfaceIdentity }} from './web/surface_identity.js?v=test';

const cases = {json.dumps(payload, ensure_ascii=False)};
const results = [];
let state = createDialogState();
for (const item of cases) {{
  const intent = detectIntent(item.prompt, state);
  const answer = sanitizeSurfaceIdentity(
    directAnswerForIntent(intent, item.prompt, state) || fallbackForIntent(intent, item.prompt),
    item.prompt
  );
  results.push({{ ...item, intent, answer }});
}}
console.log(JSON.stringify(results));
"""
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", dir=ROOT, delete=False, encoding="utf-8") as handle:
        handle.write(script)
        temp_path = Path(handle.name)
    try:
        proc = subprocess.run(["node", str(temp_path.name)], cwd=ROOT, text=True, capture_output=True, check=False)
    finally:
        temp_path.unlink(missing_ok=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    return json.loads(proc.stdout)


def main() -> int:
    protected = run_runtime(PROTECTED_CASES)
    allowed_unknown = run_runtime(ALLOWED_UNKNOWN_CASES)

    protected_failures = [
        item for item in protected if item["answer"].strip() == HIGH_FRICTION_FALLBACK
    ]
    unknown_hits = [
        item for item in allowed_unknown if item["answer"].strip() == HIGH_FRICTION_FALLBACK
    ]

    report = {
        "ok": not protected_failures,
        "summary": {
            "protectedCases": len(protected),
            "protectedFallbackHits": len(protected_failures),
            "allowedUnknownCases": len(allowed_unknown),
            "allowedUnknownFallbackHits": len(unknown_hits),
        },
        "protected": protected,
        "allowedUnknown": allowed_unknown,
        "failures": protected_failures,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
