#!/usr/bin/env node
import {
  ACTIVE_CORPUS_FILES,
  addCount,
  estimateLanguage,
  exists,
  provenanceKey,
  readJsonlRows,
  splitFromPath,
  writeJson,
  writeText
} from "./r26a_project_utils.mjs";

function rowLanguage(row) {
  return row.language || estimateLanguage([row.target_answer, JSON.stringify(row.messages || [])].join("\n"));
}

async function summarizeFile(path) {
  if (!(await exists(path))) return { path, exists: false, active_status: "not_training" };
  const rows = await readJsonlRows(path);
  const language_counts = {};
  const provenance_counts = {};
  const review_status_counts = {};
  const contains_private_data_counts = {};
  const training_allowed_counts = {};
  const public_commit_allowed_counts = {};
  const transformation_counts = {};
  for (const { row } of rows) {
    addCount(language_counts, rowLanguage(row));
    addCount(provenance_counts, provenanceKey(row));
    addCount(review_status_counts, row.review_status || "unknown");
    addCount(contains_private_data_counts, String(row.contains_private_data));
    addCount(training_allowed_counts, String(row.training_allowed));
    addCount(public_commit_allowed_counts, String(row.public_commit_allowed));
    if (row.transformation_type) addCount(transformation_counts, row.transformation_type);
  }
  const source_type = /r25ak|r25am/.test(path) ? "reviewed_repo_derived" : /r25l/.test(path) ? "r25l_balanced_scaffold" : "base_training_corpus";
  return {
    path,
    exists: true,
    split: splitFromPath(path),
    row_count: rows.length,
    language_counts,
    provenance_counts,
    review_status_counts,
    contains_private_data_counts,
    training_allowed_counts,
    public_commit_allowed_counts,
    transformation_counts,
    source_type,
    active_status: "active_current"
  };
}

async function main() {
  const files = [];
  for (const path of ACTIVE_CORPUS_FILES) files.push(await summarizeFile(path));
  const totals = {
    rows: 0,
    language_counts: {},
    provenance_counts: {},
    review_status_counts: {},
    contains_private_data_counts: {},
    training_allowed_counts: {},
    public_commit_allowed_counts: {}
  };
  for (const file of files.filter((item) => item.exists)) {
    totals.rows += file.row_count;
    for (const [key, value] of Object.entries(file.language_counts)) addCount(totals.language_counts, key, value);
    for (const [key, value] of Object.entries(file.provenance_counts)) addCount(totals.provenance_counts, key, value);
    for (const [key, value] of Object.entries(file.review_status_counts)) addCount(totals.review_status_counts, key, value);
    for (const [key, value] of Object.entries(file.contains_private_data_counts)) addCount(totals.contains_private_data_counts, key, value);
    for (const [key, value] of Object.entries(file.training_allowed_counts)) addCount(totals.training_allowed_counts, key, value);
    for (const [key, value] of Object.entries(file.public_commit_allowed_counts)) addCount(totals.public_commit_allowed_counts, key, value);
  }

  const manifest = {
    schema_version: 1,
    phase: "R26A",
    purpose: "canonical current training corpus manifest without moving corpus files",
    non_destructive: true,
    row_content_modified: false,
    files,
    totals
  };
  await writeJson("training/current/corpus_manifest.json", manifest);

  const trainingStatus = {
    schema_version: 1,
    phase: "R26A",
    product_training_progress_percent: 0,
    formal_decoder_training_progress_percent: 0,
    pilot_training_progress_percent: 8,
    training_readiness_percent_estimate: 87,
    browser_product_completion_estimate: 35,
    phase_4_scaled_training_approved: false,
    model_weights_committed: false,
    release_checkpoint_exists: false,
    current_recommendation: "pause_phase3_training_for_structure_cleanup",
    latest_completed_training_phase: "R25AR",
    latest_required_analysis_phase: "R25AS/R26A",
    next_training_requires_fresh_approval: true,
    r26a_training_ran: false,
    r26a_tokenizer_dry_run_ran: false,
    r26a_corpus_expansion_ran: false
  };
  await writeJson("training/current/training_status.json", trainingStatus);

  await writeJson("training/current/source_policy.json", {
    schema_version: 1,
    phase: "R26A",
    allowed_current_sources: ACTIVE_CORPUS_FILES,
    forbidden_without_future_review: [
      "root DOC/PDF parsing",
      "data/public_ingestion parsing",
      "private_sources reading",
      "eval prompt training",
      "ignored artifact training",
      "external LLM generation"
    ],
    notes: "R26A only references current tracked corpus files in place. It does not move, rewrite, expand, or promote corpus rows."
  });

  await writeText("training/current/README.md", `# Current Training Structure

R26A creates this canonical current-training directory as an index, not as a move operation.

- \`corpus_manifest.json\` references active corpus files in \`training/llm_corpus/\`.
- \`training_status.json\` records that product/formal training remain at 0%, phase_4 is blocked, and any future training needs fresh approval.
- \`source_policy.json\` keeps root DOC/PDF files, \`data/public_ingestion/\`, \`private_sources/\`, ignored artifacts, and eval prompts out of training by default.

No corpus rows were generated, promoted, rewritten, or moved in R26A.
`);

  console.log(JSON.stringify({
    ok: true,
    files: files.filter((item) => item.exists).length,
    total_rows: totals.rows,
    language_counts: totals.language_counts,
    manifest: "training/current/corpus_manifest.json"
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
