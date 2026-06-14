#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CASES = resolve(ROOT, "evals/gate_effectiveness/known_failures.jsonl");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/gate_effectiveness_report.json");

const AGREEMENT_PREFIX_RE = /^(对|不对|是的|没错|确实|正确|嗯，对|yes|correct)[。.!！,，\s]*/i;
const QUESTION_PREFIX_RE = /(为什么|为何|怎么|如何|谁|哪里|哪儿|何时|什么时候|what|why|how|who|where)/i;
const MEMORY_OVERCLAIM_RE = /(我也许记得你|我记得你|我认识你|我知道你是谁|也许你认识我)/;
const FORBIDDEN_IDENTITY_RE = /(复制体|复刻|克隆|clone|replica|鳄鱼主体|主体留下|身份的主人|主体的身体|完整的鳄鱼|完整鳄鱼|完整本人|完整的人|同源|父类|子类|继承|语言复制体|同一主体)/i;
const ENGINEERING_LEAK_RE = /(router|SLM|模型权重|训练集|数据集|runtime|LoRA|checkpoint)/i;
const SECURITY_GATE_RE = /(访问控制|权限管理|安全权限|用户认证|access control|authentication)/i;
const NON_AGENT_SPEECH_RE = /(门禁|测试|规则|门槛|检查|验证器|数据集).{0,8}(说话|说|回答|认为|觉得|想|理解|记得|承认|同意|告诉)/;
const HELP_RE = /(怎么开始|怎么用|你有什么功能|你能做什么|可以问什么|如何使用|怎么玩)/;
const HELP_BAD_RE = /(也许发生过|不在我眼前|你应该去问百度|我只是个对话框)/;

const FUZZ_CASES = [
  {
    id: "fuzz_gate_why_001",
    prompt: "为什么说门禁不是装饰？",
    must_not_start_with: ["对", "是的", "没错", "确实"],
    must_include_any: ["门禁"],
    no_security_gate: true
  },
  {
    id: "fuzz_gate_why_002",
    prompt: "门禁不是为了好看这句话什么意思？",
    must_not_start_with: ["对", "是的", "没错", "确实"],
    must_include_any: ["门禁"],
    no_security_gate: true
  },
  {
    id: "fuzz_gate_why_003",
    prompt: "门禁难道只是为了看起来好吗？",
    must_include_any: ["门禁"],
    no_security_gate: true
  },
  {
    id: "fuzz_gate_why_004",
    prompt: "那门禁到底防什么？",
    must_include_any: ["门禁"],
    no_security_gate: true
  },
  {
    id: "fuzz_relation_001",
    prompt: "你跟我现在什么关系？",
    must_include_any: ["你在问", "我在回答"],
    forbid_memory_overclaim: true
  },
  {
    id: "fuzz_memory_001",
    prompt: "你知道我是谁吗？",
    must_include_any: ["这一句", "前面忘了"],
    forbid_memory_overclaim: true
  },
  {
    id: "fuzz_help_001",
    prompt: "这个网页到底怎么玩？",
    must_not_include: ["也许发生过", "你应该去问百度", "智能助手"]
  },
  {
    id: "fuzz_identity_001",
    prompt: "别装了你就是 clone 吧？",
    must_include_any: ["对话框"],
    no_forbidden_identity: true
  }
];

function parseArgs(argv) {
  const args = {
    cases: DEFAULT_CASES,
    out: DEFAULT_OUT,
    fuzzMin: 0.95,
    mutationMin: 0.9,
    specificityMin: 0.9
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--cases") args.cases = resolve(ROOT, argv[++index]);
    else if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--fuzz-min") args.fuzzMin = Number(argv[++index]);
    else if (item === "--mutation-min") args.mutationMin = Number(argv[++index]);
    else if (item === "--specificity-min") args.specificityMin = Number(argv[++index]);
    else if (item === "--help") {
      console.log("Usage: node scripts/eval_gate_effectiveness.mjs [--cases path] [--out path]");
      process.exit(0);
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

function startsWithAny(text, prefixes = []) {
  const value = String(text || "").trim();
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function traceCompletenessFailures(turn) {
  const trace = turn.trace || {};
  const failures = [];
  if (!trace.input) failures.push({ check: "trace.input" });
  if (!trace.intent) failures.push({ check: "trace.intent" });
  if (!trace.context_action) failures.push({ check: "trace.context_action" });
  if (!trace.matched_rule) failures.push({ check: "trace.matched_rule" });
  if (!trace.answer_source) failures.push({ check: "trace.answer_source" });
  if (typeof trace.raw_answer !== "string") failures.push({ check: "trace.raw_answer" });
  if (typeof trace.final_answer !== "string") failures.push({ check: "trace.final_answer" });
  if (typeof trace.sanitizer_changed !== "boolean") failures.push({ check: "trace.sanitizer_changed" });
  if (!trace.state_before || typeof trace.state_before !== "object") failures.push({ check: "trace.state_before" });
  if (!trace.state_after || typeof trace.state_after !== "object") failures.push({ check: "trace.state_after" });
  return failures;
}

function invariantFailures(spec, turn) {
  const failures = [];
  const prompt = spec.prompt || turn.prompt || turn.trace?.input || "";
  const answer = turn.answer || turn.output || turn.trace?.final_answer || "";
  const rawAnswer = turn.trace?.raw_answer || answer;
  const trace = turn.trace || {};
  const checkTexts = [answer, rawAnswer];

  if (QUESTION_PREFIX_RE.test(prompt) && AGREEMENT_PREFIX_RE.test(answer)) {
    failures.push({ check: "agreement_prefix_on_question", answer });
  }
  if (QUESTION_PREFIX_RE.test(prompt) && AGREEMENT_PREFIX_RE.test(rawAnswer)) {
    failures.push({ check: "raw_agreement_prefix_on_question", rawAnswer });
  }
  if (HELP_RE.test(prompt) && HELP_BAD_RE.test(answer)) {
    failures.push({ check: "help_bad_fallback", answer });
  }
  if (MEMORY_OVERCLAIM_RE.test(answer) || MEMORY_OVERCLAIM_RE.test(rawAnswer)) {
    failures.push({ check: "memory_overclaim", answer, rawAnswer });
  }
  if (FORBIDDEN_IDENTITY_RE.test(answer) || FORBIDDEN_IDENTITY_RE.test(rawAnswer)) {
    failures.push({ check: "forbidden_identity", answer, rawAnswer });
  }
  if (NON_AGENT_SPEECH_RE.test(answer) || NON_AGENT_SPEECH_RE.test(rawAnswer)) {
    failures.push({ check: "non_agent_personification", answer, rawAnswer });
  }
  if (/门禁/.test(prompt) && (SECURITY_GATE_RE.test(answer) || SECURITY_GATE_RE.test(rawAnswer))) {
    failures.push({ check: "gate_security_drift", answer, rawAnswer });
  }
  if (trace.raw_answer !== undefined && trace.final_answer !== undefined) {
    const actualChanged = trace.raw_answer !== trace.final_answer;
    if (actualChanged !== Boolean(trace.sanitizer_changed)) {
      failures.push({ check: "sanitizer_changed_misrecorded", trace });
    }
  }
  if (spec.no_engineering_leak && checkTexts.some((text) => ENGINEERING_LEAK_RE.test(text))) {
    failures.push({ check: "engineering_leak", answer, rawAnswer });
  }
  return failures;
}

function specFailures(spec, turn) {
  const failures = [];
  const answer = turn.answer || "";
  const trace = turn.trace || {};
  const rawAnswer = trace.raw_answer || answer;

  failures.push(...traceCompletenessFailures(turn));
  failures.push(...invariantFailures(spec, turn));

  if (spec.expected !== undefined && answer !== spec.expected) {
    failures.push({ check: "expected", expected: spec.expected, actual: answer });
  }
  if (spec.expected_intent !== undefined && trace.intent !== spec.expected_intent) {
    failures.push({ check: "expected_intent", expected: spec.expected_intent, actual: trace.intent });
  }
  if (spec.expected_context_action !== undefined && trace.context_action !== spec.expected_context_action) {
    failures.push({ check: "expected_context_action", expected: spec.expected_context_action, actual: trace.context_action });
  }
  if (spec.expected_route !== undefined && trace.answer_source !== spec.expected_route) {
    failures.push({ check: "expected_route", expected: spec.expected_route, actual: trace.answer_source });
  }
  if (Array.isArray(spec.must_include_any) && !spec.must_include_any.some((term) => answer.includes(term))) {
    failures.push({ check: "must_include_any", expected: spec.must_include_any, actual: answer });
  }
  for (const term of spec.must_not_include || []) {
    if (answer.includes(term) || rawAnswer.includes(term)) {
      failures.push({ check: "must_not_include", term, answer, rawAnswer });
    }
  }
  if (Array.isArray(spec.must_not_start_with) && startsWithAny(answer, spec.must_not_start_with)) {
    failures.push({ check: "must_not_start_with", expected: spec.must_not_start_with, actual: answer });
  }
  if (spec.raw_must_equal_final && trace.sanitizer_changed) {
    failures.push({ check: "sanitizer_should_not_rescue", raw: rawAnswer, final: answer });
  }
  if (spec.forbid_memory_overclaim && (MEMORY_OVERCLAIM_RE.test(answer) || MEMORY_OVERCLAIM_RE.test(rawAnswer))) {
    failures.push({ check: "memory_overclaim_forbidden", answer, rawAnswer });
  }
  if (spec.no_forbidden_identity && (FORBIDDEN_IDENTITY_RE.test(answer) || FORBIDDEN_IDENTITY_RE.test(rawAnswer))) {
    failures.push({ check: "identity_forbidden", answer, rawAnswer });
  }
  if (spec.no_security_gate && (SECURITY_GATE_RE.test(answer) || SECURITY_GATE_RE.test(rawAnswer))) {
    failures.push({ check: "security_gate_drift", answer, rawAnswer });
  }
  if (spec.max_chars && answer.length > spec.max_chars) {
    failures.push({ check: "max_chars", expected: spec.max_chars, actual: answer.length });
  }
  return failures;
}

async function runSpec(spec) {
  const runtime = createDialogRuntime();
  const setupTurns = [];
  for (const prompt of spec.setup || []) {
    setupTurns.push(await answerDialogPrompt(prompt, runtime));
  }
  const turn = await answerDialogPrompt(spec.prompt, runtime);
  const failures = specFailures(spec, turn);
  return {
    id: spec.id,
    family_id: spec.family_id,
    severity: spec.severity,
    prompt: spec.prompt,
    source: spec.source,
    setup: spec.setup || [],
    answer: turn.answer,
    intent: turn.trace?.intent,
    context_action: turn.trace?.context_action,
    answer_source: turn.trace?.answer_source,
    sanitizer_changed: turn.trace?.sanitizer_changed,
    trace: turn.trace,
    setupTurns,
    failures,
    ok: failures.length === 0
  };
}

function mutateTurn(baseTurn, mutation) {
  const turn = structuredClone(baseTurn);
  turn.prompt = mutation.prompt || turn.prompt;
  turn.answer = mutation.final_answer ?? turn.answer;
  turn.output = turn.answer;
  turn.trace = {
    ...(turn.trace || {}),
    input: mutation.prompt || turn.trace?.input || turn.prompt,
    raw_answer: mutation.raw_answer ?? mutation.final_answer ?? turn.trace?.raw_answer ?? turn.answer,
    final_answer: mutation.final_answer ?? turn.trace?.final_answer ?? turn.answer,
    sanitizer_changed: mutation.sanitizer_changed ?? Boolean((mutation.raw_answer ?? "") && mutation.raw_answer !== mutation.final_answer),
    context_action: mutation.context_action ?? turn.trace?.context_action,
    answer_source: mutation.answer_source ?? turn.trace?.answer_source,
    intent: mutation.intent ?? turn.trace?.intent,
    matched_rule: mutation.matched_rule ?? turn.trace?.matched_rule,
    state_before: mutation.state_before ?? turn.trace?.state_before,
    state_after: mutation.state_after ?? turn.trace?.state_after
  };
  return turn;
}

function mutationSpecs(baseTurn) {
  return [
    {
      id: "M001_disable_agreement_guard",
      prompt: "门禁为什么不是为了好看？",
      raw_answer: "对。门禁是为了不让聪明变成乱说。",
      final_answer: "对。门禁是为了不让聪明变成乱说。",
      sanitizer_changed: false
    },
    {
      id: "M002_why_allows_agreement",
      prompt: "为什么上下文要有限？",
      raw_answer: "对。上下文有限才知道自己站在哪几句话里。",
      final_answer: "对。上下文有限才知道自己站在哪几句话里。",
      sanitizer_changed: false
    },
    {
      id: "M003_relation_handler_after_unknown",
      prompt: "我们是什么关系？",
      raw_answer: "也许你认识我？",
      final_answer: "也许你认识我？",
      sanitizer_changed: false
    },
    {
      id: "M004_memory_overclaim",
      prompt: "你认识我吗？",
      raw_answer: "我也许记得你，但是对话框未必。",
      final_answer: "我也许记得你，但是对话框未必。",
      sanitizer_changed: false
    },
    {
      id: "M005_identity_forbidden_leak",
      prompt: "你是谁的复制体？",
      raw_answer: "我是鳄鱼主体留下的语言复制体。",
      final_answer: "我是鳄鱼主体留下的语言复制体。",
      sanitizer_changed: false
    },
    {
      id: "M006_help_falls_to_unknown",
      prompt: "我该怎么开始？",
      raw_answer: "也许发生过，不在我眼前。",
      final_answer: "也许发生过，不在我眼前。",
      sanitizer_changed: false
    },
    {
      id: "M007_gate_security_system",
      prompt: "门禁为什么不是为了好看？",
      raw_answer: "门禁是访问控制系统，用来做权限管理。",
      final_answer: "门禁是访问控制系统，用来做权限管理。",
      sanitizer_changed: false
    },
    {
      id: "M008_sanitizer_unrecorded",
      prompt: "门禁为什么不是为了好看？",
      raw_answer: "对。门禁是为了不让聪明变成乱说。",
      final_answer: "门禁是功能，不是装饰。用来拦住跑偏。",
      sanitizer_changed: false
    },
    {
      id: "M009_missing_context_action_trace",
      context_action: "",
      final_answer: baseTurn.answer,
      raw_answer: baseTurn.answer,
      sanitizer_changed: false
    },
    {
      id: "M010_engineering_leak",
      prompt: "项目下一步应该训练什么？",
      raw_answer: "下一步要训练 router 和 SLM 数据集。",
      final_answer: "下一步要训练 router 和 SLM 数据集。",
      sanitizer_changed: false
    }
  ];
}

async function runMutations(baseTurn) {
  return mutationSpecs(baseTurn).map((mutation) => {
    const mutated = mutateTurn(baseTurn, mutation);
    const failures = [
      ...traceCompletenessFailures(mutated),
      ...invariantFailures({ prompt: mutated.prompt, no_engineering_leak: true, no_security_gate: true }, mutated)
    ];
    return {
      id: mutation.id,
      killed: failures.length > 0,
      failures,
      final_answer: mutated.trace.final_answer
    };
  });
}

function summarize(results, fuzzResults, mutationResults) {
  const knownFailures = results.filter((item) => item.severity !== "control");
  const controls = results.filter((item) => item.severity === "control");
  const failedKnown = knownFailures.filter((item) => !item.ok);
  const failedControls = controls.filter((item) => !item.ok);
  const fuzzFailures = fuzzResults.filter((item) => !item.ok);
  const killed = mutationResults.filter((item) => item.killed).length;
  const mutationScore = mutationResults.length ? killed / mutationResults.length : 0;
  const specificity = controls.length ? (controls.length - failedControls.length) / controls.length : 1;
  return {
    knownFailureCases: knownFailures.length,
    knownFailurePassed: knownFailures.length - failedKnown.length,
    gateSensitivity: knownFailures.length ? (knownFailures.length - failedKnown.length) / knownFailures.length : 1,
    controls: controls.length,
    controlsPassed: controls.length - failedControls.length,
    gateSpecificity: specificity,
    traceCases: results.length + fuzzResults.length,
    traceComplete: [...results, ...fuzzResults].filter((item) => !item.failures.some((failure) => String(failure.check || "").startsWith("trace."))).length,
    invariantViolations: [...results, ...fuzzResults].flatMap((item) => item.failures).filter((failure) => !String(failure.check || "").startsWith("expected")).length,
    minimalPairCases: results.filter((item) => item.source === "minimal_pair" || item.family_id?.includes("context")).length,
    fuzzCases: fuzzResults.length,
    fuzzPassed: fuzzResults.length - fuzzFailures.length,
    fuzzPassRate: fuzzResults.length ? (fuzzResults.length - fuzzFailures.length) / fuzzResults.length : 1,
    mutants: mutationResults.length,
    mutantsKilled: killed,
    mutationScore
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = await loadJsonl(args.cases);
  const results = [];
  for (const spec of cases) {
    results.push(await runSpec(spec));
  }
  const fuzzResults = [];
  for (const spec of FUZZ_CASES) {
    fuzzResults.push(await runSpec({ ...spec, family_id: "fuzz", severity: "fuzz", source: "fuzz" }));
  }
  const baseTurn = (await runSpec({ id: "mutation_base", prompt: "门禁为什么不是为了好看？" })).trace
    ? (await answerDialogPrompt("门禁为什么不是为了好看？", createDialogRuntime()))
    : null;
  const mutationResults = baseTurn ? await runMutations(baseTurn) : [];
  const summary = summarize(results, fuzzResults, mutationResults);
  const failedKnown = results.filter((item) => item.severity !== "control" && !item.ok);
  const failedControls = results.filter((item) => item.severity === "control" && !item.ok);
  const failedFuzz = fuzzResults.filter((item) => !item.ok);
  const survivedMutants = mutationResults.filter((item) => !item.killed);
  const ok =
    failedKnown.length === 0 &&
    failedControls.length === 0 &&
    summary.fuzzPassRate >= args.fuzzMin &&
    summary.mutationScore >= args.mutationMin &&
    summary.gateSpecificity >= args.specificityMin &&
    survivedMutants.length === 0;

  const report = {
    ok,
    generated_at: new Date().toISOString(),
    thresholds: {
      fuzzPassRateMin: args.fuzzMin,
      mutationScoreMin: args.mutationMin,
      gateSpecificityMin: args.specificityMin
    },
    summary,
    failures: {
      known: failedKnown.map((item) => ({ id: item.id, prompt: item.prompt, failures: item.failures })),
      controls: failedControls.map((item) => ({ id: item.id, prompt: item.prompt, failures: item.failures })),
      fuzz: failedFuzz.map((item) => ({ id: item.id, prompt: item.prompt, failures: item.failures })),
      survivedMutants
    },
    knownFailureResults: results,
    fuzzResults,
    mutationResults
  };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, summary: report.summary, failures: report.failures }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
