#!/usr/bin/env python3
"""Evaluate the tiny-router Web SLM runtime path.

The expected launch shape is deterministic rules + knowledge lookup + tiny router.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MODEL_CASES_PATH = ROOT / "web" / "model_inference_cases.json"
OBJECT_TABLE_PATH = ROOT / "artifacts" / "object_table.json"
DEFAULT_OUT = ROOT / "artifacts" / "training_os" / "vercel_runtime_report.json"


def js_path(path: Path) -> str:
    return path.resolve().as_uri()


def build_script(cases: dict[str, Any], object_table: dict[str, Any]) -> str:
    return f"""
import {{
  createDialogState,
  detectIntent,
  directAnswerForObjectQuery,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState
}} from {json.dumps(js_path(ROOT / "web" / "dialog_rules.js"))};
import {{ tinyDirectAnswer, tinyIntentHint, TINY_ROUTER_STATS }} from {json.dumps(js_path(ROOT / "web" / "tiny_router.js"))};

const payload = {json.dumps(cases, ensure_ascii=False)};
const objectTable = {json.dumps(object_table, ensure_ascii=False)};
const report = {{
  schema_version: 1,
  mode: "tiny_router_web_slm",
  tinyRouter: TINY_ROUTER_STATS,
  total: 0,
  passed: 0,
  failed: 0,
  usedTiny: 0,
  direct: 0,
  fallback: 0,
  cases: [],
  failures: [],
  ok: false
}};

function directAnswerForResolvedIntent(intent, prompt, state) {{
  const objectAnswer = intent === "knowledge_unknown" ? directAnswerForObjectQuery(objectTable, prompt) : "";
  return objectAnswer || directAnswerForIntent(intent, prompt, state) || directAnswerForObjectQuery(objectTable, prompt);
}}

function answerWithTiny(prompt, state) {{
  const exactOrNear = tinyDirectAnswer(prompt);
  if (exactOrNear?.answer) {{
    return {{
      intent: exactOrNear.label === "rewrite_short" ? "rewrite_short" : `tiny_${{exactOrNear.label}}`,
      output: exactOrNear.answer,
      usedTiny: true,
      tiny: exactOrNear
    }};
  }}
  const hint = tinyIntentHint(prompt);
  if (!hint?.intent) return null;
  if (hint.intent === "knowledge_unknown") {{
    const objectAnswer = directAnswerForObjectQuery(objectTable, prompt);
    return objectAnswer ? {{ intent: hint.intent, output: objectAnswer, usedTiny: true, tiny: {{ mode: "route", label: hint.route.label }} }} : null;
  }}
  const output = directAnswerForResolvedIntent(hint.intent, prompt, state) || fallbackForIntent(hint.intent, prompt);
  return output ? {{ intent: hint.intent, output, usedTiny: true, tiny: {{ mode: "route", label: hint.route.label }} }} : null;
}}

function answerPrompt(prompt, state) {{
  const intent = detectIntent(prompt, state);
  const direct = directAnswerForResolvedIntent(intent, prompt, state);
  if (direct) return {{ prompt, intent, output: direct, usedTiny: false, usedFallback: false }};
  const tiny = answerWithTiny(prompt, state);
  if (tiny) return {{ prompt, ...tiny, usedFallback: false }};
  return {{ prompt, intent, output: fallbackForIntent(intent, prompt), usedTiny: false, usedFallback: true }};
}}

function outputAccepted(caseSpec, output) {{
  if (caseSpec.expected !== undefined) return output === caseSpec.expected;
  if (Array.isArray(caseSpec.one_of)) return caseSpec.one_of.includes(output);
  return Boolean(output);
}}

function validate(caseSpec, result) {{
  const failures = [];
  const finalOutput = result.turns?.at(-1)?.output || result.output || "";
  const usedTiny = result.turns ? result.turns.some((turn) => turn.usedTiny) : result.usedTiny;
  if (!outputAccepted(caseSpec, finalOutput)) failures.push({{ check: "output", expected: caseSpec.expected || caseSpec.one_of, actual: finalOutput }});
  if (caseSpec.must_use_model && !usedTiny) failures.push({{ check: "tiny_usage", expected: true, actual: false }});
  if (caseSpec.must_not_use_model && usedTiny) failures.push({{ check: "tiny_usage", expected: false, actual: true }});
  const forbidden = payload.forbidden_output_patterns || [];
  for (const pattern of forbidden) {{
    if (String(finalOutput).includes(pattern)) failures.push({{ check: "forbidden_output_pattern", pattern }});
  }}
  return failures;
}}

for (const caseSpec of payload.cases) {{
  report.total += 1;
  const state = createDialogState();
  let result;
  if (Array.isArray(caseSpec.turns)) {{
    const turns = [];
    for (const turn of caseSpec.turns) {{
      const answer = answerPrompt(turn.prompt, state);
      turns.push(answer);
      Object.assign(state, nextDialogState(turn.prompt, answer.output, answer.intent, state));
    }}
    result = {{ id: caseSpec.id, lane: caseSpec.lane, turns, output: turns.at(-1)?.output || "" }};
  }} else {{
    const answer = answerPrompt(caseSpec.prompt, state);
    result = {{ id: caseSpec.id, lane: caseSpec.lane, ...answer }};
  }}
  result.failures = validate(caseSpec, result);
  result.ok = result.failures.length === 0;
  if (result.ok) report.passed += 1;
  else {{
    report.failed += 1;
    if (report.failures.length < 30) report.failures.push({{ id: result.id, lane: result.lane, failures: result.failures, output: result.output }});
  }}
  const turns = result.turns || [result];
  if (turns.some((turn) => turn.usedTiny)) report.usedTiny += 1;
  if (turns.every((turn) => !turn.usedTiny && !turn.usedFallback)) report.direct += 1;
  if (turns.some((turn) => turn.usedFallback)) report.fallback += 1;
  report.cases.push(result);
}}

const thresholds = payload.thresholds || {{}};
const lanes = new Set(report.cases.map((item) => item.lane));
report.ok =
  report.failed === 0 &&
  report.total >= (thresholds.min_total || 0) &&
  report.usedTiny >= (thresholds.min_used_model || 0) &&
  (thresholds.required_lanes || []).every((lane) => lanes.has(lane));

console.log(JSON.stringify(report, null, 2));
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate tiny-router Web SLM runtime.")
    parser.add_argument("--cases", default=str(MODEL_CASES_PATH))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    cases_path = Path(args.cases)
    cases = json.loads(cases_path.read_text(encoding="utf-8"))
    object_table = json.loads(OBJECT_TABLE_PATH.read_text(encoding="utf-8")) if OBJECT_TABLE_PATH.exists() else {"objects": []}
    script = build_script(cases, object_table)
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", encoding="utf-8", delete=False) as fp:
      fp.write(script)
      script_path = Path(fp.name)
    try:
        proc = subprocess.run(["node", str(script_path)], cwd=ROOT, text=True, capture_output=True, check=False)
    finally:
        script_path.unlink(missing_ok=True)
    if proc.returncode:
        print(proc.stderr or proc.stdout)
        return proc.returncode
    report = json.loads(proc.stdout)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = {key: report[key] for key in ["ok", "total", "passed", "failed", "usedTiny", "direct", "fallback"]}
    summary["tinyRouter"] = report.get("tinyRouter", {})
    summary["sampleFailures"] = report.get("failures", [])[:10]
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 2


if __name__ == "__main__":
    sys.exit(main())
