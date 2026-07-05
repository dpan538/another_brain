#!/usr/bin/env node
import {
  R26G_CANDIDATES,
  R26G_GENERATION_REPORT,
  R26G_PARSED_REPORT,
  countBy,
  makeReplacementCandidate,
  readJsonIfPresent,
  writeR26GJson
} from "./r26g_user_answer_utils.mjs";
import { writeJsonl } from "./r26e_user_answer_promotion_utils.mjs";

async function main() {
  const parsed = await readJsonIfPresent(R26G_PARSED_REPORT);
  if (!parsed?.ok) throw new Error("R26G replacement parsed report missing or not ok; run parse:r26g-replacement-51-100 first.");
  const candidates = parsed.parsed_rows
    .filter((row) => String(row.user_answer_clean || "").trim())
    .map(makeReplacementCandidate);
  await writeJsonl(R26G_CANDIDATES, candidates);
  const report = {
    ok: true,
    phase: "R26G",
    parsed_count: parsed.parsed_count,
    candidate_count: candidates.length,
    candidates_per_row_max: 1,
    source_slice_explosion_avoided: true,
    pack_id: "another_brain_question_pack_002_abstract_values",
    old_question_pack_001_rows_51_100_used: false,
    answer_mode_counts: countBy(candidates, "answer_mode"),
    evidence_policy_counts: countBy(candidates, "evidence_policy"),
    type_counts: countBy(candidates, "type"),
    sample_ids: candidates.map((row) => row.sample_id)
  };
  await writeR26GJson(R26G_GENERATION_REPORT, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
