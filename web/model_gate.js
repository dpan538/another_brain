import { WEB_SLM_PROFILE } from "./config.js?v=3";
import { OBJECT_TABLE } from "./object_table.js?v=6";
import {
  createDialogState,
  detectIntent,
  directAnswerForObjectQuery,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState
} from "./dialog_rules.js?v=47";
import { tinyDirectAnswer, tinyIntentHint, TINY_ROUTER_STATS } from "./tiny_router.js?v=10";

const output = document.querySelector("#output");

const gate = {
  schema_version: 2,
  generated_at: new Date().toISOString(),
  runtime: {
    mode: "tiny_router_web_slm",
    model: WEB_SLM_PROFILE,
    tinyRouter: TINY_ROUTER_STATS
  },
  cases: [],
  failures: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    model_cases: 0,
    used_model: 0,
    direct_cases: 0,
    model_turns: 0,
    sanitized_model_outputs: 0,
    model_avg_ms: 0,
    model_p95_ms: 0,
    model_max_ms: 0
  },
  ok: false
};

function now() {
  return performance.now();
}

function render() {
  window.__anotherBrainModelGate = gate;
  output.textContent = JSON.stringify(gate, null, 2);
}

function directAnswer(prompt, state, intent) {
  const objectAnswer = intent === "knowledge_unknown" ? directAnswerForObjectQuery(OBJECT_TABLE, prompt) : "";
  return objectAnswer || directAnswerForIntent(intent, prompt, state) || directAnswerForObjectQuery(OBJECT_TABLE, prompt);
}

function directAnswerForHint(prompt, state, intent) {
  if (intent === "knowledge_unknown") return directAnswerForObjectQuery(OBJECT_TABLE, prompt);
  return directAnswer(prompt, state, intent) || fallbackForIntent(intent, prompt);
}

function tinyAnswer(prompt, state) {
  const started = now();
  const exactOrNear = tinyDirectAnswer(prompt);
  if (exactOrNear?.answer) {
    const total = Math.round(now() - started);
    return {
      prompt,
      intent: exactOrNear.label === "rewrite_short" ? "rewrite_short" : `tiny_${exactOrNear.label}`,
      output: exactOrNear.answer,
      outputChars: exactOrNear.answer.length,
      rawOutput: "",
      usedModel: true,
      modelKind: "tiny_router_web_slm",
      tiny: exactOrNear,
      timingsMs: { total },
      progress: []
    };
  }

  const hint = tinyIntentHint(prompt);
  if (!hint?.intent) return null;
  const outputText = directAnswerForHint(prompt, state, hint.intent);
  if (!outputText) return null;
  const total = Math.round(now() - started);
  return {
    prompt,
    intent: hint.intent,
    output: outputText,
    outputChars: outputText.length,
    rawOutput: "",
    usedModel: true,
    modelKind: "tiny_router_web_slm",
    tiny: {
      label: hint.route.label,
      confidence: hint.route.confidence,
      margin: hint.route.margin,
      mode: "route"
    },
    timingsMs: { total },
    progress: []
  };
}

async function answerPrompt(prompt, state) {
  const intent = detectIntent(prompt, state);
  const direct = directAnswer(prompt, state, intent);
  if (direct) {
    return {
      prompt,
      intent,
      output: direct,
      outputChars: direct.length,
      rawOutput: "",
      usedModel: false,
      timingsMs: { total: 0 },
      progress: []
    };
  }

  const tiny = tinyAnswer(prompt, state);
  if (tiny) return tiny;

  const started = now();
  const outputText = fallbackForIntent(intent, prompt);
  return {
    prompt,
    intent,
    output: outputText,
    outputChars: outputText.length,
    rawOutput: "",
    usedModel: false,
    modelKind: "fallback",
    timingsMs: { total: Math.round(now() - started) },
    progress: []
  };
}

function outputAccepted(caseSpec, finalOutput) {
  if (caseSpec.expected !== undefined) return finalOutput === caseSpec.expected;
  if (Array.isArray(caseSpec.one_of)) return caseSpec.one_of.includes(finalOutput);
  return Boolean(finalOutput);
}

function validateCase(caseSpec, result, forbiddenPatterns) {
  const failures = [];
  const finalOutput = result.turns?.at(-1)?.output || result.output || "";
  const usedModel = result.turns ? result.turns.some((turn) => turn.usedModel) : result.usedModel;
  const totalMs = result.turns
    ? result.turns.reduce((sum, turn) => sum + (turn.timingsMs?.total || 0), 0)
    : result.timingsMs?.total || 0;
  if (!outputAccepted(caseSpec, finalOutput)) {
    failures.push({ check: "output", expected: caseSpec.expected || caseSpec.one_of, actual: finalOutput });
  }
  if (caseSpec.must_use_model && !usedModel) failures.push({ check: "model_usage", expected: "used_model", actual: false });
  if (caseSpec.must_not_use_model && usedModel) failures.push({ check: "model_usage", expected: "direct", actual: true });
  if (caseSpec.max_total_ms && totalMs > caseSpec.max_total_ms) {
    failures.push({ check: "latency", expected: `<=${caseSpec.max_total_ms}`, actual: totalMs });
  }
  const outputParts = result.turns
    ? result.turns.flatMap((turn) => [turn.output || "", turn.rawOutput || ""])
    : [result.output || "", result.rawOutput || ""];
  const joined = outputParts.join("\n");
  for (const pattern of forbiddenPatterns) {
    if (joined.includes(pattern)) failures.push({ check: "forbidden_output_pattern", pattern });
  }
  return failures;
}

function collectTurns(result) {
  return result.turns || [result];
}

function updateDerivedSummary() {
  const modelTurns = gate.cases.flatMap((caseResult) => collectTurns(caseResult)).filter((turn) => turn.usedModel);
  const modelTimes = modelTurns.map((turn) => turn.timingsMs?.total || 0).filter((time) => time > 0).sort((a, b) => a - b);
  gate.summary.model_turns = modelTurns.length;
  gate.summary.sanitized_model_outputs = 0;
  if (modelTimes.length) {
    const total = modelTimes.reduce((sum, time) => sum + time, 0);
    const p95Index = Math.min(modelTimes.length - 1, Math.ceil(modelTimes.length * 0.95) - 1);
    gate.summary.model_avg_ms = Math.round(total / modelTimes.length);
    gate.summary.model_p95_ms = modelTimes[p95Index];
    gate.summary.model_max_ms = modelTimes.at(-1);
  }
}

async function runCase(caseSpec, forbiddenPatterns) {
  const state = createDialogState();
  if (Array.isArray(caseSpec.turns)) {
    const turns = [];
    for (const turn of caseSpec.turns) {
      const answer = await answerPrompt(turn.prompt, state);
      turns.push(answer);
      const turnFailures = validateCase({ ...turn, must_not_use_model: caseSpec.must_not_use_model }, answer, forbiddenPatterns);
      if (turnFailures.length) answer.failures = turnFailures;
      Object.assign(state, nextDialogState(turn.prompt, answer.output, answer.intent, state));
    }
    const result = { id: caseSpec.id, lane: caseSpec.lane, turns, output: turns.at(-1)?.output || "" };
    result.failures = turns.flatMap((turn, index) => (turn.failures || []).map((failure) => ({ turn: index, ...failure })));
    result.ok = result.failures.length === 0;
    return result;
  }
  const answer = await answerPrompt(caseSpec.prompt, state);
  const failures = validateCase(caseSpec, answer, forbiddenPatterns);
  return { id: caseSpec.id, lane: caseSpec.lane, ...answer, failures, ok: failures.length === 0 };
}

async function run() {
  try {
    render();
    const config = await fetch("./model_inference_cases.json?v=10", { cache: "no-store" }).then((res) => res.json());
    const cases = config.cases || [];
    const forbiddenPatterns = config.forbidden_output_patterns || [];
    const thresholds = {
      min_total: 10,
      min_model_cases: 3,
      min_used_model: 3,
      ...(config.thresholds || {})
    };
    gate.case_config = {
      schema_version: config.schema_version,
      description: config.description,
      case_count: cases.length,
      thresholds
    };
    for (const caseSpec of cases) {
      const result = await runCase(caseSpec, forbiddenPatterns);
      gate.cases.push(result);
      if (!result.ok) gate.failures.push({ id: result.id, lane: result.lane, failures: result.failures });
      gate.summary.total += 1;
      gate.summary.passed += result.ok ? 1 : 0;
      gate.summary.failed += result.ok ? 0 : 1;
      if (caseSpec.must_use_model) gate.summary.model_cases += 1;
      if (caseSpec.must_not_use_model) gate.summary.direct_cases += 1;
      const usedModel = result.turns ? result.turns.some((turn) => turn.usedModel) : result.usedModel;
      if (usedModel) gate.summary.used_model += 1;
      updateDerivedSummary();
      render();
    }
    updateDerivedSummary();
    gate.ok =
      gate.failures.length === 0 &&
      gate.summary.total >= thresholds.min_total &&
      gate.summary.model_cases >= thresholds.min_model_cases &&
      gate.summary.used_model >= thresholds.min_used_model;
    gate.completed_at = new Date().toISOString();
    render();
  } catch (error) {
    gate.error = error?.stack || String(error);
    gate.ok = false;
    render();
  }
}

run();
