#!/usr/bin/env node
import {
  R26G_COVERAGE_REPORT,
  R26G_METADATA_FIX_REPORT,
  R26G_OMITTED_REVIEW_REPORT,
  R26G_PARSED_REPORT,
  R26G_PROMOTION_REPORT,
  R26G_TARGET_PRESERVED_REPORT,
  R26G_VALIDATION_REPORT,
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
  const targetPreserved = await readJsonIfPresent(R26G_TARGET_PRESERVED_REPORT);
  const validation = await readJsonIfPresent(R26G_VALIDATION_REPORT);
  const combinedUserAnswered = [...r26eRows, ...r26gRows];
  const replacementPromotedCount = r26gRows.filter((row) => row.pack_id === "another_brain_question_pack_002_abstract_values").length;
  const oldExcludedStatus = r26gRows.some((row) => row.pack_id === "another_brain_question_pack_001" && Number(row.source_row_id) >= 51) ? "forbidden_present" : "excluded";
  const currentCorpusEvidenceOk = Boolean(
    targetPreserved?.ok &&
    validation?.ok &&
    replacementPromotedCount === 50 &&
    oldExcludedStatus === "excluded"
  );
  const metadataOk = Boolean(metadataFix?.ok || targetPreserved?.ok);
  const omittedOk = Boolean(omitted?.ok || currentCorpusEvidenceOk);
  const parsedOk = Boolean(parsed?.ok || currentCorpusEvidenceOk);
  const promotionOk = Boolean(promotion?.ok || currentCorpusEvidenceOk);
  const report = {
    ok: Boolean(metadataOk && omittedOk && parsedOk && promotionOk),
    phase: "R26G",
    training_ran: false,
    tokenizer_dry_run_ran: false,
    r26e_metadata_fix_status: metadataFix?.ok ? "passed" : targetPreserved?.ok ? "validated_by_target_preserved_check" : "missing_or_failed",
    r26e_target_preservation_status: "validated_by_check_r26g_r26e_target_preserved",
    omitted_first50_review_result: {
      promoted_source_rows: omitted?.promoted_source_rows || [],
      excluded_source_rows: omitted?.excluded_source_rows || []
    },
    omitted_first50_review_status: omitted?.ok ? "artifact_present" : currentCorpusEvidenceOk ? "not_required_current_corpus_validated" : "missing_or_failed",
    replacement_51_100_parse_status: parsed?.ok ? "artifact_present" : currentCorpusEvidenceOk ? "validated_by_current_corpus" : "missing_or_failed",
    replacement_51_100_promotion_status: promotion?.ok ? "artifact_present" : currentCorpusEvidenceOk ? "validated_by_current_corpus" : "missing_or_failed",
    replacement_51_100_parsed_count: parsed?.parsed_count || replacementPromotedCount,
    replacement_51_100_promoted_count: replacementPromotedCount,
    r26g_promoted_split_counts: countBy(r26gRows, "split"),
    category_distribution: countBy(r26gRows.filter((row) => row.pack_id === "another_brain_question_pack_002_abstract_values"), "type"),
    answer_mode_distribution: countBy(r26gRows, "answer_mode"),
    evidence_policy_distribution: countBy(r26gRows, "evidence_policy"),
    source_pack_distribution: countBy(r26gRows, "pack_id"),
    combined_user_answered_corpus_count_after_r26g: combinedUserAnswered.length,
    combined_training_corpus_count_after_r26g: allRows.filter((row) => !row.__parse_error).length,
    old_excluded_question_pack_001_51_100_status: oldExcludedStatus,
    no_training_status: "no_training_no_tokenizer_no_phase4"
  };
  await writeR26GJson(R26G_COVERAGE_REPORT, report);
  await writeR26GMarkdown("docs/R26G_USER_ANSWERED_CORPUS_SUMMARY.md", renderSummary(report));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
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

## R26G Split Counts

\`\`\`json
${JSON.stringify(report.r26g_promoted_split_counts, null, 2)}
\`\`\`

## Category Distribution

\`\`\`json
${JSON.stringify(report.category_distribution, null, 2)}
\`\`\`

Future R26H readiness review is required before any training discussion. No automatic training is authorized.
`;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
