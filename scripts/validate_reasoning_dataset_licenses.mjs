#!/usr/bin/env node
import { resolve } from "node:path";

import { ARTIFACT_DIR, ROOT, readJsonl, writeJson } from "./r18_utils.mjs";

const INPUT = resolve(ROOT, "data/external_sources/reasoning_dataset_registry.jsonl");
const REPORT = resolve(ARTIFACT_DIR, "r18_reasoning_dataset_license_report.json");

function validate(row, index) {
  const errors = [];
  const id = row.source_id || `row_${index + 1}`;
  for (const field of ["source_id", "name", "homepage_url", "license_confidence", "task_types", "allowed_uses", "admission_status"]) {
    if (!(field in row)) errors.push(`${id}: missing ${field}`);
  }
  if (row.admission_status === "admitted") {
    if (row.license_confidence !== "verified") errors.push(`${id}: admitted source must have verified license`);
    if (!String(row.license_url || "").trim()) errors.push(`${id}: admitted source must have license_url`);
    if (!row.allowed_uses?.training_examples) errors.push(`${id}: admitted source must allow training_examples`);
    if (row.noncommercial_only || row.no_derivatives) errors.push(`${id}: admitted source cannot be NC/ND`);
  }
  if (row.license_confidence === "unclear" && row.admission_status === "admitted") {
    errors.push(`${id}: unclear license cannot be admitted`);
  }
  if (row.admission_status === "rejected" && !String(row.rejection_reason || "").trim()) {
    errors.push(`${id}: rejected source requires rejection_reason`);
  }
  if (/lyrics/i.test(`${row.name} ${row.notes}`)) {
    errors.push(`${id}: lyrics source is not allowed in reasoning registry`);
  }
  return errors;
}

async function main() {
  const rows = await readJsonl(INPUT);
  const errors = rows.flatMap(validate);
  const report = {
    ok: errors.length === 0,
    rows: rows.length,
    admitted: rows.filter((row) => row.admission_status === "admitted").length,
    rejected: rows.filter((row) => row.admission_status === "rejected").length,
    candidate: rows.filter((row) => row.admission_status === "candidate").length,
    by_license: rows.reduce((acc, row) => {
      const key = row.license_name || "missing";
      acc[key] = (acc[key] || 0) + 1;
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

