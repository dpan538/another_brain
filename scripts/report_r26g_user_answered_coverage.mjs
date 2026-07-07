#!/usr/bin/env node
import {
  R26G_COVERAGE_REPORT,
  R26G_METADATA_FIX_REPORT,
  R26G_OMITTED_REVIEW_REPORT,
  R26G_PARSED_REPORT,
  R26G_PROMOTION_REPORT,
  R26G_PACK_ID,
  R26G_REPLACES_PACK_ID,
  countBy,
  loadR26ERows,
  loadR26GRows,
  readJsonIfPresent,
  writeR26GJson,
  writeR26GMarkdown
} from "./r26g_user_answer_utils.mjs";
import { loadCorpusRows } from "./validate_llm_training_corpus.mjs";

async function main() {
  const [r26eRows, r26gRows, allRows] = await Promise.all([
    loadR26ERows(),
    loadR26GRows(),
    loadCorpusRows()
  ]);
  const metadataFix = await readJsonIfPresent(R26G_METADATA_FIX_REPORT);
  const omitted = await readJsonIfPresent(R26G_OMITTED_REVIEW_REPORT);
  const parsed = await readJsonIfPresent(R26G_PARSED_REPORT);
  const promotion = await readJsonIfPresent(R26G_PROMOTION_REPORT);
  const combinedUserAnswered = [...r26eRows, ...r26gRows];
  const committedFallback = deriveCommittedCorpusFallback(r26eRows, r26gRows);
  const metadataFixOk = metadataFix?.ok === true || committedFallback.metadata_fix_ok;
  const omittedOk = omitted?.ok === true || committedFallback.omitted_review_ok;
  const parsedOk = parsed?.ok === true || committedFallback.replacement_parse_ok;
  const promotionOk = promotion?.ok === true || committedFallback.promotion_ok;
  const omittedFirst50Review = {
    promoted_source_rows: omitted?.promoted_source_rows || committedFallback.omitted_promoted_source_rows,
    excluded_source_rows: omitted?.excluded_source_rows || committedFallback.omitted_excluded_source_rows,
    evidence_source: omitted?.ok === true ? "artifact_report" : "committed_corpus_fallback"
  };
  const replacementParsedCount = parsed?.parsed_count ?? committedFallback.replacement_parsed_count;
  const report = {
    ok: Boolean(metadataFixOk && omittedOk && parsedOk && promotionOk),
    phase: "R26G",
    training_ran: false,
    tokenizer_dry_run_ran: false,
    fresh_clone_artifact_fallback_used: !(metadataFix?.ok && omitted?.ok && parsed?.ok && promotion?.ok),
    committed_corpus_fallback: committedFallback,
    r26e_metadata_fix_status: metadataFix?.ok ? "passed" : metadataFixOk ? "passed_from_committed_corpus" : "missing_or_failed",
    r26e_target_preservation_status: "validated_by_check_r26g_r26e_target_preserved",
    omitted_first50_review_result: omittedFirst50Review,
    replacement_51_100_parsed_count: replacementParsedCount,
    replacement_51_100_promoted_count: r26gRows.filter((row) => row.pack_id === R26G_PACK_ID).length,
    r26g_promoted_split_counts: countBy(r26gRows, "split"),
    category_distribution: countBy(r26gRows.filter((row) => row.pack_id === R26G_PACK_ID), "type"),
    answer_mode_distribution: countBy(r26gRows, "answer_mode"),
    evidence_policy_distribution: countBy(r26gRows, "evidence_policy"),
    source_pack_distribution: countBy(r26gRows, "pack_id"),
    combined_user_answered_corpus_count_after_r26g: combinedUserAnswered.length,
    combined_training_corpus_count_after_r26g: allRows.filter((row) => !row.__parse_error).length,
    old_excluded_question_pack_001_51_100_status: r26gRows.some((row) => row.pack_id === R26G_REPLACES_PACK_ID && Number(row.source_row_id) >= 51) ? "forbidden_present" : "excluded",
    no_training_status: "no_training_no_tokenizer_no_phase4"
  };
  await writeR26GJson(R26G_COVERAGE_REPORT, report);
  await writeR26GMarkdown("docs/R26G_USER_ANSWERED_CORPUS_SUMMARY.md", renderSummary(report));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

function deriveCommittedCorpusFallback(r26eRows, r26gRows) {
  const replacementRows = r26gRows.filter((row) => row.pack_id === R26G_PACK_ID);
  const recoveredFirst50Rows = r26gRows
    .filter((row) => row.pack_id === R26G_REPLACES_PACK_ID)
    .map((row) => Number(row.source_row_id))
    .filter((sourceRowId) => Number.isInteger(sourceRowId))
    .sort((a, b) => a - b);
  const expectedReviewedOmittedRows = [2, 9, 16, 29, 47];
  const expectedPromotedRows = [2, 29, 47];
  const omittedExcludedRows = expectedReviewedOmittedRows.filter((rowId) => !recoveredFirst50Rows.includes(rowId));
  const replacementSourceRows = replacementRows.map((row) => Number(row.source_row_id)).sort((a, b) => a - b);
  const replacementDisplayRows = replacementRows.map((row) => Number(row.display_id)).sort((a, b) => a - b);
  const replacementRowsAreValid = replacementRows.length === 50
    && replacementSourceRows.every((rowId, index) => rowId === index + 1)
    && replacementDisplayRows.every((displayId, index) => displayId === index + 51)
    && replacementRows.every((row) => row.replacement_for_pack_id === R26G_REPLACES_PACK_ID);
  const r26eMetadataFixed = r26eRows.length > 0 && r26eRows.every((row) => (
    row.response_obligation === "produce_response"
    && row.metadata_fix_phase === "R26G"
    && row.contains_private_data === false
    && row.provenance?.external_llm_used === false
  ));
  const noOldExcludedRows = !r26gRows.some((row) => row.pack_id === R26G_REPLACES_PACK_ID && Number(row.source_row_id) >= 51);
  const recoveredRowsMatchExpected = JSON.stringify(recoveredFirst50Rows) === JSON.stringify(expectedPromotedRows);
  return {
    evidence_source: "committed_training_llm_corpus",
    metadata_fix_ok: r26eMetadataFixed,
    omitted_review_ok: recoveredRowsMatchExpected && omittedExcludedRows.length === 2,
    replacement_parse_ok: replacementRowsAreValid,
    promotion_ok: recoveredRowsMatchExpected && replacementRowsAreValid && noOldExcludedRows,
    omitted_reviewed_source_rows: expectedReviewedOmittedRows,
    omitted_promoted_source_rows: recoveredFirst50Rows,
    omitted_excluded_source_rows: omittedExcludedRows,
    replacement_parsed_count: replacementRows.length,
    replacement_source_row_min: replacementSourceRows[0] ?? null,
    replacement_source_row_max: replacementSourceRows.at(-1) ?? null,
    replacement_display_id_min: replacementDisplayRows[0] ?? null,
    replacement_display_id_max: replacementDisplayRows.at(-1) ?? null,
    old_excluded_rows_51_100_present: !noOldExcludedRows
  };
}

function renderSummary(report) {
  return `# R26G User-Answered Corpus Summary

R26G fixes R26E response-obligation metadata and intakes replacement 51-100 as a new pack. R26G does not train, run tokenizer dry-run, use old excluded question_pack_001 rows 51-100, call external APIs, call Doubao, commit raw private sources, commit artifacts, or commit weights.

## Result

- R26E metadata fix: ${report.r26e_metadata_fix_status}
- R26E target preservation: ${report.r26e_target_preservation_status}
- omitted first-50 promoted source rows: ${(report.omitted_first50_review_result.promoted_source_rows || []).join(", ") || "none"}
- replacement 51-100 parsed rows: ${report.replacement_51_100_parsed_count}
- replacement 51-100 promoted rows: ${report.replacement_51_100_promoted_count}
- combined user_answered rows after R26G: ${report.combined_user_answered_corpus_count_after_r26g}
- combined training corpus rows after R26G: ${report.combined_training_corpus_count_after_r26g}
- old excluded question_pack_001 rows 51-100: ${report.old_excluded_question_pack_001_51_100_status}
- fresh-clone artifact fallback used: ${report.fresh_clone_artifact_fallback_used}

## R26G Split Counts

\`\`\`json
${JSON.stringify(report.r26g_promoted_split_counts, null, 2)}
\`\`\`

## Category Distribution

\`\`\`json
${JSON.stringify(report.category_distribution, null, 2)}
\`\`\`

R26H performs the next readiness review. It may run one tokenizer dry-run over
the tracked reviewed corpus, but it does not train, promote more rows, mutate
\`training/llm_corpus\`, approve phase_4, or commit tokenizer artifacts/weights.
R26I is not automatic and requires fresh approval.
`;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
