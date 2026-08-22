#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  oneCallDecision,
  oneCallReviewMetrics,
  providerVarianceMetrics,
  twoStageReviewMetrics,
} from "../src/hybrid_runtime/r3_review_metrics.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value, all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true] : ["", value]));
const PHASE = String(args.get("--phase") || "provider");
const ARTIFACT_ROOT = resolve(ROOT, String(args.get("--artifact-root") || "artifacts/r29b2m_r4h_r3"));
const RAW = join(ARTIFACT_ROOT, "raw");
const REPORTS = join(ARTIFACT_ROOT, "reports");
const REVIEWS = join(ARTIFACT_ROOT, "reviews");

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

if (PHASE === "provider") {
  const input = await json(join(REVIEWS, "provider_variance_review.json"));
  if (input.reviewer_class !== "codex_agent_provider_variance_review_not_human" || input.blind_to_future_treatment !== true) throw new Error("provider_reviewer_contract");
  const metrics = providerVarianceMetrics(input.reviews);
  const report = { ...metrics, review_complete: true, reviewer_class: input.reviewer_class, blind_to_future_treatment: true, temperature: 0, top_p_sent: false };
  await atomicJson(join(REPORTS, "provider_variance_review.json"), report);
  console.log(JSON.stringify(report));
} else if (PHASE === "one-call-diagnostic" || PHASE === "one-call-expansion") {
  const prefix = PHASE === "one-call-diagnostic" ? "one_call_diagnostic" : "one_call_expansion";
  const input = await json(join(REVIEWS, `${prefix}_blind_review.json`));
  if (input.reviewer_class !== "codex_agent_blind_r3_review_not_human" || input.arm_identity_known_during_review !== false) throw new Error("one_call_blind_reviewer_contract");
  const armMap = await json(join(RAW, `${prefix}_arm_map.json`));
  const metrics = oneCallReviewMetrics(input.reviews, armMap);
  const stage = PHASE === "one-call-diagnostic" ? "diagnostic" : "final";
  const decision = oneCallDecision(metrics, stage);
  const report = {
    phase: PHASE,
    reviewer_class: input.reviewer_class,
    blind_review: true,
    temperature: 0,
    top_p_sent: false,
    same_message_structure: true,
    ...metrics,
    [`passes_${stage}_gate`]: decision.passed,
    failed_gates: decision.failed_gates,
  };
  await atomicJson(join(REPORTS, `${prefix}_decision.json`), report);
  await atomicJson(join(REPORTS, "one_call_decision.json"), {
    diagnostic_passed: PHASE === "one-call-diagnostic" ? decision.passed : true,
    expansion_run: PHASE === "one-call-expansion",
    final_passed: PHASE === "one-call-expansion" ? decision.passed : null,
    proceed_to_two_stage: !decision.passed,
    terminal_candidate: PHASE === "one-call-expansion" && decision.passed ? "PASSED_ONE_CALL_CONTROLLED_HYBRID" : null,
    failed_gates: decision.failed_gates,
  });
  console.log(JSON.stringify(report));
} else if (PHASE === "two-stage") {
  const input = await json(join(REVIEWS, "two_stage_blind_review.json"));
  if (input.reviewer_class !== "codex_agent_blind_r3_review_not_human" || input.arm_identity_known_during_review !== false) throw new Error("two_stage_blind_reviewer_contract");
  const armMap = await json(join(RAW, "two_stage_arm_map.json"));
  const chains = await json(join(RAW, "two_stage_chains.json"));
  const metrics = twoStageReviewMetrics(input.reviews, armMap, chains);
  const report = {
    phase: "TWO_STAGE_LIVE_EVAL",
    reviewer_class: input.reviewer_class,
    blind_review: true,
    control_reuses_exact_canonical: chains.every((row) => row.control_output_is_exact_canonical && row.control_api_request_count === 0),
    actual_efish_critic_model_trained: false,
    oracle_critic: true,
    ...metrics,
    terminal_candidate: metrics.passed ? "PASSED_CANONICAL_DRAFT_CRITIC_HYBRID" : "BLOCKED_HYBRID_ARCHITECTURE",
  };
  await atomicJson(join(REPORTS, "two_stage_value_decision.json"), report);
  console.log(JSON.stringify(report));
} else {
  throw new Error("unknown_review_phase");
}
