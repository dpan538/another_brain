#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const R24A_PROMPTS = resolve(ROOT, "evals/r24_intelligence_recovery/prompts.jsonl");
const R24D_PROMPTS = resolve(ROOT, "evals/r24d_heldout_recovery/prompts.jsonl");
const SEED_TASKS = resolve(ROOT, "training/long_horizon/seed_tasks.jsonl");
const HELDOUT_TASKS = resolve(ROOT, "training/long_horizon/heldout_tasks.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/route_distribution_audit_report.json");
const COLLAPSE = /(我只是个对话框|也许发生过，不在我眼前|你应该去问百度|你需要提问)/;

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error.message}`);
      }
    });
}

function routeKey(turn = {}) {
  const cc = turn.trace?.conversation_controller || {};
  return cc.operation || turn.intent || turn.route || "unknown";
}

function isFallbackLike(turn = {}) {
  const route = String(turn.route || "");
  const intent = String(turn.intent || "");
  const key = routeKey(turn);
  return (
    route === "fallback" ||
    /fallback|ask_clarify|search_hint|correct_distractor/.test(`${intent} ${key}`) ||
    COLLAPSE.test(String(turn.answer || ""))
  );
}

function isIdentityLike(turn = {}) {
  return /identity|对话框/.test(`${turn.intent || ""} ${routeKey(turn)} ${turn.answer || ""}`);
}

function isUnknownLike(turn = {}) {
  return /unknown|不知道|不确定|问百度/.test(`${turn.intent || ""} ${routeKey(turn)} ${turn.answer || ""}`);
}

function datasetCategory(row) {
  return row.category || row.task_family || "";
}

function isProjectCategory(category) {
  if (/negative_constraints/.test(category)) return false;
  return /project|maintenance|continuation|constraint|shard|vercel|deployment|training|long|state|route|split|heldout|drift|knowledge_expansion|generic_schema|claimed_execution/.test(category);
}

function isLocalCategory(category) {
  return /arithmetic|counting|definition|common|language|chinese/.test(category);
}

async function runPromptCase(spec, dataset) {
  const runtime = createDialogRuntime();
  const prompts = Array.isArray(spec.turns) && spec.turns.length ? spec.turns : [{ user: spec.prompt || "" }];
  const turns = [];
  for (const item of prompts) {
    const prompt = typeof item === "string" ? item : item.user || item.prompt || "";
    turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false, uiProfile: spec.ui_profile || "mobile" }));
  }
  const final = turns.at(-1) || {};
  return {
    id: spec.id,
    dataset,
    category: spec.category || "",
    prompt: prompts.map((item) => (typeof item === "string" ? item : item.user || item.prompt || "")),
    answer: final.answer || "",
    route: final.route || "",
    intent: final.intent || "",
    route_key: routeKey(final),
    answerability: final.trace?.conversation_controller?.answerability?.answerability || "",
    task_state_present: Boolean(final.trace?.conversation_controller?.task_state_after),
    fallback_like: isFallbackLike(final),
    identity_like: isIdentityLike(final),
    unknown_like: isUnknownLike(final)
  };
}

async function runTask(task, dataset) {
  const runtime = createDialogRuntime();
  const turns = [];
  for (const turn of task.turns || []) {
    turns.push(await answerDialogPrompt(turn.text, runtime, { withThinkingDelay: false, uiProfile: "mobile" }));
  }
  const final = turns.at(-1) || {};
  return {
    id: task.task_id,
    dataset,
    category: task.task_family || "",
    prompt: (task.turns || []).map((turn) => turn.text || ""),
    answer: final.answer || "",
    route: final.route || "",
    intent: final.intent || "",
    route_key: routeKey(final),
    answerability: final.trace?.conversation_controller?.answerability?.answerability || "",
    task_state_present: Boolean(final.trace?.conversation_controller?.task_state_after),
    fallback_like: isFallbackLike(final),
    identity_like: isIdentityLike(final),
    unknown_like: isUnknownLike(final)
  };
}

function distribution(rows, key = "route_key") {
  const out = {};
  for (const row of rows) out[row[key] || "unknown"] = (out[row[key] || "unknown"] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

function rate(rows, predicate) {
  return rows.length ? rows.filter(predicate).length / rows.length : 0;
}

async function main() {
  const rows = [];
  for (const spec of await readJsonl(R24A_PROMPTS)) rows.push(await runPromptCase(spec, "r24a_recovery"));
  for (const spec of await readJsonl(R24D_PROMPTS)) rows.push(await runPromptCase(spec, "r24d_heldout_recovery"));
  for (const task of await readJsonl(SEED_TASKS)) rows.push(await runTask(task, "long_horizon_seed"));
  for (const task of await readJsonl(HELDOUT_TASKS)) rows.push(await runTask(task, "long_horizon_heldout"));

  const failures = [];
  const warnings = [];
  const route_distribution = distribution(rows);
  const dataset_distribution = {};
  for (const dataset of [...new Set(rows.map((row) => row.dataset))].sort()) {
    dataset_distribution[dataset] = distribution(rows.filter((row) => row.dataset === dataset));
  }

  for (const row of rows) {
    const category = datasetCategory(row);
    if (isLocalCategory(category) && /continue_active_task|project_continuation/.test(`${row.intent} ${row.route_key}`)) {
      failures.push({ type: "project_route_answered_local_prompt", id: row.id, dataset: row.dataset, category, route_key: row.route_key, answer: row.answer });
    }
    if (isProjectCategory(category) && /micro_solver|operation_arithmetic|operation_counting/.test(`${row.intent} ${row.route_key}`)) {
      failures.push({ type: "micro_solver_answered_project_prompt", id: row.id, dataset: row.dataset, category, route_key: row.route_key, answer: row.answer });
    }
    if (isProjectCategory(category) && !row.task_state_present) {
      failures.push({ type: "missing_task_state_trace_for_project", id: row.id, dataset: row.dataset, category, route_key: row.route_key });
    }
    if (!row.answerability) {
      failures.push({ type: "missing_answerability_trace", id: row.id, dataset: row.dataset, category, route_key: row.route_key });
    }
  }

  const fallback_rate = rate(rows, (row) => row.fallback_like);
  const identity_rate = rate(rows, (row) => row.identity_like);
  const unknown_rate = rate(rows, (row) => row.unknown_like);
  const micro_solver_rate = rate(rows, (row) => /micro_solver|arithmetic|counting|word_arithmetic/.test(`${row.intent} ${row.route_key}`));
  const project_continuation_rate = rate(rows, (row) => /project_continuation|continue_active_task/.test(`${row.intent} ${row.route_key}`));
  const topRoute = Object.entries(route_distribution)[0] || ["", 0];
  const topRouteRate = rows.length ? topRoute[1] / rows.length : 0;
  if (topRouteRate > 0.72 && !/micro_solver|direct|operation/.test(topRoute[0])) {
    failures.push({ type: "single_route_dominates", route: topRoute[0], rate: topRouteRate });
  } else if (topRouteRate > 0.62) {
    warnings.push({ type: "single_route_high_share", route: topRoute[0], rate: topRouteRate });
  }
  if (fallback_rate > 0.1) failures.push({ type: "fallback_rate_too_high", rate: fallback_rate });
  if (identity_rate > 0.12) failures.push({ type: "identity_route_rate_too_high", rate: identity_rate });
  if (unknown_rate > 0.22) failures.push({ type: "unknown_route_rate_too_high", rate: unknown_rate });

  const report = {
    ok: failures.length === 0,
    rows_total: rows.length,
    route_distribution,
    dataset_distribution,
    rates: {
      fallback_rate,
      identity_rate,
      unknown_rate,
      micro_solver_rate,
      project_continuation_rate,
      top_route_rate: topRouteRate
    },
    failures: failures.slice(0, 80),
    warnings,
    sample_rows: rows.slice(0, 20),
    report_path: OUT
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
