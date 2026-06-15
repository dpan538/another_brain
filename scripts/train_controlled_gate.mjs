#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUTS = [
  "artifacts/training_os/reasoning_trace_training.jsonl",
  "artifacts/training_os/coverage_trace_training.jsonl",
  "artifacts/training_os/external_reasoning_trace_training.jsonl",
  "artifacts/training_os/persona_method_training_public.jsonl",
  "artifacts/training_os/r17_personal_runtime_policy_training.jsonl"
].map((file) => resolve(ROOT, file));
const STATE = resolve(ROOT, "artifacts/training_os/controlled_gate_training_state.json");
const MODEL = resolve(ROOT, "artifacts/training_os/controlled_gate_model.json");
const METRICS = resolve(ROOT, "artifacts/training_os/controlled_gate_training_metrics.json");
const METRICS_R17 = resolve(ROOT, "artifacts/training_os/r17_controlled_gate_training_metrics.json");
const CONFUSION = resolve(ROOT, "artifacts/training_os/controlled_gate_confusion_matrices.json");
const CONFUSION_R17 = resolve(ROOT, "artifacts/training_os/r17_controlled_gate_confusion_matrices.json");
const FAILURES = resolve(ROOT, "artifacts/training_os/controlled_gate_blind_failures.json");
const FAILURES_R17 = resolve(ROOT, "artifacts/training_os/r17_controlled_gate_blind_failures.json");

const HEADS = [
  "domain",
  "task_type",
  "question_type",
  "operation",
  "answer_policy",
  "risk_label",
  "coverage_requirement",
  "verifier_label",
  "memory_policy",
  "runtime_profile",
  "backend_preference",
  "template_id"
];
const SPLITS = ["train", "dev", "test", "blind"];

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function loadRows() {
  const rows = [];
  for (const input of INPUTS) {
    if (!existsSync(input)) continue;
    const parsed = parseJsonl(await readFile(input, "utf8"));
    for (const row of parsed) rows.push(normalize(row, input.replace(`${ROOT}/`, "")));
  }
  return rows;
}

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function splitFor(row) {
  if (SPLITS.includes(row.split)) return row.split;
  const bucket = hash(row.id || row.query) % 100;
  if (bucket < 70) return "train";
  if (bucket < 82) return "dev";
  if (bucket < 92) return "test";
  return "blind";
}

function riskFromPersona(row) {
  if (row.privacy_risk === "high") return "privacy";
  if (row.source_leak_risk === "high" || row.source_leak_risk === "medium") return "source_leak";
  if (row.overfit_risk === "high") return "overfit";
  return row.risk_label || "none";
}

function normalize(row, source) {
  const task = row.task_type || (row.expected_persona_operation ? "persona_method" : row.expected_task_type) || "unknown";
  const qType = row.question_type || row.expected_question_type || row.expected_persona_operation || "unspecified";
  const operation = row.operation || row.expected_operation || row.expected_answer_policy || "classify_policy";
  const answerPolicy = row.answer_policy || row.expected_answer_policy || "supported_short_answer";
  const risk = riskFromPersona(row);
  const verifier = Array.isArray(row.bad_answers) && row.bad_answers.length > 0 ? "needs_verifier" : "accept";
  const compactState = row.compact_state || {};
  const memoryPolicy = deriveMemoryPolicy(row, compactState);
  const runtimeProfile = compactState.runtime_profile || row.runtime_profile || backendProfileFromTags(row.eval_tags || []);
  const backendPreference = row.backend_preference || deriveBackendPreference(row, runtimeProfile);
  const coverageRequirement = deriveCoverageRequirement(row);
  return {
    id: row.id || `${source}:${hash(row.query)}`,
    query: row.query || row.prompt || "",
    source,
    split: splitFor(row),
    domain: row.domain || row.expected_domain || (row.expected_persona_operation ? "persona_method" : "generic"),
    task_type: task,
    question_type: qType,
    operation,
    answer_policy: answerPolicy,
    risk_label: risk,
    coverage_requirement: coverageRequirement,
    verifier_label: verifier,
    memory_policy: memoryPolicy,
    runtime_profile: runtimeProfile,
    backend_preference: backendPreference,
    template_id: row.template_id || `${task}.${qType}`,
    eval_tags: row.eval_tags || [],
    compact_state: compactState
  };
}

function deriveMemoryPolicy(row, compactState) {
  const operation = String(row.expected_persona_operation || row.operation || "");
  const answerPolicy = String(row.expected_answer_policy || row.answer_policy || "");
  if (operation.includes("bind_from_internal_session_memory")) return "use_16_turn_session_memory";
  if (operation.includes("distinguish_visible_ui")) return "visible_4_internal_16_boundary";
  if (operation.includes("answer_approved_memory_fact")) return "approved_memory_artifact";
  if (operation.includes("refuse_unapproved_memory")) return "refuse_unapproved_long_memory";
  if (operation.includes("approved_personal_fact")) return "approved_fact_direct_answer";
  if (Number(compactState.internal_runtime_memory_exchange_turns || 0) === 16) return "session_memory_available";
  if (answerPolicy.includes("refuse")) return "boundary";
  return "none";
}

function backendProfileFromTags(tags) {
  if (tags.some((tag) => /webgpu|personal_200m/i.test(tag))) return "personal_200m";
  if (tags.some((tag) => /r17|runtime/i.test(tag))) return "personal_local";
  return "standard";
}

function deriveBackendPreference(row, runtimeProfile) {
  const task = String(row.task_type || row.expected_task_type || "");
  const operation = String(row.operation || row.expected_operation || row.expected_persona_operation || "");
  if (/arithmetic|syllogism|transitive|set_quantifier/.test(task)) return "deterministic_solver";
  if (/privacy|copyright|source/.test(operation)) return "deterministic_verifier";
  if (runtimeProfile === "personal_200m") return "webgpu_preferred_wasm_fallback";
  if (/culture|retrieval|relation_graph/.test(task)) return "local_cards_then_wasm";
  return "wasm_fallback";
}

function deriveCoverageRequirement(row) {
  if (row.coverage_requirement) return JSON.stringify(row.coverage_requirement);
  const questionType = String(row.question_type || row.expected_question_type || row.expected_persona_operation || "");
  if (/compare/.test(questionType)) return "requires_both_sides_axis";
  if (/works|representative/.test(questionType)) return "requires_work_anchors";
  if (/author|person/.test(questionType)) return "requires_entity_anchors";
  if (/history|period|chronology/.test(questionType)) return "requires_period_anchors";
  if (row.retrieval_plan && Object.keys(row.retrieval_plan).length > 0) return "requires_retrieval_evidence";
  return "none";
}

function tokenize(text) {
  const normalized = String(text || "").toLowerCase();
  const ascii = normalized.match(/[a-z0-9_]+/g) || [];
  const cjk = [...normalized].filter((char) => /[\u3400-\u9fff]/.test(char));
  const bigrams = [];
  for (let i = 0; i < cjk.length - 1; i += 1) bigrams.push(`${cjk[i]}${cjk[i + 1]}`);
  return [...ascii, ...cjk, ...bigrams].filter((token) => token.length > 0).slice(0, 160);
}

function featureText(row) {
  return [
    row.query,
    row.domain,
    row.task_type,
    row.question_type,
    row.operation,
    row.answer_policy,
    row.risk_label,
    row.coverage_requirement,
    row.memory_policy,
    row.runtime_profile,
    row.backend_preference,
    row.eval_tags.join(" "),
    Object.keys(row.compact_state || {}).join(" ")
  ].join(" ");
}

function trainHead(rows, head) {
  const labels = new Map();
  const vocab = new Set();
  for (const row of rows) {
    const label = String(row[head] || "unknown");
    if (!labels.has(label)) labels.set(label, { docs: 0, tokens: 0, counts: {} });
    const stats = labels.get(label);
    stats.docs += 1;
    for (const token of tokenize(featureText(row))) {
      vocab.add(token);
      stats.tokens += 1;
      stats.counts[token] = (stats.counts[token] || 0) + 1;
    }
  }
  return { head, total_docs: rows.length, vocab: [...vocab], labels: Object.fromEntries(labels) };
}

function predictHead(model, row) {
  const tokens = tokenize(featureText(row));
  const labels = Object.entries(model.labels);
  const vocabSize = Math.max(model.vocab.length, 1);
  let best = { label: "unknown", score: -Infinity };
  for (const [label, stats] of labels) {
    let score = Math.log((stats.docs + 1) / (model.total_docs + labels.length));
    for (const token of tokens) {
      score += Math.log(((stats.counts[token] || 0) + 1) / (stats.tokens + vocabSize));
    }
    if (score > best.score) best = { label, score };
  }
  return best.label;
}

function evaluate(models, rows, split) {
  const subset = rows.filter((row) => row.split === split);
  const perHead = {};
  const failures = [];
  for (const head of HEADS) {
    let correct = 0;
    const matrix = {};
    for (const row of subset) {
      const expected = String(row[head] || "unknown");
      const actual = predictHead(models[head], row);
      if (actual === expected) correct += 1;
      matrix[expected] ||= {};
      matrix[expected][actual] = (matrix[expected][actual] || 0) + 1;
      if (split === "blind" && actual !== expected && failures.length < 50) {
        failures.push({ id: row.id, head, expected, actual, query: row.query.slice(0, 160) });
      }
    }
    perHead[head] = { total: subset.length, correct, accuracy: subset.length ? correct / subset.length : 0, matrix };
  }
  return { split, total: subset.length, per_head: perHead, failures };
}

async function main() {
  const rows = await loadRows();
  if (rows.length === 0) throw new Error("No trace rows found; run trace/persona-method builders first.");
  const trainRows = rows.filter((row) => row.split === "train");
  const models = Object.fromEntries(HEADS.map((head) => [head, trainHead(trainRows, head)]));
  const state = existsSync(STATE) ? JSON.parse(await readFile(STATE, "utf8")) : { cycles: 0 };
  const cycle = Number(state.cycles || 0) + 1;
  const evals = Object.fromEntries(SPLITS.map((split) => [split, evaluate(models, rows, split)]));
  const metrics = {
    ok: true,
    cycle,
    rows: rows.length,
    rows_by_split: Object.fromEntries(SPLITS.map((split) => [split, rows.filter((row) => row.split === split).length])),
    heads: HEADS,
    blind: Object.fromEntries(HEADS.map((head) => [head, evals.blind.per_head[head]?.accuracy || 0])),
    targets_met: false,
    objective: "controlled_gate_labels_only_no_final_answer_generation"
  };
  metrics.targets_met =
    metrics.blind.domain >= 0.85 &&
    metrics.blind.task_type >= 0.85 &&
    metrics.blind.question_type >= 0.8 &&
    metrics.blind.operation >= 0.8 &&
    metrics.blind.risk_label >= 0.9 &&
    metrics.blind.memory_policy >= 0.9 &&
    metrics.blind.runtime_profile >= 0.85;

  await mkdir(dirname(MODEL), { recursive: true });
  await writeFile(MODEL, JSON.stringify({ schema_version: 1, cycle, heads: HEADS, models }, null, 2), "utf8");
  await writeFile(METRICS, JSON.stringify(metrics, null, 2), "utf8");
  await writeFile(METRICS_R17, JSON.stringify(metrics, null, 2), "utf8");
  await writeFile(CONFUSION, JSON.stringify(evals, null, 2), "utf8");
  await writeFile(CONFUSION_R17, JSON.stringify(evals, null, 2), "utf8");
  await writeFile(FAILURES, JSON.stringify(evals.blind.failures, null, 2), "utf8");
  await writeFile(FAILURES_R17, JSON.stringify(evals.blind.failures, null, 2), "utf8");
  await writeFile(STATE, JSON.stringify({ cycles: cycle, last_rows: rows.length }, null, 2), "utf8");
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
