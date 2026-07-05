#!/usr/bin/env node
import {
  R26F_CHECK_REPORT,
  R26F_DOCS,
  R26F_NEXT_STEP_REPORT,
  R26F_SCRIPTS,
  R26G_TEMPLATE,
  approvalSafetySummary,
  gitChangedTrainingCorpusFiles,
  loadR26FEvidence,
  readR26FReportsIfPresent,
  stagedForbiddenFiles,
  writeJsonReport
} from "./r26f_audit_utils.mjs";
import {
  exists,
  readJson,
  readJsonIfPresent,
  trackedFiles
} from "./r26a_project_utils.mjs";

async function main() {
  const failures = [];
  for (const path of Object.values(R26F_DOCS)) {
    if (!(await exists(path))) failures.push({ code: "r26f_doc_missing", path });
  }
  for (const path of R26F_SCRIPTS) {
    if (!(await exists(path))) failures.push({ code: "r26f_script_missing", path });
  }
  if (!(await exists(R26F_NEXT_STEP_REPORT))) failures.push({ code: "r26f_recommendation_report_missing", path: R26F_NEXT_STEP_REPORT });

  const changedCorpus = await gitChangedTrainingCorpusFiles();
  for (const path of changedCorpus.all) failures.push({ code: "training_llm_corpus_changed", path });

  const tracked = await trackedFiles();
  if (tracked.includes("private_sources/question_packs/another_brain_question_pack_001_answered.csv")) {
    failures.push({ code: "raw_question_pack_csv_committed" });
  }
  for (const path of tracked.filter((item) => /^private_sources\/.*\.(csv|CSV|xlsx|XLSX)$/.test(item))) {
    failures.push({ code: "private_raw_spreadsheet_committed", path });
  }

  const staged = await stagedForbiddenFiles();
  for (const [category, paths] of Object.entries(staged)) {
    for (const path of paths) failures.push({ code: `${category}_staged`, path });
  }

  const evidence = await loadR26FEvidence();
  const rows51To100Used = [
    ...(evidence.candidates.rows || []),
    ...(evidence.promotedRows || [])
  ].some((row) => Number(row.source_row_id) >= 51);
  if (rows51To100Used) failures.push({ code: "rows_51_100_used_as_candidate_or_promoted" });

  const reports = await readR26FReportsIfPresent();
  for (const [name, report] of Object.entries(reports)) {
    if (name !== "nextStep" && !report) failures.push({ code: "r26f_report_missing", report: name });
  }
  if (reports.trace?.summary?.rows_51_100_used) failures.push({ code: "trace_report_rows_51_100_used" });

  const approval = await approvalSafetySummary();
  if (approval.active_training_approval_count !== 0) failures.push({ code: "active_training_approval", count: approval.active_training_approval_count });
  if (approval.active_tokenizer_dry_run_approval_count !== 0) failures.push({ code: "active_tokenizer_dry_run_approval", count: approval.active_tokenizer_dry_run_approval_count });
  if (approval.active_phase4_training_approval_count !== 0) failures.push({ code: "active_phase4_training_approval", count: approval.active_phase4_training_approval_count });

  const r26g = await readJsonIfPresent(R26G_TEMPLATE);
  if (!r26g) {
    failures.push({ code: "r26g_template_missing", path: R26G_TEMPLATE });
  } else {
    const falseKeys = [
      "approved",
      "allow_metadata_fix",
      "allow_repromotion",
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_corpus_generation",
      "allow_raw_source_commit",
      "allow_candidate_artifact_commit",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training",
      "allow_weight_commit"
    ];
    for (const key of falseKeys) {
      if (r26g[key] !== false) failures.push({ code: "r26g_template_not_inert", key, actual: r26g[key] });
    }
    if (r26g.reviewer !== "") failures.push({ code: "r26g_template_reviewer_not_blank" });
  }

  const report = {
    ok: failures.length === 0,
    audit_only: true,
    r26f_docs_checked: Object.values(R26F_DOCS).length,
    r26f_scripts_checked: R26F_SCRIPTS.length,
    training_llm_corpus_changed_files: changedCorpus.all,
    raw_csv_committed: tracked.includes("private_sources/question_packs/another_brain_question_pack_001_answered.csv"),
    artifacts_staged: staged.artifacts.length,
    private_sources_staged: staged.private_sources.length,
    rows_51_100_used: rows51To100Used,
    active_training_approval_count: approval.active_training_approval_count,
    active_tokenizer_dry_run_approval_count: approval.active_tokenizer_dry_run_approval_count,
    active_phase4_training_approval_count: approval.active_phase4_training_approval_count,
    r26g_template_inert: Boolean(r26g) && failures.every((failure) => !String(failure.code).startsWith("r26g_template")),
    failures
  };
  await writeJsonReport(R26F_CHECK_REPORT, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
