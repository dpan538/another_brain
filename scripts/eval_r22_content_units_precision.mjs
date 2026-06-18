#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { extractSurfaceContentUnits } from "../web/surface_content_units.js";
import { ROOT } from "./r18_utils.mjs";
import { gitHead, jsonlRows, nowIso, R22_BASELINE_COMMIT, updateR22State } from "./r22_long_cycle_common.mjs";

const IN = resolve(ROOT, "evals/r22_semantic_preservation/content_units_gold.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/r22_content_units_precision_report.json");

function includesAny(actual = [], expected = []) {
  if (!expected.length) return true;
  return expected.some((item) => actual.includes(item));
}

function excludesAll(actual = [], forbidden = []) {
  return forbidden.every((item) => !actual.includes(item));
}

function checkRow(row) {
  const units = extractSurfaceContentUnits({ answer: row.text, query: row.query || "" });
  const failures = [];
  if (!includesAny(units.named_items, row.expected_named_items_any || [])) failures.push("named_item_recall");
  if (!excludesAll(units.named_items, row.forbidden_named_items || [])) failures.push("named_item_false_positive");
  if (!includesAny(units.qualifiers, row.expected_qualifiers_any || [])) failures.push("qualifier_recall");
  if (row.expected_polarity && units.polarity !== row.expected_polarity) failures.push("polarity_error");
  if (!includesAny(units.quantities, row.expected_quantities_any || [])) failures.push("quantity_recall");
  if (!excludesAll(units.quantities, row.forbidden_quantities || [])) failures.push("quantity_false_positive");
  if (!includesAny(units.relation_ids, row.expected_relation_ids || [])) failures.push("relation_recall");
  return { ...row, units, failures, passed: failures.length === 0 };
}

async function main() {
  await updateR22State({ current_phase: "phase3_content_unit_precision" });
  const rows = jsonlRows(await readFile(IN, "utf8"));
  const results = rows.map(checkRow);
  const failures = results.filter((row) => !row.passed);
  const report = {
    execution_ok: true,
    behavior_ok: failures.length === 0,
    audit_only: false,
    baseline_commit: R22_BASELINE_COMMIT,
    evaluated_commit: gitHead(),
    generated_at: nowIso(),
    total: results.length,
    passed: results.filter((row) => row.passed).length,
    failed: failures.length,
    precision_examples: results.filter((row) => row.passed).slice(0, 20),
    false_positives: failures.filter((row) => row.failures.some((failure) => /false_positive/.test(failure))),
    false_negatives: failures.filter((row) => row.failures.some((failure) => /recall/.test(failure))),
    ambiguous_cases: results.filter((row) => /感觉|语境|线索/.test(row.text)).slice(0, 20),
    failures,
    results
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await updateR22State({
    current_phase: "phase3_content_unit_precision_done",
    pending_failures: report.behavior_ok ? [] : [{ phase: "phase3_content_unit_precision", count: failures.length }]
  });
  console.log(JSON.stringify({ behavior_ok: report.behavior_ok, total: report.total, failed: report.failed, out: OUT }, null, 2));
  if (!report.behavior_ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
