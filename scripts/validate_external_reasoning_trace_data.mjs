#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRAINING = resolve(ROOT, "artifacts/training_os/external_reasoning_trace_training.jsonl");
const BUILD_REPORT = resolve(ROOT, "artifacts/training_os/external_reasoning_trace_training_report.json");
const REPORT = resolve(ROOT, "artifacts/training_os/external_reasoning_trace_validation_report.json");
const FORBIDDEN = /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\|根据你的|according to your|完整歌词|歌词[:：]|passport|visa|bank account|student ID/i;

function parseJsonl(text, failures) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        failures.push({ code: "json_parse_error", line: index + 1, message: error.message });
        return null;
      }
    })
    .filter(Boolean);
}

function validateRow(row, failures, index) {
  const required = [
    "id",
    "source_id",
    "source_license",
    "query",
    "compact_state",
    "domain",
    "task_type",
    "question_type",
    "operation",
    "answer_policy",
    "risk_label",
    "bad_answers",
    "final_answer",
    "split"
  ];
  for (const field of required) {
    if (!(field in row)) failures.push({ code: "missing_field", index, field, id: row.id });
  }
  if (!["train", "dev", "test", "blind"].includes(row.split)) {
    failures.push({ code: "invalid_split", index, id: row.id, split: row.split });
  }
  if (!row.source_license) failures.push({ code: "missing_source_license", index, id: row.id });
  if (!Array.isArray(row.bad_answers)) failures.push({ code: "bad_answers_not_array", index, id: row.id });
  if (FORBIDDEN.test(JSON.stringify(row))) failures.push({ code: "forbidden_content", index, id: row.id });
  if (String(row.final_answer || "").length > 500) failures.push({ code: "final_answer_too_long", index, id: row.id });
}

async function main() {
  const failures = [];
  const reportText = await readFile(BUILD_REPORT, "utf8");
  const buildReport = JSON.parse(reportText);
  const rows = parseJsonl(await readFile(TRAINING, "utf8"), failures);

  rows.forEach((row, index) => validateRow(row, failures, index));
  if (buildReport.admitted_reasoning_sources > 0 && rows.length === 0) {
    failures.push({ code: "missing_rows_for_admitted_reasoning_sources" });
  }
  if (buildReport.admitted_reasoning_sources === 0 && rows.length > 0) {
    failures.push({ code: "rows_present_without_admitted_reasoning_sources" });
  }

  const validation = {
    ok: failures.length === 0,
    blocked_by_license_gate: buildReport.blocked_by_license_gate === true,
    rows: rows.length,
    admitted_reasoning_sources: buildReport.admitted_reasoning_sources,
    candidate_reasoning_sources: buildReport.candidate_reasoning_sources,
    rejected_reasoning_sources: buildReport.rejected_reasoning_sources,
    failures,
    note:
      rows.length === 0 && buildReport.blocked_by_license_gate
        ? "No external reasoning traces were admitted because the license gate has no verified reasoning dataset."
        : "External reasoning traces validated."
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(validation, null, 2), "utf8");
  console.log(JSON.stringify(validation, null, 2));
  process.exit(validation.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
