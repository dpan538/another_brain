#!/usr/bin/env node
import {
  R26F_DOCS,
  R26F_SHOULD_ANSWER_REPORT,
  countBy,
  loadR26FEvidence,
  markdownTable,
  writeJsonReport,
  writeMarkdown
} from "./r26f_audit_utils.mjs";

function docFor(report) {
  return `# R26F should_answer Semantics Audit

R26F is audit-only. It does not change \`should_answer\`, \`target_answer\`, corpus files, or R26E metadata. Rows 51-100 remain excluded. Any metadata correction requires later R26G approval.

## Result

- raw CSV \`是否回答\` values for rows 1-50: ${JSON.stringify(report.raw_csv_should_answer_counts)}
- raw blank/null count: ${report.raw_csv_blank_or_null_count}
- promoted \`should_answer\` counts: ${JSON.stringify(report.promoted_should_answer_counts)}
- promoted non-empty \`target_answer\` count: ${report.promoted_target_answer_non_empty_count}
- rows where \`should_answer=false\` but \`target_answer\` is non-empty: ${report.should_answer_false_but_target_non_empty_count}

The likely parser issue is that blank optional \`是否回答\` values were mapped to boolean \`false\`. In R26E this makes all promoted rows report \`should_answer=false\` despite non-empty user-authored target answers.

## Answer Mode Counts

${markdownTable(["answer_mode", "count"], Object.entries(report.promoted_answer_mode_counts).map(([mode, count]) => [mode, count]))}

## Recommendation

- no R26F corpus or metadata change
- R26G should perform a metadata-only fix or schema reinterpretation after explicit approval
- do not rewrite target answers into generic assistant answers
`;
}

async function main() {
  const evidence = await loadR26FEvidence();
  const rawCounts = evidence.source.raw_should_answer_counts || {};
  const promoted = evidence.promotedRows || [];
  const promotedShouldAnswerCounts = countBy(promoted, (row) => String(row.should_answer));
  const falseButNonEmpty = promoted
    .filter((row) => row.should_answer === false && String(row.target_answer || "").trim())
    .map((row) => ({
      sample_id: row.sample_id,
      source_row_id: row.source_row_id,
      split: row.split,
      answer_mode: row.answer_mode,
      target_answer_length: String(row.target_answer || "").trim().length
    }));
  const report = {
    ok: promoted.length === 45 && falseButNonEmpty.length === promoted.length,
    audit_only: true,
    raw_csv_present: evidence.source.available,
    raw_csv_should_answer_counts: rawCounts,
    raw_csv_blank_or_null_count: evidence.source.blank_should_answer_count,
    promoted_should_answer_counts: promotedShouldAnswerCounts,
    promoted_target_answer_non_empty_count: promoted.filter((row) => String(row.target_answer || "").trim()).length,
    promoted_answer_mode_counts: countBy(promoted, "answer_mode"),
    should_answer_false_but_target_non_empty_count: falseButNonEmpty.length,
    should_answer_false_but_target_non_empty_rows: falseButNonEmpty,
    diagnosis: "blank_optional_should_answer_values_were_mapped_to_false",
    recommendation: "metadata_only_fix_later_r26g_or_schema_reinterpretation_only",
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_mutation_ran: false
  };
  await writeJsonReport(R26F_SHOULD_ANSWER_REPORT, report);
  await writeMarkdown(R26F_DOCS.shouldAnswer, docFor(report));
  console.log(JSON.stringify({
    ok: report.ok,
    raw_csv_should_answer_counts: report.raw_csv_should_answer_counts,
    promoted_should_answer_counts: report.promoted_should_answer_counts,
    diagnosis: report.diagnosis
  }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
