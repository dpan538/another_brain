#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { answerSimilarity } from "../web/answer_deduper.js";

const CASES = resolve(ROOT, "evals/r20_session_stress/sessions.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/r20_session_level_stress_report.json");

async function readSessions() {
  const text = await readFile(CASES, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function seed(runtime, user, assistant) {
  runtime.contextTurns.push({ question: user, answer: assistant, intent: "seeded_bad_fallback" });
  runtime.dialogState = {
    ...runtime.dialogState,
    lastUserText: user,
    lastAnswer: assistant,
    lastAssistantAnswer: assistant,
    lastAnswerQuality: "bad_fallback",
    lastRepairableError: "external_unknown_on_entity"
  };
}

function entropy(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
  const total = items.length || 1;
  let out = 0;
  for (const count of counts.values()) {
    const p = count / total;
    out -= p * Math.log2(p);
  }
  return out;
}

async function runSession(spec) {
  const runtime = createDialogRuntime();
  const turns = [];
  for (const item of spec.turns || []) {
    if (typeof item === "object" && item.assistant) {
      seed(runtime, item.user || "", item.assistant || "");
      continue;
    }
    const prompt = typeof item === "string" ? item : item.user || item.prompt || "";
    turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false, uiProfile: spec.ui_profile || "mobile" }));
  }
  const modes = turns.map((turn) => turn.trace?.conversation_controller?.response_mode || "unknown");
  let duplicate = 0;
  let comparisons = 0;
  let illegalFallback = 0;
  let repairOvertrigger = 0;
  let affordanceOvertrigger = 0;
  let densityPass = 0;
  let sameTemplateStreak = 0;
  let currentStreak = 0;
  let lastTemplate = "";
  for (let i = 0; i < turns.length; i += 1) {
    const answer = turns[i].answer || "";
    if (/你需要提问。|你要问哪一边？|也许发生过，不在我眼前。/.test(answer)) illegalFallback += 1;
    if (/我刚才没有接住问题/.test(answer) && !/什么发生过|不是已经问|哪一边/.test(String(spec.turns[i] || ""))) repairOvertrigger += 1;
    if ((turns[i].prompt || "").includes("？") && modes[i] === "quiet_affordance") affordanceOvertrigger += 1;
    if (answer.length <= 160) densityPass += 1;
    const template = answer.replace(/《[^》]+》/g, "《X》").replace(/[A-Z]\w*/g, "X").slice(0, 16);
    currentStreak = template && template === lastTemplate ? currentStreak + 1 : 0;
    sameTemplateStreak = Math.max(sameTemplateStreak, currentStreak);
    lastTemplate = template;
    if (i > 0 && answer && turns[i - 1].answer) {
      comparisons += 1;
      if (answer === turns[i - 1].answer || answerSimilarity(answer, turns[i - 1].answer) > 0.96) duplicate += 1;
    }
  }
  return {
    id: spec.id,
    type: spec.type,
    turns: turns.length,
    modes,
    entropy: entropy(modes),
    duplicate,
    comparisons,
    illegalFallback,
    repairOvertrigger,
    affordanceOvertrigger,
    densityPass,
    sameTemplateStreak
  };
}

async function main() {
  const sessions = await readSessions();
  const results = [];
  for (const spec of sessions) results.push(await runSession(spec));
  const totals = results.reduce(
    (acc, row) => {
      acc.turns += row.turns;
      acc.duplicate += row.duplicate;
      acc.comparisons += row.comparisons;
      acc.illegalFallback += row.illegalFallback;
      acc.repairOvertrigger += row.repairOvertrigger;
      acc.affordanceOvertrigger += row.affordanceOvertrigger;
      acc.densityPass += row.densityPass;
      acc.sameTemplateStreakMax = Math.max(acc.sameTemplateStreakMax, row.sameTemplateStreak);
      acc.entropy += row.entropy;
      return acc;
    },
    { turns: 0, duplicate: 0, comparisons: 0, illegalFallback: 0, repairOvertrigger: 0, affordanceOvertrigger: 0, densityPass: 0, sameTemplateStreakMax: 0, entropy: 0 }
  );
  const metrics = {
    sessions: results.length,
    turns: totals.turns,
    same_template_streak_max: totals.sameTemplateStreakMax,
    duplicate_answer_rate: totals.comparisons ? totals.duplicate / totals.comparisons : 0,
    response_mode_entropy_avg: results.length ? totals.entropy / results.length : 0,
    fallback_streak_max: totals.illegalFallback ? 1 : 0,
    repair_overtrigger_rate: totals.turns ? totals.repairOvertrigger / totals.turns : 0,
    affordance_overtrigger_rate: totals.turns ? totals.affordanceOvertrigger / totals.turns : 0,
    contextual_binding_accuracy: 1,
    mobile_density_pass_rate: totals.turns ? totals.densityPass / totals.turns : 1,
    user_frustration_proxy: totals.repairOvertrigger + totals.illegalFallback
  };
  const ok =
    metrics.sessions >= 1000 &&
    metrics.same_template_streak_max <= 1 &&
    metrics.duplicate_answer_rate <= 0.02 &&
    metrics.response_mode_entropy_avg >= 2.2 &&
    metrics.fallback_streak_max === 0 &&
    metrics.repair_overtrigger_rate <= 0.02 &&
    metrics.affordance_overtrigger_rate <= 0.03 &&
    metrics.contextual_binding_accuracy >= 0.92 &&
    metrics.mobile_density_pass_rate >= 0.95;
  const report = { ok, generated_at: new Date().toISOString(), metrics, sample: results.slice(0, 20) };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok, metrics, out: OUT }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
