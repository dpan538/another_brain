#!/usr/bin/env node
import {
  R26G_CANDIDATES,
  R26G_OMITTED_REVIEW_REPORT,
  R26G_PROMOTION_REPORT,
  countBy,
  loadJsonlIfPresent,
  makePromotedR26GRow,
  normalizeTarget,
  readJsonIfPresent,
  requireR26GApproval,
  splitForOrdinal,
  writeR26GJson,
  writeR26GSplits
} from "./r26g_user_answer_utils.mjs";

async function main() {
  await requireR26GApproval();
  const omitted = await readJsonIfPresent(R26G_OMITTED_REVIEW_REPORT);
  if (!omitted?.ok) throw new Error("R26G omitted first-50 review missing or not ok.");
  const replacementCandidates = await loadJsonlIfPresent(R26G_CANDIDATES);
  if (!replacementCandidates.length) throw new Error("R26G replacement candidates missing.");
  const omittedCandidates = (omitted.selected_for_repromotion || []).filter((row) => Number(row.source_row_id) !== 16);
  const allCandidates = [...omittedCandidates, ...replacementCandidates];
  const promoted = [];
  const rejected = [];
  const seenTargets = new Set();
  for (const [index, candidate] of allCandidates.entries()) {
    const reasons = rejectionReasons(candidate, seenTargets);
    const target = normalizeTarget(candidate.target_answer);
    if (reasons.length) {
      rejected.push({ sample_id: candidate.sample_id, source_row_id: candidate.source_row_id, display_id: candidate.display_id || null, reasons });
      continue;
    }
    seenTargets.add(target);
    const split = splitForOrdinal(promoted.length, allCandidates.length);
    promoted.push(makePromotedR26GRow(candidate, split, index + 1));
  }
  await writeR26GSplits(promoted);
  const report = {
    ok: rejected.length === 0,
    phase: "R26G",
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_promotion_ran: true,
    old_question_pack_001_rows_51_100_used: false,
    omitted_first50_promoted_source_rows: omittedCandidates.map((row) => Number(row.source_row_id)),
    row_16_promoted: promoted.some((row) => row.pack_id === "another_brain_question_pack_001" && Number(row.source_row_id) === 16),
    replacement_candidate_count: replacementCandidates.length,
    replacement_promoted_count: promoted.filter((row) => row.pack_id === "another_brain_question_pack_002_abstract_values").length,
    promoted_total: promoted.length,
    split_counts: countBy(promoted, "split"),
    category_distribution: countBy(promoted.filter((row) => row.pack_id === "another_brain_question_pack_002_abstract_values"), "type"),
    answer_mode_distribution: countBy(promoted, "answer_mode"),
    evidence_policy_distribution: countBy(promoted, "evidence_policy"),
    source_pack_distribution: countBy(promoted, "pack_id"),
    rejected,
    target_files: {
      train: "training/llm_corpus/r26g_user_answered_train.jsonl",
      dev: "training/llm_corpus/r26g_user_answered_dev.jsonl",
      heldout: "training/llm_corpus/r26g_user_answered_heldout.jsonl"
    }
  };
  await writeR26GJson(R26G_PROMOTION_REPORT, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

function rejectionReasons(row, seenTargets) {
  const reasons = [];
  const target = normalizeTarget(row.target_answer);
  if (!target) reasons.push("empty_target_answer");
  if (seenTargets.has(target)) reasons.push("duplicate_target_answer");
  if (row.pack_id === "another_brain_question_pack_001" && Number(row.source_row_id) >= 51) reasons.push("old_excluded_question_pack_001_row_51_100");
  if (row.pack_id === "another_brain_question_pack_002_abstract_values") {
    if (Number(row.source_row_id) < 1 || Number(row.source_row_id) > 50) reasons.push("replacement_source_row_not_1_50");
    if (Number(row.display_id) < 51 || Number(row.display_id) > 100) reasons.push("replacement_display_id_not_51_100");
  }
  if (row.contains_private_data !== false) reasons.push("contains_private_data_not_false");
  if (row.provenance?.external_llm_used !== false) reasons.push("external_llm_used_not_false");
  return reasons;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
