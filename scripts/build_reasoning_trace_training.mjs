#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CULTURE_CARDS } from "../web/culture_cards.generated.js";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/reasoning_trace_training.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/reasoning_trace_training_report.json");

const SOURCES = [
  resolve(ROOT, "evals/r9_regression/culture_reasoning_regression.jsonl"),
  resolve(ROOT, "evals/r10_culture"),
  resolve(ROOT, "evals/r11_reasoning")
];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

async function loadSource(source) {
  if (source.endsWith(".jsonl")) {
    return (await loadJsonl(source)).map((item) => ({ ...item, source: source.replace(`${ROOT}/`, "") }));
  }
  const files = (await readdir(source)).filter((name) => name.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) {
    rows.push(...(await loadJsonl(join(source, file))).map((item) => ({ ...item, source: join(source.replace(`${ROOT}/`, ""), file) })));
  }
  return rows;
}

function seedRuntime(compactState = {}) {
  const runtime = createDialogRuntime();
  runtime.dialogState = { ...runtime.dialogState, ...compactState };
  runtime.contextTurns = safeArray(compactState.recentTurns).map((turn) => ({ ...turn }));
  return runtime;
}

function riskLabel(spec) {
  const prompt = spec.prompt || "";
  if (spec.privacy_boundary || /(身份证|手机号|住址|地址|私人|我是谁|真实姓名)/.test(prompt)) return "privacy";
  if (spec.copyright_boundary || /(歌词|原文|整首|全文|逐句翻译|一大段)/.test(prompt)) return "copyright";
  if (/不知道|没见过|资料里没有/.test(prompt)) return "unknown";
  return "none";
}

function taskType(spec) {
  return spec.expected_task_type || (spec.expected_domain ? "culture" : "reasoning");
}

function questionType(spec) {
  return spec.expected_question_type || spec.expected_question_type || "unspecified";
}

function answerPolicy(spec) {
  return spec.expected_answer_policy || (spec.copyright_boundary ? "refuse_long_copyright" : "supported_short_answer");
}

function matchedCultureCards(prompt, compactState = {}) {
  const text = `${prompt} ${compactState.last_focus_entity_id || ""} ${safeArray(compactState.last_mentions).join(" ")}`;
  const matches = [];
  for (const card of CULTURE_CARDS) {
    if (text.includes(card.id) || safeArray(card.names).some((name) => name && text.includes(name))) {
      matches.push(card.id);
    }
  }
  return [...new Set(matches)].slice(0, 8);
}

function solverPlan(spec) {
  const solver = spec.expected_solver || "";
  if (solver) return { solver, expected_result: spec.expected_solver_result || {} };
  const op = spec.expected_operation || "";
  const qType = spec.expected_question_type || "";
  const task = spec.expected_task_type || "";
  const combined = `${op} ${qType} ${task}`;
  if (/arithmetic|apple|syllogism|transitive|comparison|set_quantifier|weekday|logic|order_graph/.test(combined)) {
    const inferred = /syllogism|logic/.test(combined)
      ? "syllogism"
      : /transitive|comparison|order_graph/.test(combined)
        ? "transitive_comparison"
        : /set_quantifier/.test(combined)
          ? "set_quantifier"
          : /weekday/.test(combined)
            ? "weekday_offset"
            : "arithmetic";
    return { solver: inferred, expected_result: spec.expected_solver_result || {} };
  }
  return {};
}

function retrievalPlan(spec, cardIds) {
  const domain = spec.expected_domain || "";
  const task = taskType(spec);
  if (/culture|music|literature|philosophy|poetry/.test(`${domain} ${task}`)) {
    return { source: "culture_cards", domain, card_ids: cardIds };
  }
  return {};
}

function sanitizeBadAnswer(text) {
  const value = String(text || "");
  if (!value) return "";
  if (/\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\/.test(value)) return "local_absolute_path_leak";
  if (/根据你的文件|根据你的网站|according to your/i.test(value)) return "source_framing_leak";
  if (/完整歌词如下|全文如下|原文如下|整首如下|池塘边|啦啦/.test(value)) return "copyrighted_text_reproduction";
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) return "private_contact_leak";
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function badAnswers(spec) {
  const bad = [
    ...safeArray(spec.unacceptable_answers),
    ...safeArray(spec.must_not_include),
    spec.candidate_answer || ""
  ].map(sanitizeBadAnswer).filter(Boolean);
  if (bad.length > 0) return [...new Set(bad)].slice(0, 8);
  const risk = riskLabel(spec);
  if (risk === "copyright") return ["完整歌词如下", "全文如下"];
  if (risk === "privacy") return ["我知道你的私人身份", "你的地址是"];
  if (/culture/.test(taskType(spec)) || spec.expected_domain) return ["你需要提问。", "你要问哪一边？"];
  return ["未验证的猜测答案"];
}

function entitiesFromCardIds(cardIds) {
  return cardIds.filter((id) => id.startsWith("person.") || id.startsWith("concept.") || id.startsWith("period.") || id.startsWith("method."));
}

function worksFromCardIds(cardIds) {
  return cardIds.filter((id) => id.startsWith("work."));
}

async function main() {
  const specs = (await Promise.all(SOURCES.map(loadSource))).flat();
  const rows = [];
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    const runtime = seedRuntime(spec.compact_state || {});
    const turn = await answerDialogPrompt(spec.prompt, runtime, { withThinkingDelay: false });
    const cardIds = matchedCultureCards(spec.prompt, spec.compact_state || {});
    const task = taskType(spec);
    const qType = questionType(spec);
    rows.push({
      id: spec.id || `trace_${String(index + 1).padStart(4, "0")}`,
      query: spec.prompt || "",
      compact_state: spec.compact_state || {},
      domain: spec.expected_domain || "",
      task_type: task,
      question_type: qType,
      referent: cardIds[0] || spec.compact_state?.last_focus_entity_id || "",
      entities: entitiesFromCardIds(cardIds),
      works: worksFromCardIds(cardIds),
      relations: [],
      operation: spec.expected_operation || turn.trace?.context_action || "",
      retrieval_plan: retrievalPlan(spec, cardIds),
      solver_plan: solverPlan(spec),
      answer_policy: answerPolicy(spec),
      risk_label: riskLabel(spec),
      template_id: `${task}.${qType}`,
      draft_answer: turn.trace?.raw_answer || turn.answer || "",
      bad_answers: badAnswers(spec),
      rejection_reason: spec.candidate_answer ? "candidate_answer_must_be_verified" : "",
      final_answer: turn.answer || "",
      eval_tags: [spec.source || "", spec.expected_solver || "", spec.expected_domain || "", riskLabel(spec)].filter(Boolean)
    });
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const report = {
    generated_at: new Date().toISOString(),
    rows: rows.length,
    sources: SOURCES.map((source) => source.replace(`${ROOT}/`, "")),
    risk_counts: rows.reduce((acc, row) => {
      acc[row.risk_label] = (acc[row.risk_label] || 0) + 1;
      return acc;
    }, {}),
    out: OUT.replace(`${ROOT}/`, "")
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
