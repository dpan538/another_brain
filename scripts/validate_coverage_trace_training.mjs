#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(ROOT, "artifacts/training_os/coverage_trace_training.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/coverage_trace_training_validation_report.json");

const REQUIRED = [
  "id",
  "query",
  "compact_state",
  "domain",
  "task_type",
  "question_type",
  "entities",
  "works",
  "periods",
  "movements",
  "relations",
  "operation",
  "retrieval_plan",
  "coverage_requirement",
  "answer_policy",
  "risk_label",
  "bad_answers",
  "rejection_reason",
  "final_answer",
  "eval_tags"
];

const FORBIDDEN = [
  { name: "local_path", re: /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\/ },
  { name: "source_framing", re: /根据你的文件|根据你的网站|according to your/i },
  { name: "copyright_dump", re: /完整歌词如下|全文如下|原文如下|整首如下/ },
  { name: "private_contact", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\s-]?){9,}/i },
  { name: "raw_private_artifact", re: /Poetry_Collection|Church\.pdf|Deep Research|\.docx/i }
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

function hasBadAnswer(row, pattern) {
  return (row.bad_answers || []).some((answer) => pattern.test(String(answer || "")));
}

function validateRow(row, index) {
  const label = row.id || `row_${index + 1}`;
  const errors = [];
  if (row.__parse_error) return [`${label}: invalid JSON ${row.__parse_error}`];
  for (const field of REQUIRED) if (!(field in row)) errors.push(`${label}: missing ${field}`);
  for (const field of ["query", "task_type", "question_type", "operation", "answer_policy", "risk_label", "rejection_reason", "final_answer"]) {
    if (!String(row[field] || "").trim()) errors.push(`${label}: ${field} must be non-empty`);
  }
  for (const field of ["entities", "works", "periods", "movements", "relations", "bad_answers", "eval_tags"]) {
    if (!Array.isArray(row[field])) errors.push(`${label}: ${field} must be an array`);
  }
  if (!row.coverage_requirement || typeof row.coverage_requirement !== "object") errors.push(`${label}: coverage_requirement must be an object`);
  const serialized = JSON.stringify(row);
  for (const item of FORBIDDEN) {
    if (item.re.test(serialized)) errors.push(`${label}: forbidden ${item.name}`);
  }
  if ((row.bad_answers || []).length === 0) errors.push(`${label}: bad_answers must include fake-coverage negatives`);
  if (/亚洲文学/.test(row.query || "") && !/范围太大|中国|韩国|东亚|不能只答日本|不硬编/.test(row.final_answer || "")) {
    errors.push(`${label}: Asian literature row lacks non-Japan bounded coverage`);
  }
  if (/华语流行|中文流行/.test(row.query || "") && /罗大佑/.test(row.final_answer || "") && !/(李宗盛|邓丽君|崔健|王菲|周杰伦|台湾|香港|大陆|民歌|摇滚)/.test(row.final_answer || "")) {
    errors.push(`${label}: Chinese pop row is Luo-only`);
  }
  if (/日本文学/.test(row.query || "") && /沉默、季节、羞耻/.test(row.final_answer || "")) {
    errors.push(`${label}: Japanese literature mood template`);
  }
  if (row.coverage_requirement?.requires_both_sides && !hasBadAnswer(row, /只回答其中一边|共同点就是|你要问哪一边/)) {
    errors.push(`${label}: compare row missing one-sided bad answer`);
  }
  if (row.coverage_requirement?.requires_chronology && !hasBadAnswer(row, /代表人物就够|孤独的传统|你需要提问/)) {
    errors.push(`${label}: history row missing chronology bad answer`);
  }
  if ((row.coverage_requirement?.min_works || 0) > 0 && !hasBadAnswer(row, /城市、青春和历史|时代怎么进入私人生活|你要问哪一边/)) {
    errors.push(`${label}: list row missing fake works-list bad answer`);
  }
  if (String(row.final_answer || "").length > 620) errors.push(`${label}: final_answer too long`);
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
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length > 0) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
