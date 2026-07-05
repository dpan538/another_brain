#!/usr/bin/env node
import {
  R26G_FILES,
  R26G_VALIDATION_REPORT,
  hasForbiddenString,
  loadR26GRows,
  rawSourcesTracked,
  stagedForbiddenR26GFiles,
  writeR26GJson
} from "./r26g_user_answer_utils.mjs";
import { exists } from "./r26a_project_utils.mjs";
import { normalizeTarget } from "./r26e_user_answer_promotion_utils.mjs";

async function main() {
  const failures = [];
  for (const path of Object.values(R26G_FILES)) {
    if (!(await exists(path))) failures.push({ code: "r26g_corpus_file_missing", path });
  }
  const rows = await loadR26GRows();
  const targets = new Set();
  const sampleIds = new Set();
  for (const row of rows) {
    const loc = { file: row.__file, line: row.__line, sample_id: row.sample_id };
    if (row.split !== row.__expected_split) failures.push({ code: "split_file_mismatch", ...loc, split: row.split });
    if (sampleIds.has(row.sample_id)) failures.push({ code: "duplicate_sample_id", ...loc });
    sampleIds.add(row.sample_id);
    const target = normalizeTarget(row.target_answer);
    if (!target) failures.push({ code: "empty_target_answer", ...loc });
    if (targets.has(target)) failures.push({ code: "duplicate_target_answer", ...loc });
    targets.add(target);
    if (row.pack_id === "another_brain_question_pack_002_abstract_values") {
      if (Number(row.source_row_id) < 1 || Number(row.source_row_id) > 50) failures.push({ code: "replacement_source_row_not_1_50", ...loc });
      if (Number(row.display_id) < 51 || Number(row.display_id) > 100) failures.push({ code: "replacement_display_id_not_51_100", ...loc });
      if (row.replacement_for_pack_id !== "another_brain_question_pack_001") failures.push({ code: "replacement_for_pack_id_missing", ...loc });
    } else if (row.pack_id === "another_brain_question_pack_001") {
      if (Number(row.source_row_id) >= 51) failures.push({ code: "old_excluded_pack001_row_51_100_promoted", ...loc });
      if (![2, 29, 47].includes(Number(row.source_row_id))) failures.push({ code: "unexpected_recovered_first50_row", ...loc, source_row_id: row.source_row_id });
    } else {
      failures.push({ code: "unexpected_pack_id", ...loc, pack_id: row.pack_id });
    }
    if (row.answer_as !== "user_self") failures.push({ code: "answer_as_not_user_self", ...loc });
    if (row.should_answer !== true) failures.push({ code: "should_answer_not_true", ...loc });
    if (row.response_obligation !== "produce_response") failures.push({ code: "response_obligation_not_produce_response", ...loc });
    if (row.review_status !== "reviewed_for_training_corpus") failures.push({ code: "review_status_not_reviewed", ...loc });
    if (row.training_allowed !== true) failures.push({ code: "training_allowed_not_true", ...loc });
    if (row.public_commit_allowed !== true) failures.push({ code: "public_commit_allowed_not_true", ...loc });
    if (row.contains_private_data !== false) failures.push({ code: "contains_private_data_not_false", ...loc });
    if (row.provenance?.source_type !== "user_answered") failures.push({ code: "provenance_source_type_not_user_answered", ...loc });
    if (row.provenance?.external_llm_used !== false) failures.push({ code: "external_llm_used_not_false", ...loc });
    if (row.provenance?.promotion_phase !== "R26G") failures.push({ code: "promotion_phase_not_r26g", ...loc });
    if (row.release_checkpoint === true) failures.push({ code: "release_checkpoint_true", ...loc });
    if (row.product_model === true) failures.push({ code: "product_model_true", ...loc });
    if (hasForbiddenString(row)) failures.push({ code: "forbidden_private_or_cot_string", ...loc });
  }
  const oldExcluded = rows.filter((row) => row.pack_id === "another_brain_question_pack_001" && Number(row.source_row_id) >= 51);
  if (oldExcluded.length) failures.push({ code: "old_excluded_question_pack_001_51_100_present", count: oldExcluded.length });
  const rawTracked = (await rawSourcesTracked()).filter((path) => path.startsWith("private_sources/"));
  for (const path of rawTracked) failures.push({ code: "raw_private_source_committed", path });
  const staged = await stagedForbiddenR26GFiles();
  for (const [category, paths] of Object.entries(staged)) {
    for (const path of paths) failures.push({ code: `${category}_staged`, path });
  }
  const report = {
    ok: failures.length === 0,
    phase: "R26G",
    promoted_rows_checked: rows.length,
    split_counts: countBy(rows, "split"),
    replacement_rows: rows.filter((row) => row.pack_id === "another_brain_question_pack_002_abstract_values").length,
    recovered_first50_rows: rows.filter((row) => row.pack_id === "another_brain_question_pack_001").map((row) => row.source_row_id),
    old_excluded_question_pack_001_rows_51_100_present: oldExcluded.length,
    raw_private_sources_tracked: rawTracked.length,
    artifacts_staged: staged.artifacts.length,
    private_sources_staged: staged.private_sources.length,
    failures
  };
  await writeR26GJson(R26G_VALIDATION_REPORT, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) out[String(row[key] ?? "unknown")] = (out[String(row[key] ?? "unknown")] || 0) + 1;
  return out;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
