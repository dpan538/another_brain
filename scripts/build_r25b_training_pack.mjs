#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCorpusRows, validateCorpusRows } from "./validate_llm_training_corpus.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = resolve(ROOT, "artifacts/training_os/r25b_llm_training_pack.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/r25b_llm_training_pack_report.json");

function countBy(rows, key) {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}

async function main() {
  const rows = (await loadCorpusRows(ROOT)).map(({ __file, __line, ...row }) => row);
  const validation = validateCorpusRows(rows.map((row, index) => ({ ...row, __file: `${row.split}.jsonl`, __line: index + 1 })));
  if (!validation.ok) {
    console.log(JSON.stringify({ ok: false, validation }, null, 2));
    process.exit(2);
  }

  await mkdir(dirname(PACK), { recursive: true });
  await writeFile(PACK, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  const report = {
    ok: true,
    pack_path: "artifacts/training_os/r25b_llm_training_pack.jsonl",
    committed_source: "training/llm_corpus/",
    artifact_committed: false,
    total_rows: rows.length,
    split_counts: countBy(rows, "split"),
    family_counts: countBy(rows, "task_family"),
    trained_model: false,
    added_model_weights: false,
    called_external_api: false
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
