#!/usr/bin/env node
import {
  R26F_DOCS,
  R26F_PROJECT_META_REPORT,
  bullets,
  classifyProjectMetaSourceRow,
  countBy,
  groupBy,
  loadR26FEvidence,
  markdownTable,
  writeJsonReport,
  writeMarkdown
} from "./r26f_audit_utils.mjs";

function docFor(report) {
  return `# R26F Project-Meta Rejection Audit

R26F is audit-only. It does not train, run tokenizer dry-run, alter corpus rows, change R26E metadata, or promote any omitted row. Rows 51-100 remain excluded.

## Result

- project-meta rejected candidates: ${report.project_meta_rejection_count}
- affected source rows: ${report.affected_source_rows.join(", ")}
- rejection fully justified rows: ${report.justified_exclusion_source_rows.join(", ") || "none"}
- likely keep/review rows: ${report.keep_or_review_source_rows.join(", ") || "none"}

R26E's project-meta rule was intentionally conservative but overbroad for some first-50 user answers. Questions about phase, next training step, Codex, Vercel, or implementation details should remain excluded. Questions about what another_brain is, what kind of model it is, why it is not generic客服 behavior, or product success boundaries are product-identity/boundary material and should not be automatically discarded.

## Row Classification

${markdownTable([
  "row",
  "module",
  "candidate count",
  "classification",
  "rejection justified",
  "rationale"
], report.source_row_classifications.map((row) => [
  row.source_row_id,
  row.module,
  row.rejected_candidate_count,
  row.classification,
  row.rejection_justified,
  row.rationale
]))}

## Recommendation

${bullets(report.recommendations)}
`;
}

async function main() {
  const evidence = await loadR26FEvidence();
  const projectMetaRejected = (evidence.replay.rejected || [])
    .filter((item) => item.reasons.some((reason) => reason.includes("project_meta_leakage")));
  const byRow = groupBy(projectMetaRejected, "source_row_id");
  const classifications = [];
  for (const [sourceRowId, rejected] of [...byRow.entries()].sort(([a], [b]) => a - b)) {
    const primary = rejected.find((item) => item.candidate_type !== "source_slice")?.candidate || rejected[0]?.candidate || {};
    const classified = classifyProjectMetaSourceRow(primary);
    classifications.push({
      source_row_id: Number(sourceRowId),
      module: primary.module || "",
      question: primary.question || "",
      rejected_candidate_count: rejected.length,
      classification: classified.classification,
      rejection_justified: classified.rejection_justified,
      rationale: classified.rationale,
      rejected_sample_ids: rejected.map((item) => item.sample_id)
    });
  }
  const classCounts = countBy(classifications, "classification");
  const justifiedRows = classifications.filter((row) => row.rejection_justified === true).map((row) => row.source_row_id);
  const keepOrReviewRows = classifications.filter((row) => row.rejection_justified !== true).map((row) => row.source_row_id);
  const report = {
    ok: projectMetaRejected.length === 10 && classifications.length === 5,
    audit_only: true,
    candidate_artifact_present: evidence.candidates.available,
    promotion_report_present: Boolean(evidence.promotionReport),
    project_meta_rejection_count: projectMetaRejected.length,
    affected_source_rows: classifications.map((row) => row.source_row_id),
    classification_counts: classCounts,
    source_row_classifications: classifications,
    justified_exclusion_source_rows: justifiedRows,
    keep_or_review_source_rows: keepOrReviewRows,
    automatic_project_meta_rejection_seems_justified: keepOrReviewRows.length === 0,
    recommendations: [
      "Keep row 16 excluded unless a later approval explicitly wants training-control answers in a separate non-product corpus.",
      "Review rows 2, 9, 29, and 47 under R26G before any re-promotion; they look like product identity or boundary material rather than unsafe training-meta rows.",
      "Do not re-promote anything during R26F."
    ],
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_mutation_ran: false
  };
  await writeJsonReport(R26F_PROJECT_META_REPORT, report);
  await writeMarkdown(R26F_DOCS.projectMeta, docFor(report));
  console.log(JSON.stringify({
    ok: report.ok,
    project_meta_rejection_count: report.project_meta_rejection_count,
    classification_counts: report.classification_counts
  }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
