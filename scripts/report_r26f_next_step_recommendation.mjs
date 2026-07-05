#!/usr/bin/env node
import {
  R26F_DOCS,
  R26F_NEXT_STEP_REPORT,
  bullets,
  markdownTable,
  readR26FReportsIfPresent,
  writeJsonReport,
  writeMarkdown
} from "./r26f_audit_utils.mjs";

function chooseRecommendation(reports) {
  const reviewRows = reports.projectMeta?.keep_or_review_source_rows || [];
  if (reviewRows.length) return "manual_review_needed";
  if (reports.shouldAnswer?.diagnosis === "blank_optional_should_answer_values_were_mapped_to_false") return "metadata_fix_later";
  if ((reports.trace?.summary?.source_rows_with_zero_promoted_candidates || []).length) return "re_promotion_review_later";
  return "keep_r26e_as_is";
}

function docFor(report) {
  return `# R26F Next Step Recommendation

R26F is audit-only. It does not train, run tokenizer dry-run, expand corpus, promote corpus rows, mutate \`training/llm_corpus\`, change \`target_answer\`, or change R26E metadata. Rows 51-100 remain excluded. Any correction requires later R26G approval.

## Recommendation

- recommendation: ${report.recommendation}
- training approved now: ${report.training_approved_now}
- corpus mutation approved now: ${report.corpus_mutation_approved_now}
- safe next step: ${report.safe_next_step}

## Why R26E Promoted 45 Rows

${bullets(report.why_45_rows)}

## Source Rows With Zero Promoted Candidates

${report.source_rows_zero_promoted.length ? markdownTable(["row"], report.source_rows_zero_promoted.map((row) => [row])) : "none"}

## Likely Parser Bugs

${report.likely_parser_bugs.length ? bullets(report.likely_parser_bugs) : "- none"}

## Must Not Do

${bullets(report.must_not_do)}
`;
}

async function main() {
  const reports = await readR26FReportsIfPresent();
  const missing = Object.entries(reports)
    .filter(([key, value]) => key !== "nextStep" && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`missing R26F prerequisite reports: ${missing.join(", ")}`);
  }
  const recommendation = chooseRecommendation(reports);
  const report = {
    ok: true,
    training_approved_now: false,
    corpus_mutation_approved_now: false,
    recommendation,
    why_45_rows: reports.trace.summary.why_45_rows,
    source_rows_zero_promoted: reports.trace.summary.source_rows_with_zero_promoted_candidates,
    likely_parser_bugs: reports.shouldAnswer.diagnosis === "blank_optional_should_answer_values_were_mapped_to_false"
      ? ["blank optional raw CSV 是否回答 values mapped to should_answer=false in promoted rows"]
      : [],
    safe_next_step: "Request explicit R26G approval for metadata-only should_answer correction and manual re-promotion review of omitted first-50 rows; do not train.",
    must_not_do: [
      "do not train",
      "do not run tokenizer dry-run",
      "do not mutate training/llm_corpus in R26F",
      "do not use rows 51-100 as training material",
      "do not call external APIs or Doubao",
      "do not commit artifacts, raw CSV/XLSX, or weights"
    ],
    trace_summary: reports.trace.summary,
    duplicate_summary: {
      duplicate_rejection_count: reports.duplicate.duplicate_rejection_count,
      duplicate_kind_counts: reports.duplicate.duplicate_kind_counts
    },
    project_meta_summary: {
      project_meta_rejection_count: reports.projectMeta.project_meta_rejection_count,
      classification_counts: reports.projectMeta.classification_counts,
      justified_exclusion_source_rows: reports.projectMeta.justified_exclusion_source_rows,
      keep_or_review_source_rows: reports.projectMeta.keep_or_review_source_rows
    },
    should_answer_summary: {
      raw_csv_should_answer_counts: reports.shouldAnswer.raw_csv_should_answer_counts,
      promoted_should_answer_counts: reports.shouldAnswer.promoted_should_answer_counts,
      diagnosis: reports.shouldAnswer.diagnosis
    }
  };
  await writeJsonReport(R26F_NEXT_STEP_REPORT, report);
  await writeMarkdown(R26F_DOCS.nextStep, docFor(report));
  console.log(JSON.stringify({
    ok: report.ok,
    recommendation: report.recommendation,
    source_rows_zero_promoted: report.source_rows_zero_promoted,
    likely_parser_bugs: report.likely_parser_bugs
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
