#!/usr/bin/env node
import {
  R26F_PHASE,
  R26F_TRACE_REPORT,
  R26F_DOCS,
  buildTraceTable,
  bullets,
  loadR26FEvidence,
  markdownTable,
  writeJsonReport,
  writeMarkdown
} from "./r26f_audit_utils.mjs";

function docFor(report) {
  const zeroRows = report.summary.source_rows_with_zero_promoted_candidates;
  const rowsForTable = report.row_trace.map((row) => [
    row.row_id,
    row.module,
    row.candidate_count,
    row.promoted_count,
    row.rejected_count,
    row.duplicate_rejection_count,
    row.project_meta_rejection_count,
    row.audit_conclusion
  ]);
  return `# R26F R26E Promotion Trace Audit

R26F is audit-only. It does not train, does not run tokenizer dry-run, does not alter corpus files, does not change \`target_answer\`, and does not change R26E metadata. Rows 51-100 from \`another_brain_question_pack_001\` remain excluded except as exclusion metadata. Any correction requires later R26G approval.

## Result

${bullets(report.summary.why_45_rows)}

## Counts

- source rows 1-50: ${report.summary.total_source_rows_1_50}
- R26D candidates: ${report.summary.r26d_candidate_count}
- promoted candidate rows: ${report.summary.promoted_candidate_count}
- promoted unique source_row_id count: ${report.summary.promoted_unique_source_row_id_count}
- source rows represented in promoted corpus: ${report.summary.source_rows_represented_in_promoted_corpus}
- source rows with zero promoted candidates: ${zeroRows.join(", ")}
- duplicate target-answer rejections: ${report.summary.candidates_rejected_as_duplicate}
- project-meta rejections: ${report.summary.candidates_rejected_as_project_meta}
- project-meta affected source rows: ${report.summary.source_rows_affected_by_project_meta.join(", ")}
- rows 51-100 used: ${report.summary.rows_51_100_used}

The 45 promoted rows are 45 unique source rows after candidate-level filtering. This does not mean only 45 first-50 source answers were usable.

## Row Trace

${markdownTable([
  "row",
  "module",
  "candidates",
  "promoted",
  "rejected",
  "dup rejected",
  "project-meta rejected",
  "conclusion"
], rowsForTable)}

## Missing Artifacts

${report.summary.missing_artifacts.length ? bullets(report.summary.missing_artifacts) : "- none"}
`;
}

async function main() {
  const evidence = await loadR26FEvidence();
  const trace = buildTraceTable(evidence);
  const report = {
    ok: !trace.summary.rows_51_100_used,
    phase: R26F_PHASE,
    audit_only: true,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    corpus_promotion_ran: false,
    corpus_mutation_ran: false,
    source_candidate_file_present: evidence.candidates.available,
    promotion_report_present: Boolean(evidence.promotionReport),
    raw_csv_present: evidence.source.available,
    row_trace: trace.rows,
    summary: trace.summary
  };
  await writeJsonReport(R26F_TRACE_REPORT, report);
  await writeMarkdown(R26F_DOCS.trace, docFor(report));
  console.log(JSON.stringify(report.summary, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
