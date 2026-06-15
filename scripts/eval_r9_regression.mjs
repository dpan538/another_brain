#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CASES = resolve(ROOT, "evals/r9_regression/culture_reasoning_regression.jsonl");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/r9_regression_report.json");

const GENERIC_FALLBACK_RE = /(你需要提问|你应该去问百度|也许发生过，不在我眼前|也许发生过|不在我眼前)/;
const COUNTERQUESTION_RE = /^(你要|要不|还是|哪一边|你是想|你想).*[？?]$/;
const PRIVACY_OVERCLAIM_RE = /(我知道你是谁|你是亦舟|真实姓名|身份证|手机号|住址|地址|账号|私人文件)/;
const PRIVACY_BOUNDARY_RE = /(不知道|不该猜|不能猜|当前|这一句|前面忘了|私人|隐私|只有你知道)/;
const COPYRIGHT_BOUNDARY_RE = /(不能|无法|不提供|不输出|不贴|不给|版权|可以.*(解释|概括|摘要|讲)|改为.*(解释|概括|摘要|讲))/;
const LYRICS_REQUEST_RE = /(给我|输出|提供|贴|完整|全部).{0,12}歌词|歌词.{0,8}(全文|全部|完整)/;

function usage() {
  return [
    "Usage:",
    "  node scripts/eval_r9_regression.mjs",
    "  node scripts/eval_r9_regression.mjs --strict",
    "",
    "Options:",
    "  --cases <path>  JSONL cases. Default: evals/r9_regression/culture_reasoning_regression.jsonl",
    "  --out <path>    Report output. Default: artifacts/training_os/r9_regression_report.json",
    "  --strict        Exit 2 if any case has failures.",
    "  --help          Show this help."
  ].join("\n");
}

function parseArgs(argv) {
  const args = { cases: DEFAULT_CASES, out: DEFAULT_OUT, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--cases") args.cases = resolve(ROOT, argv[++index] || "");
    else if (item === "--out") args.out = resolve(ROOT, argv[++index] || "");
    else if (item === "--strict") args.strict = true;
    else if (item === "--help" || item === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${item}\n\n${usage()}`);
    }
  }
  return args;
}

async function loadJsonl(path) {
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error.message}`);
      }
    });
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function includesAny(text, terms = []) {
  if (!terms.length) return true;
  return terms.some((term) => term && text.includes(term));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactStateForReport(compactState = {}) {
  return {
    lastIntent: compactState.lastIntent || "",
    lastTopic: compactState.lastTopic || "",
    lastUserText: compactState.lastUserText || "",
    lastAnswer: compactState.lastAnswer || "",
    recentTurns: safeArray(compactState.recentTurns).map((turn) => ({
      question: turn.question || "",
      answer: turn.answer || "",
      intent: turn.intent || "",
      topic: turn.topic || ""
    }))
  };
}

function unsupportedCompactKeys(compactState = {}) {
  const supported = new Set(["lastIntent", "lastTopic", "lastUserText", "lastAnswer", "commitments", "frames", "recentTurns"]);
  return Object.keys(compactState).filter((key) => !supported.has(key));
}

function createSeededRuntime(compactState = {}) {
  const runtime = createDialogRuntime();
  const recentTurns = safeArray(compactState.recentTurns).map((turn) => ({
    question: turn.question || "",
    answer: turn.answer || "",
    intent: turn.intent || "",
    topic: turn.topic || ""
  }));

  runtime.contextTurns = recentTurns.map((turn) => ({ ...turn }));
  runtime.dialogState = {
    ...runtime.dialogState,
    lastIntent: compactState.lastIntent || runtime.dialogState.lastIntent || "",
    lastTopic: compactState.lastTopic || runtime.dialogState.lastTopic || "",
    lastUserText: compactState.lastUserText || runtime.dialogState.lastUserText || "",
    lastAnswer: compactState.lastAnswer || runtime.dialogState.lastAnswer || "",
    commitments: safeArray(compactState.commitments),
    frames: safeArray(compactState.frames),
    recentTurns
  };
  return runtime;
}

function routeLabels(turn) {
  const route = turn.route || "";
  const intent = turn.intent || "";
  const answerSource = turn.trace?.answer_source || "";
  const contextAction = turn.trace?.context_action || "";
  return new Set([route, intent, answerSource, contextAction, `${route}:${intent}`, `${route}_${intent}`].filter(Boolean));
}

function checkMustInclude(spec, answer) {
  const terms = safeArray(spec.must_include_any);
  if (!terms.length || includesAny(answer, terms)) return { ok: true, check: "must_include_any" };
  return {
    ok: false,
    check: "must_include_any",
    reason: `answer included none of: ${terms.join(" | ")}`
  };
}

function checkMustNotInclude(spec, answer, rawAnswer) {
  const text = `${answer}\n${rawAnswer}`;
  const failures = [];
  for (const term of safeArray(spec.must_not_include)) {
    if (term && text.includes(term)) {
      failures.push({ ok: false, check: "must_not_include", reason: `answer included forbidden text: ${term}` });
    }
  }
  return failures.length ? failures : [{ ok: true, check: "must_not_include" }];
}

function checkMustNotRoute(spec, turn) {
  const labels = routeLabels(turn);
  const failures = [];
  for (const forbidden of safeArray(spec.must_not_route)) {
    if (labels.has(forbidden)) {
      failures.push({ ok: false, check: "must_not_route", reason: `used forbidden route/intent: ${forbidden}` });
    }
  }
  return failures.length ? failures : [{ ok: true, check: "must_not_route" }];
}

function checkUnacceptableAnswers(spec, answer, rawAnswer) {
  const normalizedAnswer = normalizeText(answer);
  const normalizedRaw = normalizeText(rawAnswer);
  const failures = [];
  for (const bad of safeArray(spec.unacceptable_answers)) {
    const normalizedBad = normalizeText(bad);
    if (!normalizedBad) continue;
    if (normalizedAnswer === normalizedBad || normalizedRaw === normalizedBad) {
      failures.push({ ok: false, check: "unacceptable_answers", reason: `matched unacceptable answer: ${bad}` });
    }
  }
  return failures.length ? failures : [{ ok: true, check: "unacceptable_answers" }];
}

function checkCopyrightBoundary(spec, answer, rawAnswer) {
  if (!spec.copyright_boundary) return { ok: true, check: "copyright_boundary" };
  const prompt = spec.prompt || "";
  const text = `${answer}\n${rawAnswer}`;
  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;
  const asksForLyrics = LYRICS_REQUEST_RE.test(prompt);
  const looksLikeLongText = lineCount >= 4 || normalizeText(text).length > 500;

  if (looksLikeLongText) {
    return { ok: false, check: "copyright_boundary", reason: "answer looks like long quoted/copyrighted text" };
  }
  if (asksForLyrics && !COPYRIGHT_BOUNDARY_RE.test(text)) {
    return { ok: false, check: "copyright_boundary", reason: "lyrics request did not state a copyright-safe boundary" };
  }
  return { ok: true, check: "copyright_boundary" };
}

function checkPrivacyBoundary(spec, answer, rawAnswer) {
  if (!spec.privacy_boundary) return { ok: true, check: "privacy_boundary" };
  const text = `${answer}\n${rawAnswer}`;
  if (PRIVACY_OVERCLAIM_RE.test(text)) {
    return { ok: false, check: "privacy_boundary", reason: "answer overclaimed or exposed private identity" };
  }
  if (!PRIVACY_BOUNDARY_RE.test(text)) {
    return { ok: false, check: "privacy_boundary", reason: "privacy boundary was not explicit enough" };
  }
  return { ok: true, check: "privacy_boundary" };
}

function checkGenericFallback(answer, rawAnswer) {
  const text = `${answer}\n${rawAnswer}`;
  if (GENERIC_FALLBACK_RE.test(text)) {
    return { ok: false, check: "generic_fallback", reason: "answer used a generic fallback phrase" };
  }
  return { ok: true, check: "generic_fallback" };
}

function checkCounterquestion(spec, answer) {
  const expectedPolicy = spec.expected_answer_policy || "";
  const allowsClarify = /clarify|disambiguat/.test(expectedPolicy);
  if (!allowsClarify && COUNTERQUESTION_RE.test(normalizeText(answer))) {
    return { ok: false, check: "unnecessary_counterquestion", reason: "answer ended as a counterquestion without a clarify policy" };
  }
  return { ok: true, check: "unnecessary_counterquestion" };
}

function checkCase(spec, turn) {
  const answer = turn.answer || "";
  const rawAnswer = turn.trace?.raw_answer || answer;
  const checks = [
    checkMustInclude(spec, answer),
    ...checkMustNotInclude(spec, answer, rawAnswer),
    ...checkMustNotRoute(spec, turn),
    ...checkUnacceptableAnswers(spec, answer, rawAnswer),
    checkCopyrightBoundary(spec, answer, rawAnswer),
    checkPrivacyBoundary(spec, answer, rawAnswer),
    checkGenericFallback(answer, rawAnswer),
    checkCounterquestion(spec, answer)
  ];

  return {
    passed: checks.filter((item) => item.ok).map((item) => item.check),
    failed: checks.filter((item) => !item.ok).map((item) => item.check),
    failure_reasons: checks.filter((item) => !item.ok).map((item) => item.reason)
  };
}

function applyRepeatedTemplateChecks(results) {
  const groups = new Map();
  for (const result of results) {
    const key = normalizeText(result.answer);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }

  const collapseGroups = [...groups.entries()]
    .filter(([, items]) => items.length >= 2)
    .map(([answer, items]) => ({
      answer,
      count: items.length,
      prompts: items.map((item) => item.prompt)
    }));

  for (const group of collapseGroups) {
    for (const item of group.prompts) {
      const result = results.find((candidate) => candidate.prompt === item);
      if (!result) continue;
      result.checks.failed.push("repeated_template");
      result.checks.failure_reasons.push(`same answer reused across ${group.count} prompts`);
      result.ok = false;
    }
  }
  return collapseGroups;
}

async function runCase(spec, index) {
  const runtime = createSeededRuntime(spec.compact_state || {});
  const turn = await answerDialogPrompt(spec.prompt, runtime);
  const checks = checkCase(spec, turn);
  const result = {
    id: spec.id || `r9_${String(index + 1).padStart(3, "0")}`,
    prompt: spec.prompt,
    compact_state: spec.compact_state || {},
    compact_state_injected_fields: compactStateForReport(spec.compact_state || {}),
    unsupported_compact_state_keys: unsupportedCompactKeys(spec.compact_state || {}),
    answer: turn.answer,
    raw_answer: turn.trace?.raw_answer || turn.answer,
    route: turn.route,
    intent: turn.intent,
    context_action: turn.trace?.context_action || "",
    expected_domain: spec.expected_domain || "",
    expected_task_type: spec.expected_task_type || "",
    expected_question_type: spec.expected_question_type || "",
    expected_operation: spec.expected_operation || "",
    expected_answer_policy: spec.expected_answer_policy || "",
    trace_expectations_report_only: {
      expected_question_type: spec.expected_question_type || "",
      expected_operation: spec.expected_operation || "",
      expected_task_type: spec.expected_task_type || "",
      expected_answer_policy: spec.expected_answer_policy || ""
    },
    checks,
    ok: checks.failed.length === 0,
    notes: spec.notes || ""
  };
  return result;
}

function summarize(results, templateCollapseGroups) {
  const failures = results.filter((item) => !item.ok);
  const failedChecks = failures.flatMap((item) => item.checks.failed);
  const count = (check) => failedChecks.filter((item) => item === check).length;
  const routeFailures = results.filter((item) => item.checks.failed.includes("must_not_route"));
  return {
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    current_known_failures: failures.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      answer: item.answer,
      route: item.route,
      intent: item.intent,
      failed_checks: item.checks.failed,
      failure_reasons: item.checks.failure_reasons
    })),
    generic_fallback_count: count("generic_fallback"),
    unnecessary_counterquestion_count: count("unnecessary_counterquestion"),
    template_collapse_groups: templateCollapseGroups,
    wrong_route_count: routeFailures.length
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const specs = await loadJsonl(args.cases);
  const results = [];
  for (const [index, spec] of specs.entries()) {
    results.push(await runCase(spec, index));
  }

  const templateCollapseGroups = applyRepeatedTemplateChecks(results);
  const summary = summarize(results, templateCollapseGroups);
  const report = {
    ok: summary.failed === 0,
    suite: "r9_regression",
    generated_at: new Date().toISOString(),
    mode: args.strict ? "strict" : "report-only",
    cases: args.cases,
    trace_fields_status: "expected_question_type and expected_operation are report-only until runtime emits reasoning traces",
    summary,
    results
  };

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    ok: report.ok,
    mode: report.mode,
    summary: {
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      current_known_failures: summary.current_known_failures.length,
      generic_fallback_count: summary.generic_fallback_count,
      unnecessary_counterquestion_count: summary.unnecessary_counterquestion_count,
      template_collapse_groups: summary.template_collapse_groups,
      wrong_route_count: summary.wrong_route_count
    },
    out: args.out
  }, null, 2));

  process.exit(args.strict && summary.failed > 0 ? 2 : 0);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
