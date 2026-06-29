#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const IN_DIR = resolve(ROOT, "training/long_horizon");
const OUT = resolve(ROOT, "artifacts/training_os/long_horizon_task_validation_report.json");
const REQUIRED = [
  "task_id",
  "task_family",
  "difficulty",
  "language",
  "user_goal",
  "initial_context",
  "turns",
  "constraints",
  "expected_behaviors",
  "forbidden_behaviors",
  "scoring_rubric",
  "failure_modes",
  "provenance",
  "review_status"
];
const SOURCE_TYPES = new Set(["human_seed", "synthetic_llm", "repo_derived", "eval_fixture"]);
const CHAIN_KEYS = /chain.?of.?thought|cot|hidden_reasoning|private_reasoning/i;

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return { row: JSON.parse(line), line: index + 1 };
      } catch (error) {
        return { row: null, line: index + 1, parseError: error.message };
      }
    });
}

function walkKeys(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const hits = [];
  for (const [key, nested] of Object.entries(value)) {
    const next = [...path, key];
    if (CHAIN_KEYS.test(key)) hits.push(next.join("."));
    hits.push(...walkKeys(nested, next));
  }
  return hits;
}

function validateRow(row) {
  const failures = [];
  for (const key of REQUIRED) if (!(key in row)) failures.push(`missing:${key}`);
  if (!/^lh_[a-z0-9_]+$/.test(row.task_id || "")) failures.push("bad_task_id");
  if (!["easy", "medium", "hard"].includes(row.difficulty)) failures.push("bad_difficulty");
  if (!["zh-CN", "en", "mixed"].includes(row.language)) failures.push("bad_language");
  if (!Array.isArray(row.turns) || row.turns.length < 2) failures.push("turns_min_2");
  for (const [index, turn] of (row.turns || []).entries()) {
    if (turn?.role !== "user") failures.push(`turn_${index + 1}_role_must_be_user`);
    if (!String(turn?.text || "").trim()) failures.push(`turn_${index + 1}_missing_text`);
  }
  for (const key of ["constraints", "expected_behaviors", "forbidden_behaviors", "failure_modes"]) {
    if (!Array.isArray(row[key]) || row[key].length === 0) failures.push(`${key}_empty`);
  }
  if (!row.scoring_rubric?.final_answer) failures.push("missing_final_answer_rubric");
  const provenance = row.provenance || {};
  if (!SOURCE_TYPES.has(provenance.source_type)) failures.push("bad_source_type");
  if (provenance.source_type === "synthetic_llm" && !provenance.generator_model) failures.push("synthetic_missing_generator_model");
  if (provenance.source_type !== "human_seed" && !provenance.license_or_permission) failures.push("non_human_missing_license");
  if (provenance.contains_private_data !== false) failures.push("contains_private_data_not_false");
  if (walkKeys(row).length) failures.push(`chain_keys:${walkKeys(row).join(",")}`);
  return failures;
}

async function main() {
  const files = (await readdir(IN_DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const results = [];
  for (const file of files) {
    const parsed = await readJsonl(join(IN_DIR, file));
    for (const item of parsed) {
      if (item.parseError) {
        results.push({ file, line: item.line, task_id: "", ok: false, failures: [`parse_error:${item.parseError}`] });
      } else {
        const failures = validateRow(item.row);
        results.push({ file, line: item.line, task_id: item.row.task_id || "", task_family: item.row.task_family || "", ok: failures.length === 0, failures });
      }
    }
  }
  const failed = results.filter((row) => !row.ok);
  const report = {
    ok: failed.length === 0 && results.filter((row) => row.file === "seed_tasks.jsonl").length >= 24 && results.filter((row) => row.file === "heldout_tasks.jsonl").length >= 30,
    tasks_total: results.length,
    files,
    tasks_failed_validation: failed.length,
    family_counts: results.reduce((acc, row) => {
      if (row.task_family) acc[row.task_family] = (acc[row.task_family] || 0) + 1;
      return acc;
    }, {}),
    failures: failed,
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
