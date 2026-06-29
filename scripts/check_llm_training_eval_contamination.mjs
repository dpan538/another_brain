#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { loadCorpusRows } from "./validate_llm_training_corpus.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_SOURCES = [
  "evals/r24_intelligence_recovery/prompts.jsonl",
  "evals/r24d_heldout_recovery/prompts.jsonl",
  "evals/r25_static_llm_admission/prompts.jsonl",
  "training/long_horizon/seed_tasks.jsonl",
  "training/long_horizon/heldout_tasks.jsonl"
];

function normalize(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

async function readJsonl(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

async function main() {
  const failures = [];
  const evalStrings = new Map();
  for (const source of EVAL_SOURCES) {
    for (const row of await readJsonl(source)) {
      for (const text of collectStrings(row).map(normalize).filter((value) => value.length >= 8)) {
        if (!evalStrings.has(text)) evalStrings.set(text, []);
        evalStrings.get(text).push(source);
      }
    }
  }

  const rows = await loadCorpusRows(ROOT);
  for (const row of rows) {
    const loc = { sample_id: row.sample_id, split: row.split };
    const corpusStrings = [
      row.user_goal,
      row.target_answer,
      ...(Array.isArray(row.messages) ? row.messages.map((message) => message.content) : [])
    ].map(normalize).filter((value) => value.length >= 8);
    for (const text of corpusStrings) {
      if (evalStrings.has(text)) {
        failures.push({ code: "exact_eval_text_leakage", ...loc, sources: evalStrings.get(text), text });
      }
    }
  }

  const heldoutFingerprints = new Set(
    rows
      .filter((row) => row.split === "heldout")
      .map((row) => normalize(`${row.task_family} ${row.user_goal} ${row.target_answer}`))
  );
  for (const row of rows.filter((item) => item.split === "train" || item.split === "dev")) {
    const fingerprint = normalize(`${row.task_family} ${row.user_goal} ${row.target_answer}`);
    if (heldoutFingerprints.has(fingerprint)) {
      failures.push({ code: "heldout_leakage_into_train_or_dev", sample_id: row.sample_id, split: row.split });
    }
  }

  const report = {
    ok: failures.length === 0,
    corpus_rows_checked: rows.length,
    eval_sources_checked: EVAL_SOURCES,
    eval_text_snippets_checked: evalStrings.size,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
