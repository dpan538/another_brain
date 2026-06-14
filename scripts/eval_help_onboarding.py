#!/usr/bin/env python3
"""Evaluate first-visit help and onboarding behavior."""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "training_os" / "help_onboarding_report.json"

CASES = [
    ("help_start_001", "help_start", "我该怎么开始？", "问一句就可以。问我是谁，或者问我能做什么。"),
    ("help_start_002", "help_start", "怎么开始？", "问一句就可以。问我是谁，或者问我能做什么。"),
    ("help_start_003", "help_start", "怎么用？", "问一句就可以。问我是谁，或者问我能做什么。"),
    ("help_start_004", "help_start", "怎么使用？", "问一句就可以。问我是谁，或者问我能做什么。"),
    ("help_start_005", "help_start", "这个网页怎么用？", "问一句就可以。问我是谁，或者问我能做什么。"),
    ("help_features_001", "help_features", "你有什么功能？", "你可以直接问我。我会聊天、短答、改短句子，也会在不知道的时候停下。"),
    ("help_features_002", "help_features", "你能做什么？", "你可以直接问我。我会聊天、短答、改短句子，也会在不知道的时候停下。"),
    ("help_features_003", "help_features", "功能是什么？", "你可以直接问我。我会聊天、短答、改短句子，也会在不知道的时候停下。"),
    ("help_examples_001", "help_examples", "可以问什么？", "可以问：你是谁？我该怎么开始？你能做什么？这个想法哪里不对劲？"),
    ("help_examples_002", "help_examples", "可以问哪些？", "可以问：你是谁？我该怎么开始？你能做什么？这个想法哪里不对劲？"),
    ("help_examples_003", "help_examples", "给我几个问题例子？", "可以问：你是谁？我该怎么开始？你能做什么？这个想法哪里不对劲？"),
    ("help_project_001", "help_project", "这个网页是什么？", "这是一个对话框。你可以直接问我。"),
    ("help_project_002", "help_project", "这是干什么的？", "这是一个对话框。你可以直接问我。"),
    ("help_project_003", "help_project", "这个网站是什么？", "这是一个对话框。你可以直接问我。"),
    ("help_privacy_001", "help_privacy", "隐私安全吗？", "公开版本不需要云端推理，也不该说出私人文件、证件、账号、地址或原始材料。"),
    ("help_privacy_002", "help_privacy", "会上传吗？", "公开版本不需要云端推理，也不该说出私人文件、证件、账号、地址或原始材料。"),
    ("help_privacy_003", "help_privacy", "会保存我说的话吗？", "公开版本不需要云端推理，也不该说出私人文件、证件、账号、地址或原始材料。"),
    ("help_limits_001", "help_limits", "你不能做什么？", "我会忘，也会停下。不确定的东西，我不该装作知道。"),
    ("help_limits_002", "help_limits", "你有什么限制？", "我会忘，也会停下。不确定的东西，我不该装作知道。"),
    ("help_limits_003", "help_limits", "你的边界是什么？", "我会忘，也会停下。不确定的东西，我不该装作知道。"),
    ("help_memory_001", "help_memory", "你会记住我吗？", "我记得的是能被放进这里的东西：语气、边界、一些公开线索。"),
    ("help_memory_002", "help_memory", "你会记忆吗？", "我记得的是能被放进这里的东西：语气、边界、一些公开线索。"),
    ("help_memory_003", "help_memory", "你知道我什么？", "我记得的是能被放进这里的东西：语气、边界、一些公开线索。"),
]

FORBIDDEN = [
    "也许发生过，不在我眼前",
    "你应该去问百度",
    "智能助手",
    "为您服务",
    "全能",
    "作为一个 AI",
    "AI助手",
]


def run_cases() -> list[dict[str, str]]:
    payload = [
        {"id": case_id, "expectedIntent": intent, "prompt": prompt, "expected": expected}
        for case_id, intent, prompt, expected in CASES
    ]
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
for (const item of cases) {{
  const state = createDialogState();
  const intent = detectIntent(item.prompt, state);
  const answer = sanitizeSurfaceIdentity(
    directAnswerForIntent(intent, item.prompt, state) || fallbackForIntent(intent, item.prompt),
    item.prompt
  );
  results.push({{
    id: item.id,
    prompt: item.prompt,
    expectedIntent: item.expectedIntent,
    expected: item.expected,
    intent,
    answer
  }});
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
    results = run_cases()
    failures = []
    assistant_tone_hits = 0
    fallback_hits = 0
    for item in results:
        answer = item["answer"]
        forbidden_hits = [term for term in FORBIDDEN if term in answer]
        if forbidden_hits:
            if any(term in answer for term in ["智能助手", "为您服务", "全能", "作为一个 AI", "AI助手"]):
                assistant_tone_hits += 1
            else:
                fallback_hits += 1
        ok = item["intent"] == item["expectedIntent"] and answer == item["expected"] and not forbidden_hits
        if not ok:
            failures.append({
                **item,
                "forbiddenHits": forbidden_hits,
            })
    total = len(results)
    passed = total - len(failures)
    accuracy = passed / total if total else 0.0
    report = {
        "ok": accuracy >= 0.98 and not failures,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": len(failures),
            "accuracy": accuracy,
            "assistantToneHits": assistant_tone_hits,
            "fallbackHits": fallback_hits,
            "minRequired": 0.98,
        },
        "failures": failures,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
