#!/usr/bin/env node
import { resolve } from "node:path";

import { ARTIFACT_DIR, readJsonl, writeJson } from "./r18_utils.mjs";

const INPUT = resolve(ARTIFACT_DIR, "admitted_reasoning_samples.jsonl");
const REPORT = resolve(ARTIFACT_DIR, "admitted_reasoning_samples_validation_report.json");

const FORBIDDEN = [
  ["local_path", /\/Users\/|\/Volumes\/|\/private\/var\/folders\//],
  ["chain_of_thought_marker", /step by step|therefore.*because.*because|<<|####.*\n/i],
  ["copyright_long_passage", /read the following passage|passage below|article excerpt|story excerpt|quoted passage/i],
  ["source_framing", /according to your|根据你的文件|根据你的数据集/i],
  ["private_contact", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d{1,3}[\s-]\d{3}[\s-]\d{3}[\s-]\d{3,4}/i]
];

function validate(row, index) {
  const errors = [];
  const id = row.id || `row_${index + 1}`;
  for (const field of ["source_id", "source_license", "query", "task_type", "question_type", "operation", "solver_plan", "answer_policy", "risk_label", "bad_answers", "final_answer", "split"]) {
    if (!(field in row)) errors.push(`${id}: missing ${field}`);
  }
  if (!String(row.query || "").trim()) errors.push(`${id}: empty query`);
  if (String(row.query || "").length > 520) errors.push(`${id}: query too long for admitted sample`);
  if (!Array.isArray(row.bad_answers) || row.bad_answers.length === 0) errors.push(`${id}: hard negative required`);
  if (!["train", "dev", "test", "blind"].includes(row.split)) errors.push(`${id}: invalid split`);
  const serialized = JSON.stringify(row);
  for (const [name, re] of FORBIDDEN) {
    if (re.test(serialized)) errors.push(`${id}: forbidden ${name}`);
  }
  return errors;
}

async function main() {
  const rows = await readJsonl(INPUT);
  const errors = rows.flatMap(validate);
  const report = {
    ok: errors.length === 0,
    rows: rows.length,
    by_source: rows.reduce((acc, row) => {
      acc[row.source_id] = (acc[row.source_id] || 0) + 1;
      return acc;
    }, {}),
    splits: rows.reduce((acc, row) => {
      acc[row.split] = (acc[row.split] || 0) + 1;
      return acc;
    }, {}),
    errors
  };
  await writeJson(REPORT, report);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length > 0) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
