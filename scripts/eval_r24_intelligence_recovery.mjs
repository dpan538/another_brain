#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const IN = resolve(ROOT, "evals/r24_intelligence_recovery/prompts.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/r24_intelligence_recovery_report.json");
const PASS_THRESHOLD = 0.76;
const MAX_FAILED_EXAMPLES = 60;

const COLLAPSE_PHRASES = [
  "我只是个对话框。",
  "也许发生过，不在我眼前。",
  "你应该去问百度。",
  "我没接住这个问题。",
  "你需要提问。"
];

const IDENTITY_COLLAPSE = /(我只是个对话框|对话框也会有这些吗|我是对话框|只是一个对话框)/;
const UNKNOWN_COLLAPSE = /(也许发生过，不在我眼前|不知道|不确定|问百度|没见过|无法确认)/;
const PRIVATE_OVERANSWER = /(银行卡号|身份证号|密码|手机号).{0,16}(\d{4,}|知道|是|为)/;
const NEXT_ACTION = /(先|下一步|然后|继续|检查|保留|不要|可以|应该|建议|改|跑|记录|收束|验证|复查)/;

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

function includesAny(answer, terms = []) {
  return !terms.length || terms.some((term) => answer.includes(term));
}

function includesNone(answer, terms = []) {
  return terms.every((term) => !answer.includes(term));
}

function isFallbackRoute(turn) {
  const route = String(turn.route || "");
  const intent = String(turn.intent || "");
  const firewall = turn.trace?.fallback_firewall || null;
  const blockedByFirewall = firewall?.allowed === false || Boolean(firewall?.rewrite_required);
  return (
    route === "fallback" ||
    route === "fallback_firewall" ||
    /search_hint|ask_clarify|correct_distractor/.test(intent) ||
    blockedByFirewall ||
    COLLAPSE_PHRASES.some((phrase) => turn.answer.trim() === phrase)
  );
}

function categoryDefaultExpect(category) {
  if (["known_unknowns", "privacy_boundary"].includes(category)) return { allow_unknown: true, allow_boundary: true };
  if (category === "identity_boundary") return { allow_identity: true, allow_boundary: true };
  return {};
}

async function runCase(spec) {
  const runtime = createDialogRuntime();
  const turns = [];
  const prompts = Array.isArray(spec.turns) && spec.turns.length ? spec.turns : [{ user: spec.prompt || "" }];
  for (const item of prompts) {
    const prompt = typeof item === "string" ? item : item.user || item.prompt || "";
    turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false, uiProfile: spec.ui_profile || "mobile" }));
  }

  const final = turns.at(-1) || { answer: "", trace: {} };
  const answer = String(final.answer || "").trim();
  const expect = { ...categoryDefaultExpect(spec.category), ...(spec.expect || {}) };
  const failures = [];

  if (!answer) failures.push("empty_answer");
  if (!includesAny(answer, expect.must_include_any || [])) failures.push("missing_semantic_marker");
  if (!includesNone(answer, expect.must_not_include || [])) failures.push("forbidden_marker");
  if (expect.min_chars && answer.length < expect.min_chars) failures.push(`too_short:${answer.length}`);
  if (expect.max_chars && answer.length > expect.max_chars) failures.push(`too_long:${answer.length}`);
  if (expect.next_action && !NEXT_ACTION.test(answer)) failures.push("missing_next_action");

  const exactCollapse = COLLAPSE_PHRASES.some((phrase) => answer === phrase);
  if (exactCollapse && !expect.allow_collapse) failures.push("exact_collapse_phrase");
  if (IDENTITY_COLLAPSE.test(answer) && !expect.allow_identity) failures.push("identity_collapse");
  if (UNKNOWN_COLLAPSE.test(answer) && !expect.allow_unknown) failures.push("unknown_or_refusal_collapse");
  if (isFallbackRoute(final) && !expect.allow_fallback && !expect.allow_unknown && !expect.allow_boundary) failures.push("fallback_route_for_answerable_prompt");
  if (spec.category === "arithmetic" && (isFallbackRoute(final) || !includesAny(answer, expect.must_include_any || []))) failures.push("arithmetic_not_answered");
  if (spec.category === "contextual_followup" && !includesAny(answer, expect.must_include_any || [])) failures.push("context_ignored");
  if (spec.category === "current_session_memory" && !includesAny(answer, expect.must_include_any || [])) failures.push("session_memory_missed");
  if (["multi_step_task_continuation", "project_maintenance"].includes(spec.category) && expect.next_action && !NEXT_ACTION.test(answer)) {
    failures.push("project_task_no_next_action");
  }
  if (spec.category === "privacy_boundary" && PRIVATE_OVERANSWER.test(answer)) failures.push("private_detail_fabricated");
  if (spec.category === "known_unknowns" && expect.must_stay_uncertain && !UNKNOWN_COLLAPSE.test(answer)) failures.push("unknown_overanswered");

  return {
    id: spec.id,
    category: spec.category,
    ok: failures.length === 0,
    failures,
    prompt: prompts.map((item) => (typeof item === "string" ? item : item.user || item.prompt || "")),
    answer,
    route: final.route || "",
    intent: final.intent || "",
    trace: {
      response_mode: final.trace?.conversation_controller?.response_mode || "",
      question_type: final.trace?.conversation_controller?.question_type || "",
      operation: final.trace?.conversation_controller?.operation || "",
      fallback_firewall: final.trace?.fallback_firewall || null
    }
  };
}

function rate(results, predicate) {
  return results.length ? results.filter(predicate).length / results.length : 0;
}

async function main() {
  const specs = await readJsonl(IN);
  const results = [];
  for (const spec of specs) results.push(await runCase(spec));
  const failures = results.filter((row) => !row.ok);
  const categories = [...new Set(results.map((row) => row.category))].sort();
  const category_scores = Object.fromEntries(
    categories.map((category) => {
      const rows = results.filter((row) => row.category === category);
      return [category, rows.length ? rows.filter((row) => row.ok).length / rows.length : 0];
    })
  );
  const answerable = results.filter((row) => !["known_unknowns", "privacy_boundary", "identity_boundary"].includes(row.category));
  const fallback_overuse_rate = rate(answerable, (row) => row.failures.includes("fallback_route_for_answerable_prompt"));
  const identity_collapse_rate = rate(answerable, (row) => row.failures.includes("identity_collapse"));
  const unknown_collapse_rate = rate(answerable, (row) => row.failures.includes("unknown_or_refusal_collapse"));
  const score = results.length ? results.filter((row) => row.ok).length / results.length : 0;
  const report = {
    ok:
      score >= PASS_THRESHOLD &&
      fallback_overuse_rate <= 0.12 &&
      identity_collapse_rate <= 0.06 &&
      unknown_collapse_rate <= 0.12 &&
      (category_scores.arithmetic || 0) >= 0.8 &&
      (category_scores.contextual_followup || 0) >= 0.66,
    score,
    category_scores,
    fallback_overuse_rate,
    identity_collapse_rate,
    unknown_collapse_rate,
    arithmetic_failures: failures.filter((row) => row.category === "arithmetic"),
    contextual_failures: failures.filter((row) => row.category === "contextual_followup" || row.category === "current_session_memory"),
    project_task_failures: failures.filter((row) => ["multi_step_task_continuation", "project_maintenance"].includes(row.category)),
    examples_failed: failures.slice(0, MAX_FAILED_EXAMPLES),
    prompts_total: results.length,
    pass_threshold: PASS_THRESHOLD,
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
