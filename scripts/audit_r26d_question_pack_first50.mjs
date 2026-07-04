#!/usr/bin/env node
import { exists, writeJson, writeText } from "./r26a_project_utils.mjs";
import {
  R26D_AUDIT_FILE,
  R26D_PACK_ID,
  R26D_SOURCE,
  detectRiskFlags,
  normalizeAnswer,
  readQuestionPack
} from "./r26d_question_pack_utils.mjs";

async function main() {
  if (!(await exists(R26D_SOURCE))) {
    console.error("R26D blocked because the answered question pack CSV is not present under private_sources/question_packs/.");
    process.exit(2);
  }
  const pack = await readQuestionPack();
  const first50 = pack.rows.filter((row) => row.id >= 1 && row.id <= 50);
  const excluded = pack.rows.filter((row) => row.id >= 51 && row.id <= 100);
  const missingFirst50 = [];
  const risks = {};
  const rowRiskSummary = [];
  for (const row of first50) {
    const answer = normalizeAnswer(row.user_answer);
    if (!answer) missingFirst50.push(row.id);
    const flags = detectRiskFlags(row, answer);
    for (const flag of flags) risks[flag] = (risks[flag] || 0) + 1;
    if (flags.length) rowRiskSummary.push({ row_id: row.id, flags });
  }
  const report = {
    ok: missingFirst50.length === 0 && first50.length === 50 && excluded.length === 50,
    phase: "R26D",
    pack_id: R26D_PACK_ID,
    source_path: R26D_SOURCE,
    raw_source_committed: false,
    source_sha256: pack.file_sha256,
    byte_size: pack.byte_size,
    total_rows_parsed: pack.rows.length,
    column_map: pack.columnMap,
    candidate_range: "1-50",
    excluded_range: "51-100",
    first50_rows_found: first50.length,
    rows_51_100_found: excluded.length,
    first50_answered_count: first50.filter((row) => normalizeAnswer(row.user_answer)).length,
    first50_blank_answer_count: missingFirst50.length,
    first50_blank_answer_row_ids: missingFirst50,
    rows_51_100_exclusion_status: excluded.length === 50 ? "excluded_from_training" : "incomplete_exclusion_range",
    risk_flag_counts: risks,
    row_risk_summary: rowRiskSummary,
    parsed_root_pdf_docx: false,
    parsed_data_public_ingestion: false,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_promotion_ran: false,
    corpus_expansion_ran: false
  };
  await writeJson(R26D_AUDIT_FILE, report);
  await writeText(
    "docs/R26D_FIRST50_AUDIT_SUMMARY.md",
    `# R26D First-50 Audit Summary

R26D parsed the approved ignored CSV at \`${R26D_SOURCE}\` and used only rows 1-50 as answer-as-user candidate material. Rows 51-100 remain excluded from training, tokenizer text, teacher probing, corpus generation, corpus promotion, eval-derived training seeds, and long-horizon rows.

## Result

- pack_id: ${R26D_PACK_ID}
- total rows parsed: ${report.total_rows_parsed}
- rows 1-50 found: ${report.first50_rows_found}
- rows 1-50 answered: ${report.first50_answered_count}
- rows 1-50 blank answers: ${report.first50_blank_answer_count}
- rows 51-100 found: ${report.rows_51_100_found}
- rows 51-100 status: ${report.rows_51_100_exclusion_status}
- risk flags: ${JSON.stringify(report.risk_flag_counts)}

Raw CSV content and full user answers are not committed. Candidate rows, if generated, remain under ignored artifacts only.
`
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
