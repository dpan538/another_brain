#!/usr/bin/env node
import { readJsonlRows } from "./r26a_project_utils.mjs";
import { R26D_CANDIDATES } from "./r26e_user_answer_promotion_utils.mjs";
import {
  R26F_PROJECT_META_REPORT,
  R26G_OMITTED_REVIEW_REPORT,
  readJsonIfPresent,
  responseSemanticsFor,
  writeR26GJson
} from "./r26g_user_answer_utils.mjs";

const DECISIONS = {
  2: "promote_safe_product_identity",
  9: "manual_review_needed_not_promoted",
  16: "training_meta_exclude",
  29: "promote_safe_product_boundary",
  47: "promote_safe_product_boundary"
};

async function main() {
  const projectMeta = await readJsonIfPresent(R26F_PROJECT_META_REPORT);
  const candidates = (await readJsonlRows(R26D_CANDIDATES)).map(({ row, line }) => ({ ...row, __line: line }));
  const omittedIds = [2, 9, 16, 29, 47];
  const rows = [];
  const promote = [];
  for (const sourceRowId of omittedIds) {
    const rowCandidates = candidates.filter((row) => Number(row.source_row_id) === sourceRowId && row.candidate_type !== "source_slice");
    const selected = rowCandidates[0] || candidates.find((row) => Number(row.source_row_id) === sourceRowId);
    const decision = DECISIONS[sourceRowId];
    const promoteSafe = decision.startsWith("promote_safe");
    const classification = projectMeta?.rows?.find((row) => Number(row.source_row_id) === sourceRowId)?.classification || decision;
    const item = {
      source_row_id: sourceRowId,
      decision,
      classification,
      candidate_count: candidates.filter((row) => Number(row.source_row_id) === sourceRowId).length,
      selected_candidate_id: selected?.sample_id || null,
      promoted_by_r26g: promoteSafe,
      rationale: rationaleFor(sourceRowId)
    };
    rows.push(item);
    if (promoteSafe && selected) {
      const semantics = responseSemanticsFor(selected.answer_mode);
      promote.push({
        ...selected,
        sample_id: `r26g_recovered_first50_row_${String(sourceRowId).padStart(3, "0")}`,
        source_row_range_policy: "original_question_pack_001_first50_only; old_rows_51_100_excluded",
        source_should_answer_raw: selected.source_should_answer_raw ?? selected.should_answer ?? "",
        should_answer: true,
        ...semantics,
        metadata_fix_phase: "R26G",
        metadata_fix_reason: "R26G recovered omitted first-50 product identity or boundary row after R26F review.",
        risk_flags: [],
        review_status: "candidate_unreviewed",
        training_allowed: false,
        public_commit_allowed: false,
        contains_private_data: false
      });
    }
  }
  const report = {
    ok: true,
    phase: "R26G",
    reviewed_source_rows: omittedIds,
    promoted_source_rows: promote.map((row) => row.source_row_id),
    excluded_source_rows: rows.filter((row) => !row.promoted_by_r26g).map((row) => row.source_row_id),
    row_16_excluded: true,
    row_9_promoted: false,
    selected_for_repromotion_count: promote.length,
    selected_for_repromotion: promote,
    rows
  };
  await writeR26GJson(R26G_OMITTED_REVIEW_REPORT, report);
  console.log(JSON.stringify({ ...report, selected_for_repromotion: promote.map((row) => row.sample_id) }, null, 2));
}

function rationaleFor(id) {
  if (id === 2) return "Product identity material about another_brain; safe to recover without rewriting.";
  if (id === 9) return "R26F marked this as needing manual review because model/training framing is present; not promoted automatically.";
  if (id === 16) return "Explicit training-control/Codex continuation material; remains excluded.";
  if (id === 29) return "Product boundary answer; safe to recover without rewriting.";
  if (id === 47) return "Product behavior boundary answer; safe to recover without rewriting.";
  return "Unknown omitted row.";
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
