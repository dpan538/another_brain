#!/usr/bin/env node
import { writeJsonl } from "./r26e_user_answer_promotion_utils.mjs";
import {
  R26E_FILES,
  fixR26ERow,
  loadR26ERows,
  R26G_METADATA_FIX_REPORT,
  requireR26GApproval,
  writeR26GJson
} from "./r26g_user_answer_utils.mjs";

async function main() {
  await requireR26GApproval();
  const rows = await loadR26ERows();
  const beforeCounts = {};
  const afterCounts = {};
  const responseObligationCounts = {};
  const changedRows = [];
  const bySplit = { train: [], dev: [], heldout: [] };

  for (const row of rows) {
    beforeCounts[String(row.should_answer)] = (beforeCounts[String(row.should_answer)] || 0) + 1;
    const fixed = fixR26ERow(row);
    afterCounts[String(fixed.should_answer)] = (afterCounts[String(fixed.should_answer)] || 0) + 1;
    responseObligationCounts[String(fixed.response_obligation)] = (responseObligationCounts[String(fixed.response_obligation)] || 0) + 1;
    changedRows.push({
      sample_id: fixed.sample_id,
      source_row_id: fixed.source_row_id,
      before_should_answer: row.should_answer,
      after_should_answer: fixed.should_answer,
      answer_mode: fixed.answer_mode,
      response_obligation: fixed.response_obligation,
      direct_compliance: fixed.direct_compliance,
      valid_nonanswer: fixed.valid_nonanswer
    });
    bySplit[fixed.__expected_split].push(stripRuntime(fixed));
  }

  for (const [split, path] of Object.entries(R26E_FILES)) await writeJsonl(path, bySplit[split]);

  const report = {
    ok: true,
    phase: "R26G",
    metadata_only: true,
    row_count: rows.length,
    before_should_answer_counts: beforeCounts,
    after_should_answer_counts: afterCounts,
    response_obligation_counts: responseObligationCounts,
    target_answer_preserved_by_this_script: true,
    question_preserved_by_this_script: true,
    sample_id_order_preserved_by_this_script: true,
    changed_rows: changedRows
  };
  await writeR26GJson(R26G_METADATA_FIX_REPORT, report);
  console.log(JSON.stringify(report, null, 2));
}

function stripRuntime(row) {
  const { __file, __line, __expected_split, ...clean } = row;
  return clean;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
