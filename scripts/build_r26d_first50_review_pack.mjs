#!/usr/bin/env node
import { readJsonlRows, writeJson, writeText } from "./r26a_project_utils.mjs";
import {
  R26D_CANDIDATE_FILE,
  R26D_PACK_ID,
  summarizeCounts
} from "./r26d_question_pack_utils.mjs";

async function main() {
  const rows = (await readJsonlRows(R26D_CANDIDATE_FILE)).map(({ row }) => row);
  const riskFlags = {};
  for (const row of rows) {
    for (const flag of row.risk_flags || []) riskFlags[flag] = (riskFlags[flag] || 0) + 1;
  }
  const report = {
    ok: true,
    phase: "R26D",
    pack_id: R26D_PACK_ID,
    candidate_count: rows.length,
    source_row_count_used: new Set(rows.map((row) => row.source_row_id)).size,
    source_row_range_used: "1-50",
    excluded_row_range: "51-100",
    module_counts: summarizeCounts(rows, "module"),
    answer_mode_counts: summarizeCounts(rows, "answer_mode"),
    candidate_type_counts: summarizeCounts(rows, "candidate_type"),
    risk_flag_counts: riskFlags,
    sample_ids_by_row: rows.reduce((acc, row) => {
      acc[row.source_row_id] ||= [];
      acc[row.source_row_id].push(row.sample_id);
      return acc;
    }, {}),
    raw_answers_in_tracked_summary: false,
    training_allowed: false,
    public_commit_allowed: false
  };
  await writeJson("artifacts/training_os/user_answer_intake/r26d/r26d_first50_review_pack.json", report);
  await writeText(
    "docs/R26D_FIRST50_CANDIDATE_REVIEW_SUMMARY.md",
    `# R26D First-50 Candidate Review Summary

R26D converted only rows 1-50 from \`${R26D_PACK_ID}\` into ignored answer-as-user candidate artifacts. Rows 51-100 were not used and remain excluded from all training, tokenizer, teacher-probe, corpus-generation, corpus-promotion, eval-derived, and long-horizon paths.

## Candidate Counts

- candidate count: ${report.candidate_count}
- source rows used: ${report.source_row_count_used}
- source row range used: ${report.source_row_range_used}
- excluded row range: ${report.excluded_row_range}
- module counts: ${JSON.stringify(report.module_counts)}
- answer mode counts: ${JSON.stringify(report.answer_mode_counts)}
- candidate type counts: ${JSON.stringify(report.candidate_type_counts)}
- risk flags: ${JSON.stringify(report.risk_flag_counts)}

Full user answers stay in ignored artifacts for review. This tracked summary intentionally does not include raw answers or row 51-100 text.
`
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
