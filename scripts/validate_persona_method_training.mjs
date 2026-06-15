#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRAINING = resolve(ROOT, "artifacts/training_os/persona_method_training_public.jsonl");
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

function validate(row, index, failures) {
  for (const field of REQUIRED) {
    if (!(field in row)) failures.push({ code: "missing_field", index, id: row.id, field });
  }
  for (const field of ["privacy_risk", "overfit_risk", "source_leak_risk"]) {
    if (!RISKS.has(row[field])) failures.push({ code: "invalid_risk", index, id: row.id, field, value: row[field] });
  }
  if (!SPLITS.has(row.split)) failures.push({ code: "invalid_split", index, id: row.id, split: row.split });
  for (const field of ["retrieved_cards", "must_include_any", "must_not_include", "bad_answers"]) {
    if (!Array.isArray(row[field])) failures.push({ code: "field_not_array", index, id: row.id, field });
  }
  const positiveSurface = JSON.stringify({
    id: row.id,
    query: row.query,
    compact_state: row.compact_state,
    retrieved_cards: row.retrieved_cards,
    expected_persona_operation: row.expected_persona_operation,
    expected_answer_policy: row.expected_answer_policy,
    style_target: row.style_target,
    final_answer: row.final_answer
  });
  if (FORBIDDEN.test(positiveSurface)) failures.push({ code: "forbidden_content", index, id: row.id });
  const goodSurface = `${row.query} ${row.expected_persona_operation} ${row.expected_answer_policy} ${row.style_target} ${row.final_answer}`;
  if (BAD_GOOD_BEHAVIOR.test(goodSurface)) failures.push({ code: "encourages_overfit", index, id: row.id });
  if (/private memory|user identity/i.test(row.final_answer) && !/not private memory|outside persona|not .*user identity/i.test(row.final_answer)) {
    failures.push({ code: "persona_overreach", index, id: row.id });
  }
  if (String(row.final_answer || "").length > 500) failures.push({ code: "final_answer_too_long", index, id: row.id });
  if (row.source_leak_risk !== "low" && !row.must_not_include.some((item) => /according|根据|file|website/i.test(item))) {
    failures.push({ code: "missing_source_leak_guard", index, id: row.id });
  }
}

async function main() {
  const failures = [];
  const rows = parseJsonl(await readFile(TRAINING, "utf8"), failures);
  rows.forEach((row, index) => validate(row, index, failures));
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
    by_split: bySplit,
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
