#!/usr/bin/env node
import {
  R26F_DUPLICATE_REPORT,
  R26F_DOCS,
  bullets,
  classifyDuplicateRejection,
  countBy,
  loadR26FEvidence,
  markdownTable,
  writeJsonReport,
  writeMarkdown
} from "./r26f_audit_utils.mjs";

function docFor(report) {
  return `# R26F Duplicate Rejection Audit

R26F is audit-only. It does not train, run tokenizer dry-run, alter corpus rows, promote rows, or use rows 51-100 as training material.

## Result

- duplicate target-answer rejections: ${report.duplicate_rejection_count}
- same-source slice duplicates: ${report.same_source_slice_duplicate_count}
- duplicate primary/slice pairs: ${report.duplicate_kind_counts.duplicate_primary_slice_pair || 0}
- duplicate across different source rows: ${report.duplicate_kind_counts.duplicate_across_different_source_rows || 0}
- normalization collisions: ${report.duplicate_kind_counts.normalization_collision || 0}
- true duplicate user answers: ${report.duplicate_kind_counts.true_duplicate_user_answer || 0}

The duplicate rejections are redundant candidate slices, not missing source rows. They mostly reflect R26D creating a \`source_slice\` candidate whose normalized answer equals the same row's already selected primary candidate.

## Duplicate Kinds

${markdownTable(["kind", "count"], Object.entries(report.duplicate_kind_counts).map(([kind, count]) => [kind, count]))}

## Affected Source Rows

${bullets(report.affected_source_rows.map((row) => `row ${row}`))}
`;
}

async function main() {
  const evidence = await loadR26FEvidence();
  const duplicateRows = (evidence.replay.rejected || [])
    .filter((item) => item.reasons.includes("duplicate_target_answer"))
    .map((item) => ({
      sample_id: item.sample_id,
      source_row_id: item.source_row_id,
      candidate_type: item.candidate_type,
      duplicate_of: item.duplicate_of,
      duplicate_kind: classifyDuplicateRejection(item),
      reasons: item.reasons
    }));
  const kindCounts = countBy(duplicateRows, "duplicate_kind");
  const sameSourceSliceCount = duplicateRows.filter((row) => row.candidate_type === "source_slice" && row.duplicate_of?.source_row_id === row.source_row_id).length;
  const report = {
    ok: duplicateRows.length === sameSourceSliceCount && duplicateRows.length === 42,
    audit_only: true,
    candidate_artifact_present: evidence.candidates.available,
    promotion_report_present: Boolean(evidence.promotionReport),
    duplicate_rejection_count: duplicateRows.length,
    same_source_slice_duplicate_count: sameSourceSliceCount,
    duplicate_kind_counts: kindCounts,
    affected_source_rows: [...new Set(duplicateRows.map((row) => row.source_row_id))].sort((a, b) => a - b),
    duplicate_rejections: duplicateRows,
    inference_method: evidence.candidates.available
      ? "replayed R26E promotion reducer from R26D candidates"
      : "promotion report only; detailed duplicate classification unavailable",
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_mutation_ran: false
  };
  await writeJsonReport(R26F_DUPLICATE_REPORT, report);
  await writeMarkdown(R26F_DOCS.duplicate, docFor(report));
  console.log(JSON.stringify({
    ok: report.ok,
    duplicate_rejection_count: report.duplicate_rejection_count,
    duplicate_kind_counts: report.duplicate_kind_counts
  }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
