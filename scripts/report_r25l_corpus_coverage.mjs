#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/r25l_corpus_expansion_config.json";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function readRows(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = row[key];
    if (Array.isArray(value)) {
      for (const item of value) out[item] = (out[item] || 0) + 1;
    } else {
      out[value] = (out[value] || 0) + 1;
    }
  }
  return out;
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const rows = [
    ...(await readRows(config.outputs.train)),
    ...(await readRows(config.outputs.dev)),
    ...(await readRows(config.outputs.heldout))
  ];
  const splitCounts = countBy(rows, "split");
  const targetChars = rows.reduce((sum, row) => sum + String(row.target_answer || "").length, 0);
  const rejectedRows = rows.filter((row) => Array.isArray(row.rejected_answers) && row.rejected_answers.length > 0).length;
  const multiTurnRows = rows.filter((row) => Array.isArray(row.messages) && row.messages.length > 1).length;
  const retrievalRows = rows.filter((row) => Array.isArray(row.retrieved_evidence) && row.retrieved_evidence.length > 0).length;
  const report = {
    ok: rows.length >= config.target_total_rows &&
      (splitCounts.train || 0) >= config.train_rows &&
      (splitCounts.dev || 0) >= config.dev_rows &&
      (splitCounts.heldout || 0) >= config.heldout_rows,
    total_rows: rows.length,
    split_counts: splitCounts,
    family_counts: countBy(rows, "task_family"),
    language_counts: countBy(rows, "language"),
    task_type_counts: countBy(rows, "task_type"),
    policy_tag_counts: countBy(rows.flatMap((row) => row.policy_tags || []).map((tag) => ({ tag })), "tag"),
    avg_target_chars: rows.length ? Math.round((targetChars / rows.length) * 10) / 10 : 0,
    rejected_answer_coverage: rows.length ? rejectedRows / rows.length : 0,
    multi_turn_coverage: rows.length ? multiTurnRows / rows.length : 0,
    retrieval_grounded_coverage: rows.length ? retrievalRows / rows.length : 0,
    notes: [
      "R25L corpus is deterministic and project-authored.",
      "Rows are split into train/dev/heldout and remain separate from eval data.",
      "Coverage reports planning readiness only; no formal decoder training runs."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
