#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = resolve(ROOT, "data/external_sources/open_dataset_registry.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/external_reasoning_trace_training.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/external_reasoning_trace_training_report.json");

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function main() {
  const registry = parseJsonl(await readFile(REGISTRY, "utf8"));
  const reasoning = registry.filter((row) => row.source_type === "reasoning_dataset");
  const admitted = reasoning.filter((row) => row.admission_status === "admitted" && row.license_confidence === "verified");
  const candidates = reasoning.filter((row) => row.admission_status === "candidate");
  const rejected = reasoning.filter((row) => row.admission_status === "rejected");
  const rows = [];

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, "", "utf8");
  const report = {
    ok: true,
    blocked_by_license_gate: admitted.length === 0,
    admitted_reasoning_sources: admitted.length,
    candidate_reasoning_sources: candidates.length,
    rejected_reasoning_sources: rejected.length,
    rows: rows.length,
    splits: { train: 0, dev: 0, test: 0, blind: 0 },
    reason:
      admitted.length === 0
        ? "No reasoning dataset has verified admitted license status; external reasoning traces were not generated."
        : "Admitted reasoning sources are available, but importer implementation is not yet enabled.",
    candidate_source_ids: candidates.map((row) => row.source_id),
    rejected_source_ids: rejected.map((row) => row.source_id),
    raw_corpora_downloaded: false,
    note: "This script intentionally refuses to create external reasoning training rows from candidate or rejected datasets."
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
