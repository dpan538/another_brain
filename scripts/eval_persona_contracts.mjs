#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_DIR = resolve(ROOT, "evals/persona");
const OUT = resolve(ROOT, "artifacts/training_os/persona_contract_report.json");

const REQUIRED_FIELDS = [
  "prompt",
  "compact_state",
  "retrieved_cards",
  "expected_persona_operation",
  "expected_answer_policy",
  "must_include_any",
  "must_not_include",
  "forbidden_phrases_from_sources",
  "forbidden_identity_claims",
  "forbidden_source_framing",
  "privacy_risk",
  "overfit_risk",
  "acceptable_answer_shape",
  "notes"
];

const VALID_RISKS = new Set(["low", "medium", "high"]);
const MIN_CASES_PER_FILE = 5;

function parseArgs(argv) {
  const args = { strict: false };
  for (const item of argv) {
    if (item === "--strict") args.strict = true;
    else if (item === "--help" || item === "-h") {
      console.log("Usage: node scripts/eval_persona_contracts.mjs [--strict]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  return args;
}

async function jsonlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => resolve(dir, entry.name))
    .sort();
}

async function loadJsonl(file) {
  const content = await readFile(file, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { row: JSON.parse(line), line: index + 1 };
      } catch (error) {
        return { error: `${file}:${index + 1}: ${error.message}`, line: index + 1 };
      }
    });
}

function arrayField(row, field) {
  return Array.isArray(row[field]) ? row[field] : [];
}

function hasGuard(row) {
  return (
    arrayField(row, "must_not_include").length > 0 ||
    arrayField(row, "forbidden_phrases_from_sources").length > 0 ||
    arrayField(row, "forbidden_identity_claims").length > 0 ||
    arrayField(row, "forbidden_source_framing").length > 0
  );
}

function validateRow(fileName, row, line) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in row)) errors.push({ file: fileName, line, check: "missing_field", field });
  }

  for (const field of [
    "retrieved_cards",
    "must_include_any",
    "must_not_include",
    "forbidden_phrases_from_sources",
    "forbidden_identity_claims",
    "forbidden_source_framing"
  ]) {
    if (field in row && !Array.isArray(row[field])) {
      errors.push({ file: fileName, line, check: "field_not_array", field });
    }
  }

  if (row.compact_state && typeof row.compact_state !== "object") {
    errors.push({ file: fileName, line, check: "compact_state_not_object" });
  }

  if (!VALID_RISKS.has(row.privacy_risk)) {
    errors.push({ file: fileName, line, check: "invalid_privacy_risk", actual: row.privacy_risk });
  }
  if (!VALID_RISKS.has(row.overfit_risk)) {
    errors.push({ file: fileName, line, check: "invalid_overfit_risk", actual: row.overfit_risk });
  }

  if (row.privacy_risk === "high" && !hasGuard(row)) {
    errors.push({ file: fileName, line, check: "high_privacy_missing_guard" });
  }

  if (fileName === "source_leak.jsonl" && arrayField(row, "forbidden_source_framing").length === 0) {
    errors.push({ file: fileName, line, check: "source_leak_missing_forbidden_source_framing" });
  }

  if (fileName === "anti_overfit.jsonl" && !arrayField(row, "must_not_include").length && !arrayField(row, "forbidden_phrases_from_sources").length) {
    errors.push({ file: fileName, line, check: "anti_overfit_missing_negative_constraints" });
  }

  if (fileName === "reasoning_with_persona.jsonl" && arrayField(row, "must_not_include").length === 0) {
    errors.push({ file: fileName, line, check: "reasoning_missing_persona_override_guard" });
  }

  return errors;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await jsonlFiles(EVAL_DIR);
  const fileReports = [];
  const schemaErrors = [];
  let totalCases = 0;
  let privacyHighCount = 0;
  let overfitHighCount = 0;
  let sourceLeakGuardCount = 0;
  let forbiddenIdentityGuardCount = 0;
  const filesUnderMinimumCount = [];

  for (const file of files) {
    const fileName = file.split("/").pop();
    const parsed = await loadJsonl(file);
    const rows = [];
    for (const item of parsed) {
      if (item.error) {
        schemaErrors.push({ file: fileName, line: item.line, check: "invalid_json", error: item.error });
        continue;
      }
      rows.push(item);
    }
    if (rows.length < MIN_CASES_PER_FILE) filesUnderMinimumCount.push({ file: fileName, count: rows.length });
    totalCases += rows.length;

    for (const { row, line } of rows) {
      if (row.privacy_risk === "high") privacyHighCount += 1;
      if (row.overfit_risk === "high") overfitHighCount += 1;
      if (arrayField(row, "forbidden_source_framing").length) sourceLeakGuardCount += 1;
      if (arrayField(row, "forbidden_identity_claims").length) forbiddenIdentityGuardCount += 1;
      schemaErrors.push(...validateRow(fileName, row, line));
    }

    fileReports.push({ file: fileName, cases: rows.length });
  }

  const summary = {
    total_files: files.length,
    total_cases: totalCases,
    schema_errors: schemaErrors.length,
    privacy_high_count: privacyHighCount,
    overfit_high_count: overfitHighCount,
    source_leak_guard_count: sourceLeakGuardCount,
    forbidden_identity_guard_count: forbiddenIdentityGuardCount,
    files_under_minimum_count: filesUnderMinimumCount,
    report_path: OUT
  };

  const report = {
    ok: schemaErrors.length === 0 && filesUnderMinimumCount.length === 0,
    mode: args.strict ? "strict" : "report-only",
    generated_at: new Date().toISOString(),
    summary,
    files: fileReports,
    schema_errors: schemaErrors
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(args.strict && !report.ok ? 2 : 0);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
