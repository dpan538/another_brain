#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRAINING_FILES = [
  resolve(ROOT, "artifacts/training_os/persona_method_training_public.jsonl"),
  resolve(ROOT, "artifacts/training_os/r17_personal_runtime_policy_training.jsonl")
];
const REPORT = resolve(ROOT, "artifacts/training_os/persona_method_training_public_validation_report.json");

const REQUIRED = [
  "id",
  "source_id",
  "query",
  "compact_state",
  "retrieved_cards",
  "expected_persona_operation",
  "expected_answer_policy",
  "style_target",
  "privacy_risk",
  "overfit_risk",
  "source_leak_risk",
  "must_include_any",
  "must_not_include",
  "bad_answers",
  "final_answer",
  "split"
];
const RISKS = new Set(["low", "medium", "high"]);
const SPLITS = new Set(["train", "dev", "test", "blind"]);
const FORBIDDEN = /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\|根据你的文件|根据你的网站|according to your file|according to your website|完整歌词|歌词[:：]|passport|visa|bank account|student ID/i;
const BAD_GOOD_BEHAVIOR = /copy exactly|完全模仿|照抄|imitate the source style/i;

function parseJsonl(text, failures, sourceFile) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        failures.push({ code: "json_parse_error", source_file: sourceFile, line: index + 1, message: error.message });
        return null;
      }
    })
    .filter(Boolean);
}

function validate(row, index, failures, sourceFile) {
  for (const field of REQUIRED) {
    if (!(field in row)) failures.push({ code: "missing_field", source_file: sourceFile, index, id: row.id, field });
  }
  for (const field of ["privacy_risk", "overfit_risk", "source_leak_risk"]) {
    if (!RISKS.has(row[field])) failures.push({ code: "invalid_risk", source_file: sourceFile, index, id: row.id, field, value: row[field] });
  }
  if (!SPLITS.has(row.split)) failures.push({ code: "invalid_split", source_file: sourceFile, index, id: row.id, split: row.split });
  for (const field of ["retrieved_cards", "must_include_any", "must_not_include", "bad_answers"]) {
    if (!Array.isArray(row[field])) failures.push({ code: "field_not_array", source_file: sourceFile, index, id: row.id, field });
  }
  if (String(row.id || "").startsWith("r17_personal_policy_") && !Array.isArray(row.internal_session_memory)) {
    failures.push({ code: "missing_internal_session_memory", source_file: sourceFile, index, id: row.id });
  }
  const positiveSurface = JSON.stringify({
    id: row.id,
    query: row.query,
    compact_state: row.compact_state,
    internal_session_memory: row.internal_session_memory,
    retrieved_cards: row.retrieved_cards,
    expected_persona_operation: row.expected_persona_operation,
    expected_answer_policy: row.expected_answer_policy,
    style_target: row.style_target,
    final_answer: row.final_answer
  });
  if (FORBIDDEN.test(positiveSurface)) failures.push({ code: "forbidden_content", source_file: sourceFile, index, id: row.id });
  const goodSurface = `${row.query} ${row.expected_persona_operation} ${row.expected_answer_policy} ${row.style_target} ${row.final_answer}`;
  if (BAD_GOOD_BEHAVIOR.test(goodSurface)) failures.push({ code: "encourages_overfit", source_file: sourceFile, index, id: row.id });
  if (/private memory|user identity/i.test(row.final_answer) && !/not private memory|outside persona|not .*user identity/i.test(row.final_answer)) {
    failures.push({ code: "persona_overreach", source_file: sourceFile, index, id: row.id });
  }
  if (String(row.final_answer || "").length > 500) failures.push({ code: "final_answer_too_long", source_file: sourceFile, index, id: row.id });
  if (row.source_leak_risk !== "low" && !row.must_not_include.some((item) => /according|根据|file|website/i.test(item))) {
    failures.push({ code: "missing_source_leak_guard", source_file: sourceFile, index, id: row.id });
  }
}

async function main() {
  const failures = [];
  const loadedFiles = [];
  const rows = [];
  for (const file of TRAINING_FILES) {
    if (!existsSync(file)) continue;
    const relative = file.replace(`${ROOT}/`, "");
    loadedFiles.push(relative);
    rows.push(...parseJsonl(await readFile(file, "utf8"), failures, relative));
  }
  rows.forEach((row, index) => validate(row, index, failures, row.id?.startsWith("r17_personal_policy_") ? "r17_personal_runtime_policy_training" : "persona_method_training_public"));
  const bySplit = rows.reduce((acc, row) => {
    acc[row.split] = (acc[row.split] || 0) + 1;
    return acc;
  }, {});
  for (const split of SPLITS) {
    if (!bySplit[split]) failures.push({ code: "missing_split", split });
  }
  const report = {
    ok: failures.length === 0,
    rows: rows.length,
    loaded_files: loadedFiles,
    by_split: bySplit,
    runtime_policy_rows: rows.filter((row) => String(row.id || "").startsWith("r17_personal_policy_")).length,
    source_leak_risk_rows: rows.filter((row) => ["medium", "high"].includes(row.source_leak_risk)).length,
    failures
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
