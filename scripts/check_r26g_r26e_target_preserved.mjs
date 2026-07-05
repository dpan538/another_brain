#!/usr/bin/env node
import {
  R26G_TARGET_PRESERVED_REPORT,
  loadR26ERows,
  originalR26ERowsFromHead,
  writeR26GJson
} from "./r26g_user_answer_utils.mjs";

const ALLOWED_CHANGED_FIELDS = new Set([
  "should_answer",
  "source_should_answer_raw",
  "response_obligation",
  "direct_compliance",
  "valid_nonanswer",
  "metadata_fix_phase",
  "metadata_fix_reason"
]);

async function main() {
  const before = await originalR26ERowsFromHead();
  const after = await loadR26ERows();
  const failures = [];
  if (before.length !== after.length) failures.push({ code: "row_count_changed", before: before.length, after: after.length });
  const rows = [];
  for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
    const oldRow = before[index];
    const newRow = after[index];
    if (!oldRow || !newRow) continue;
    const loc = { index, sample_id: newRow.sample_id || oldRow.sample_id, file: newRow.__file };
    for (const field of ["sample_id", "source_row_id", "question", "target_answer"]) {
      if (oldRow[field] !== newRow[field]) failures.push({ code: `${field}_changed`, ...loc });
    }
    if (Number(newRow.source_row_id) >= 51) failures.push({ code: "old_excluded_source_row_51_100_present", ...loc, source_row_id: newRow.source_row_id });
    const oldComparable = stripRuntime(oldRow);
    const newComparable = stripRuntime(newRow);
    const changed = [];
    for (const key of new Set([...Object.keys(oldComparable), ...Object.keys(newComparable)])) {
      if (JSON.stringify(oldComparable[key]) !== JSON.stringify(newComparable[key])) changed.push(key);
    }
    const forbiddenChanged = changed.filter((field) => !ALLOWED_CHANGED_FIELDS.has(field));
    if (forbiddenChanged.length) failures.push({ code: "forbidden_field_changed", ...loc, fields: forbiddenChanged });
    rows.push({
      sample_id: newRow.sample_id,
      source_row_id: newRow.source_row_id,
      changed_fields: changed,
      should_answer_before: oldRow.should_answer,
      should_answer_after: newRow.should_answer,
      response_obligation_after: newRow.response_obligation
    });
  }
  const report = {
    ok: failures.length === 0,
    phase: "R26G",
    checked_rows: after.length,
    target_answer_preserved: failures.every((failure) => failure.code !== "target_answer_changed"),
    question_preserved: failures.every((failure) => failure.code !== "question_changed"),
    sample_id_order_preserved: failures.every((failure) => failure.code !== "sample_id_changed"),
    source_row_id_preserved: failures.every((failure) => failure.code !== "source_row_id_changed"),
    rows_51_100_present: after.filter((row) => Number(row.source_row_id) >= 51).length,
    rows,
    failures
  };
  await writeR26GJson(R26G_TARGET_PRESERVED_REPORT, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

function stripRuntime(row) {
  const { __file, __line, __expected_split, ...clean } = row;
  return clean;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
