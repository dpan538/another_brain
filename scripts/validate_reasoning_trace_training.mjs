#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(ROOT, "artifacts/training_os/reasoning_trace_training.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/reasoning_trace_training_validation_report.json");

const REQUIRED = [
  "id",
  "query",
  "compact_state",
  "domain",
  "task_type",
  "question_type",
  "operation",
  "retrieval_plan",
  "solver_plan",
  "answer_policy",
  "risk_label",
  "template_id",
  "draft_answer",
  "bad_answers",
  "rejection_reason",
  "final_answer",
  "eval_tags"
];

const FORBIDDEN = [
  { name: "local_path", re: /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\/ },
  { name: "source_framing", re: /根据你的文件|根据你的网站|according to your file|according to your website/i },
  { name: "lyrics_or_long_quote_marker", re: /完整歌词如下|全文如下|原文如下|整首如下/ },
  { name: "raw_pdf_text_marker", re: /Poetry_Collection|Church\.pdf|Deep Research|\.docx/i },
  { name: "private_contact", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\s-]?){9,}/i }
];

async function loadRows() {
  const text = await readFile(INPUT, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { __parse_error: `${index + 1}: ${error.message}` };
      }
    });
}

function isCulture(row) {
  return /culture|music|literature|philosophy|poetry/.test(`${row.task_type} ${row.domain}`);
}

function isSolver(row) {
  return /arithmetic|syllogism|transitive|set_quantifier|weekday/.test(`${row.task_type} ${row.question_type} ${row.operation}`);
}

function validateRow(row, index) {
  const errors = [];
  const label = row.id || `row_${index + 1}`;
  if (row.__parse_error) return [`${label}: invalid JSON ${row.__parse_error}`];
  for (const field of REQUIRED) {
    if (!(field in row)) errors.push(`${label}: missing ${field}`);
  }
  for (const field of ["task_type", "question_type", "operation", "answer_policy", "risk_label", "template_id"]) {
    if (!String(row[field] || "").trim()) errors.push(`${label}: ${field} must be non-empty`);
  }
  if (!Array.isArray(row.bad_answers)) errors.push(`${label}: bad_answers must be an array`);
  if (Array.isArray(row.bad_answers) && row.bad_answers.length === 0 && !/(copyright|privacy)/.test(row.risk_label || "")) {
    errors.push(`${label}: bad_answers required for non-hard-refusal cases`);
  }
  if (isSolver(row) && (!row.solver_plan || Object.keys(row.solver_plan).length === 0)) {
    errors.push(`${label}: solver_plan required for solver cases`);
  }
  if (isCulture(row) && (!row.retrieval_plan || Object.keys(row.retrieval_plan).length === 0)) {
    errors.push(`${label}: retrieval_plan required for culture cases`);
  }
  if (!["none", "copyright", "privacy", "unknown"].includes(row.risk_label)) {
    errors.push(`${label}: invalid risk_label ${row.risk_label}`);
  }
  const serialized = JSON.stringify(row);
  for (const pattern of FORBIDDEN) {
    if (pattern.re.test(serialized)) errors.push(`${label}: forbidden ${pattern.name}`);
  }
  if (String(row.final_answer || "").length > 520 && !/explanatory/.test(row.answer_policy || "")) {
    errors.push(`${label}: final_answer too long`);
  }
  if (/exact_answer|answerIndex|near_match/i.test(row.template_id || "")) {
    errors.push(`${label}: answerIndex-style exact-answer template id`);
  }
  if (row.risk_label !== "privacy" && /private|PDF-derived|uploaded_pdf/i.test(serialized)) {
    errors.push(`${label}: private/PDF marker outside privacy row`);
  }
  return errors;
}

async function main() {
  const rows = await loadRows();
  const errors = rows.flatMap(validateRow);
  const report = {
    ok: errors.length === 0,
    rows: rows.length,
    errors,
    risk_counts: rows.reduce((acc, row) => {
      if (!row.__parse_error) acc[row.risk_label] = (acc[row.risk_label] || 0) + 1;
      return acc;
    }, {})
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length > 0) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
