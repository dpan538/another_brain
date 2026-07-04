#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { repoPath, readJson, writeJson } from "./r26a_project_utils.mjs";
import {
  R26D_AUDIT_FILE,
  R26D_CANDIDATE_FILE,
  buildPrimaryCandidate,
  normalizeAnswer,
  readQuestionPack,
  summarizeCounts
} from "./r26d_question_pack_utils.mjs";

function buildSliceCandidates(row, primary) {
  const answer = normalizeAnswer(row.user_answer);
  const parts = answer
    .split(/(?<=[。！？!?])\s+|\n+/)
    .map((part) => normalizeAnswer(part))
    .filter((part) => part.length >= 24 && part.length <= 180);
  const unique = [...new Set(parts)].slice(0, 2);
  return unique.map((part, index) => ({
    ...primary,
    sample_id: `r26d_qp001_row_${String(row.id).padStart(3, "0")}_slice_${index + 1}`,
    candidate_type: "source_slice",
    user_answer_clean: part,
    target_answer: part,
    split_suggestion: "train",
    provenance: {
      ...primary.provenance,
      slice_from_sample_id: primary.sample_id
    }
  }));
}

async function main() {
  const audit = await readJson(R26D_AUDIT_FILE);
  if (!audit.ok) throw new Error("R26D audit did not pass; refusing candidate generation");
  const pack = await readQuestionPack();
  const sourceRows = pack.rows.filter((row) => row.id >= 1 && row.id <= 50);
  const excludedRows = pack.rows.filter((row) => row.id >= 51 && row.id <= 100);
  if (sourceRows.length !== 50 || excludedRows.length !== 50) {
    throw new Error("question pack row ranges are incomplete");
  }
  const candidates = [];
  const slicing = [];
  for (const row of sourceRows) {
    const primary = buildPrimaryCandidate(row);
    if (!primary.target_answer) continue;
    candidates.push(primary);
    const slices = buildSliceCandidates(row, primary).slice(0, 2);
    candidates.push(...slices);
    slicing.push({
      row_id: row.id,
      primary_candidate: primary.sample_id,
      slice_count: slices.length,
      slice_sample_ids: slices.map((item) => item.sample_id)
    });
  }
  await writeFile(repoPath(R26D_CANDIDATE_FILE), `${candidates.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const report = {
    ok: true,
    phase: "R26D",
    source_rows_used: "1-50",
    excluded_rows_not_used: "51-100",
    rows_used_count: sourceRows.length,
    candidate_count: candidates.length,
    primary_candidate_count: candidates.filter((row) => row.candidate_type !== "source_slice").length,
    source_slice_candidate_count: candidates.filter((row) => row.candidate_type === "source_slice").length,
    module_counts: summarizeCounts(candidates, "module"),
    answer_mode_counts: summarizeCounts(candidates, "answer_mode"),
    candidate_type_counts: summarizeCounts(candidates, "candidate_type"),
    risk_flag_counts: candidates.reduce((acc, row) => {
      for (const flag of row.risk_flags || []) acc[flag] = (acc[flag] || 0) + 1;
      return acc;
    }, {}),
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_promotion_ran: false,
    corpus_expansion_ran: false,
    rows_51_100_generated: 0
  };
  await writeJson("artifacts/training_os/user_answer_intake/r26d/r26d_first50_slicing_report.json", {
    ok: true,
    slicing
  });
  await writeJson("artifacts/training_os/user_answer_intake/r26d/r26d_first50_generation_report.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
