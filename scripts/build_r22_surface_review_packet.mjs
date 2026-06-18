#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import { gitHead, nowIso, R22_BASELINE_COMMIT, updateR22State } from "./r22_long_cycle_common.mjs";

const BLIND = resolve(ROOT, "artifacts/training_os/r22_surface_ab_review_blind.json");
const MAPPING = resolve(ROOT, "artifacts/training_os/r22_surface_ab_mapping_private.json");
const SHADOW_REPORT = resolve(ROOT, "artifacts/training_os/r22_shadow_surface_eval_report.json");
const HOLDOUT_REPORT = resolve(ROOT, "artifacts/training_os/r22_postfreeze_holdout_report.json");
const SUMMARY = resolve(ROOT, "artifacts/training_os/r22_surface_review_summary.json");
const INSTRUCTIONS = resolve(ROOT, "artifacts/training_os/r22_surface_review_instructions.md");

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function assertBlindHasNoMapping(review = {}) {
  const serialized = JSON.stringify(review);
  return !/hidden_mapping|shadow_candidate|current_answer|candidate_confidence|failure_reason|better_answer_shape/.test(serialized);
}

async function main() {
  await updateR22State({ current_phase: "phase10_build_blind_review_packet" });
  const review = (await readJson(BLIND, { rows: [] })) || { rows: [] };
  const mapping = (await readJson(MAPPING, { rows: [] })) || { rows: [] };
  const shadow = (await readJson(SHADOW_REPORT, {})) || {};
  const holdout = (await readJson(HOLDOUT_REPORT, {})) || {};
  const blindClean = assertBlindHasNoMapping(review);
  const domains = {};
  const turnFunctions = {};
  for (const row of review.rows || []) {
    const domain = row.source || "unknown";
    domains[domain] = (domains[domain] || 0) + 1;
    turnFunctions[row.turn_function || "unknown"] = (turnFunctions[row.turn_function || "unknown"] || 0) + 1;
  }
  const summary = {
    execution_ok: true,
    behavior_ok: blindClean,
    audit_only: false,
    baseline_commit: R22_BASELINE_COMMIT,
    evaluated_commit: gitHead(),
    generated_at: nowIso(),
    blind_review_path: BLIND,
    private_mapping_path: MAPPING,
    instruction_path: INSTRUCTIONS,
    blind_review_rows: review.rows?.length || 0,
    mapping_rows: mapping.rows?.length || 0,
    blind_file_contains_mapping: !blindClean,
    domains_covered: domains,
    turn_functions_covered: turnFunctions,
    current_surface_failure_count: shadow.current_failure_count ?? null,
    shadow_candidate_failure_count: shadow.candidate_failure_count ?? null,
    semantic_fallback_count: shadow.semantic_fallback_count ?? null,
    holdout_candidate_failures: holdout.holdout_candidate_failures ?? null,
    holdout_inappropriate_fallbacks: holdout.inappropriate_fallbacks ?? null,
    human_review_status: "pending",
    promotion_ready: false,
    live_switch: false
  };
  const instructions = `# R22 Surface A/B Review Instructions

This packet is for human review only. It must not be imported by runtime code.

Review the blind file:

- ${BLIND}

Keep the private mapping separate:

- ${MAPPING}

For each row, judge answer A and answer B without trying to infer which is current or candidate.

Required dimensions:

- factual correctness
- active-referent correctness
- turn fit
- naturalness
- specificity
- boundary discipline
- over-explanation
- too terse
- unsupported interpretation
- mechanical/template feel
- preferred answer
- neither acceptable
- reviewer note

Promotion remains blocked until human review is complete and a separate live-switch approval exists.
`;
  await mkdir(dirname(SUMMARY), { recursive: true });
  await writeFile(SUMMARY, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(INSTRUCTIONS, instructions, "utf8");
  await updateR22State({ current_phase: "phase10_build_blind_review_packet_done" });
  console.log(JSON.stringify({
    behavior_ok: summary.behavior_ok,
    blind_review_rows: summary.blind_review_rows,
    mapping_rows: summary.mapping_rows,
    blind_file_contains_mapping: summary.blind_file_contains_mapping,
    human_review_status: summary.human_review_status,
    promotion_ready: summary.promotion_ready,
    summary: SUMMARY
  }, null, 2));
  if (!summary.behavior_ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
