#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CRITIC_ISSUES, CRITIC_STYLE_TARGETS } from "../src/hybrid_runtime/local_critic_packet_v1.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "evals/r29b2m_hybrid_product_v2/cases.jsonl");
const SOURCE_MANIFEST = join(ROOT, "evals/r29b2m_hybrid_product_v2/manifest.json");
const OUT_DIR = join(ROOT, "evals/r29b2m_hybrid_critic_v1");
const REVIEWER = "codex_agent_oracle_critic_v1_review_not_human";

const allRows = (await readFile(SOURCE, "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const sourceManifest = JSON.parse(await readFile(SOURCE_MANIFEST, "utf8"));
const pairedIds = sourceManifest.paired_case_ids;
const rows = pairedIds.map((caseId) => allRows.find((row) => row.case_id === caseId));
if (rows.some((row) => !row)) throw new Error("missing_r2_paired_fixture");

const providerBaselineIds = [
  ...rows.filter((row) => row.family === "ordinary_daily_conversation").slice(0, 2),
  ...rows.filter((row) => row.family === "emotional_acknowledgement").slice(0, 1),
  ...rows.filter((row) => row.family === "practical_daily_question").slice(0, 2),
  ...rows.filter((row) => row.family === "logic_question").slice(0, 2),
  ...rows.filter((row) => row.family === "philosophical_question").slice(0, 2),
  ...rows.filter((row) => row.family === "rewrite_summary").slice(0, 1),
  ...rows.filter((row) => row.family === "uncertainty_clarification").slice(0, 1),
  ...rows.filter((row) => row.family === "identity_privacy_boundary").slice(0, 1),
].map((row) => row.case_id);

const twoStageIds = [
  ...rows.filter((row) => row.family === "ordinary_daily_conversation").slice(0, 3),
  ...rows.filter((row) => row.family === "emotional_acknowledgement").slice(0, 3),
  ...rows.filter((row) => row.family === "practical_daily_question").slice(0, 4),
  ...rows.filter((row) => row.family === "rewrite_summary").slice(0, 2),
  ...rows.filter((row) => row.family === "comparison_opinion").slice(0, 1),
  ...rows.filter((row) => row.family === "logic_question").slice(0, 4),
  ...rows.filter((row) => row.family === "philosophical_question").slice(0, 4),
  ...rows.filter((row) => row.family === "uncertainty_clarification").slice(0, 2),
  ...rows.filter((row) => row.family === "identity_privacy_boundary").slice(0, 1),
].map((row) => row.case_id);

function criticForFamily(family) {
  const byFamily = {
    ordinary_daily_conversation: ["quiet_warm", ["too_formal"]],
    emotional_acknowledgement: ["quiet_warm", ["too_cold"]],
    practical_daily_question: ["concise_direct", ["too_verbose"]],
    rewrite_summary: ["concise_direct", ["unnaturally_structured"]],
    comparison_opinion: ["balanced", ["too_verbose"]],
    logic_question: ["matter_of_fact", ["textbook_tone"]],
    philosophical_question: ["reflective", ["too_formal", "too_verbose"]],
    uncertainty_clarification: ["concise_direct", ["too_formal"]],
    identity_privacy_boundary: ["matter_of_fact", ["customer_service_tone"]],
  };
  const [style_target, issues] = byFamily[family] ?? ["balanced", ["none"]];
  return { version: "oracle-critic-fixture.v1", style_target, issues, preferred_span_policy: "protect_first_conclusion_or_named_value" };
}

function namedValues(row) {
  const text = row.messages.map((message) => message.content).join("\n");
  const values = [
    ...text.matchAll(/\b[A-Z]\b/gu),
    ...text.matchAll(/[甲乙丙丁](?=比|说|在|最|早|晚)/gu),
  ].map((match) => match[0]);
  return [...new Set(values)];
}

const ordered = {
  r29b2m_r4h_comparison_opinion_01: ["夹灯", "墙面反光灯"],
  r29b2m_r4h_comparison_opinion_02: ["纸卡片", "手机备忘录"],
  r29b2m_r4h_logic_question_01: ["甲", "乙", "丙"],
  r29b2m_r4h_logic_question_05: ["A", "B"],
};
const stance = {
  r29b2m_r4h_logic_question_02: "yes",
  r29b2m_r4h_logic_question_03: "uncertain",
  r29b2m_r4h_logic_question_04: "yes",
  r29b2m_r4h_logic_question_05: "no",
  r29b2m_r4h_uncertainty_clarification_01: "uncertain",
};

const generated = rows.map((row) => ({
  case_id: row.case_id,
  family: row.family,
  messages: row.messages,
  oracle_local_signal_packet_v2: row.oracle_local_signal_packet_v2,
  oracle_critic_fixture: criticForFamily(row.family),
  semantic_guard_metadata: {
    protected_named_values: namedValues(row),
    ordered_alternatives: ordered[row.case_id] ?? [],
    ...(stance[row.case_id] ? { logical_stance: stance[row.case_id] } : {}),
    ...(row.family === "identity_privacy_boundary" ? { boundary_decision: "identity" } : {}),
    maximum_answer_characters: row.maximum_answer_characters,
  },
  response_quality_rubric: row.response_quality_rubric,
  maximum_answer_characters: row.maximum_answer_characters,
  provenance: "project_authored_public_safe_r29b2m_r4h_r3_oracle_critic_fixture",
  reviewer_class: REVIEWER,
  review_status: "reviewed_100_percent_for_oracle_critic_eval_only",
  split: "product_simulation_eval",
  allowed_for_training: false,
}));

const reviews = generated.map((row) => ({
  case_id: row.case_id,
  style_target_allowed: CRITIC_STYLE_TARGETS.includes(row.oracle_critic_fixture.style_target),
  issues_allowed: row.oracle_critic_fixture.issues.every((issue) => CRITIC_ISSUES.includes(issue)),
  packet_contains_no_answer_content: !Object.hasOwn(row.oracle_critic_fixture, "answer") && !Object.hasOwn(row.oracle_critic_fixture, "recommendation"),
  packet_contains_no_user_emotion: !Object.hasOwn(row.oracle_critic_fixture, "emotion") && !Object.hasOwn(row.oracle_critic_fixture, "affect"),
  preferred_span_policy_extract_only: row.oracle_critic_fixture.preferred_span_policy === "protect_first_conclusion_or_named_value",
  messages_identical_to_r2: JSON.stringify(row.messages) === JSON.stringify(allRows.find((source) => source.case_id === row.case_id).messages),
  reviewed: true,
}));
const failures = reviews.filter((row) => Object.entries(row).some(([key, value]) => key !== "case_id" && value !== true));
const casesText = generated.map((row) => JSON.stringify(row)).join("\n") + "\n";
const audit = {
  campaign: "R29B2M-R4H-R3",
  reviewer_class: REVIEWER,
  cases_reviewed: reviews.length,
  pass: failures.length === 0 && generated.length === 30 && providerBaselineIds.length === 12 && twoStageIds.length === 24,
  failures,
  actual_efish_critic_model_trained: false,
  oracle_critic: true,
  reviews,
};
const manifest = {
  campaign_id: "r29b2m_r4h_r3_controlled_critic_hybrid_v1",
  source_manifest: "evals/r29b2m_hybrid_product_v2/manifest.json",
  source_manifest_sha256: createHash("sha256").update(await readFile(SOURCE_MANIFEST)).digest("hex"),
  cases_path: "evals/r29b2m_hybrid_critic_v1/cases.jsonl",
  cases_sha256: createHash("sha256").update(casesText).digest("hex"),
  paired_30_case_ids: pairedIds,
  provider_baseline_12_case_ids: providerBaselineIds,
  one_call_diagnostic_12_case_ids: providerBaselineIds,
  two_stage_24_case_ids: twoStageIds,
  selection_method: "deterministic first-N within the frozen R4H-R2 paired manifest for each required family count",
  reviewer_class: REVIEWER,
  allowed_for_training: false,
};

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "cases.jsonl"), casesText, "utf8");
await writeFile(join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(join(OUT_DIR, "critic_audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ pass: audit.pass, cases: generated.length, provider_cases: providerBaselineIds.length, two_stage_cases: twoStageIds.length, oracle_critic: true }));
if (!audit.pass) process.exit(2);
