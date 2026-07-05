#!/usr/bin/env node
import {
  R26G_DOCX,
  R26G_CSV,
  R26G_PARSED_REPORT,
  fileSha256,
  readReplacementRows,
  validateReplacementRows,
  writeR26GJson,
  writeR26GMarkdown,
  countBy
} from "./r26g_user_answer_utils.mjs";
import { exists } from "./r26a_project_utils.mjs";

async function main() {
  const sourcePath = (await exists(R26G_CSV)) ? R26G_CSV : (await exists(R26G_DOCX)) ? R26G_DOCX : null;
  if (!sourcePath) throw new Error("R26G blocked because replacement 51-100 file is missing from private_sources/question_packs/.");
  const rows = await readReplacementRows();
  const failures = validateReplacementRows(rows);
  const report = {
    ok: failures.length === 0,
    phase: "R26G",
    source_path_used: sourcePath,
    source_sha256: await fileSha256(sourcePath),
    parsed_count: rows.length,
    display_id_min: Math.min(...rows.map((row) => row.display_id)),
    display_id_max: Math.max(...rows.map((row) => row.display_id)),
    source_row_id_min: Math.min(...rows.map((row) => row.source_row_id)),
    source_row_id_max: Math.max(...rows.map((row) => row.source_row_id)),
    pack_id: "another_brain_question_pack_002_abstract_values",
    replacement_for_pack_id: "another_brain_question_pack_001",
    type_counts: countBy(rows, "type"),
    rows: rows.map((row) => ({
      source_row_id: row.source_row_id,
      display_id: row.display_id,
      type: row.type,
      question_length: row.question.length,
      user_answer_length: row.user_answer_clean.length,
      has_user_answer: Boolean(row.user_answer_clean)
    })),
    failures
  };
  await writeR26GJson(R26G_PARSED_REPORT, { ...report, parsed_rows: rows });
  await writeR26GMarkdown("docs/R26G_REPLACEMENT_51_100_PARSE_SUMMARY.md", renderSummary(report));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

function renderSummary(report) {
  return `# R26G Replacement 51-100 Parse Summary

R26G parses only the approved ignored private source path. It does not train, run tokenizer dry-run, use old excluded question_pack_001 rows 51-100, or commit the raw DOCX/CSV.

## Result

- ok: ${report.ok}
- raw input path used: \`${report.source_path_used}\`
- pack_id: \`${report.pack_id}\`
- replacement_for_pack_id: \`${report.replacement_for_pack_id}\`
- parsed rows: ${report.parsed_count}
- display_id range: ${report.display_id_min}-${report.display_id_max}
- internal source_row_id range: ${report.source_row_id_min}-${report.source_row_id_max}

## Type Counts

\`\`\`json
${JSON.stringify(report.type_counts, null, 2)}
\`\`\`

Replacement 51-100 is treated as a new pack. The old question_pack_001 rows 51-100 remain excluded.
`;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
