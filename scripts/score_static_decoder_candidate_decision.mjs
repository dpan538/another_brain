#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { profileBudgetBytes } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DECISIONS_DIR = resolve(ROOT, "static_llm/candidate_decisions/decisions");

async function decisionFiles() {
  const entries = await readdir(DECISIONS_DIR, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => resolve(DECISIONS_DIR, entry.name)).sort();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function scoreDecision(record) {
  const categories = {
    decoder_suitability: record.architecture === "decoder_only" ? 10 : record.architecture === "encoder_decoder" ? 6 : 0,
    browser_backend_feasibility: record.browser_runtime_status === "known_supported" ? 10 : record.browser_runtime_status === "needs_binding" ? 6 : record.browser_runtime_status === "needs_conversion" ? 4 : 0,
    same_origin_static_deploy_feasibility: /same-origin|static|browser/i.test(`${record.no_backend_review} ${record.conversion_path}`) ? 10 : 5,
    pro_profile_budget_feasibility: record.expected_total_bytes > 0 && record.expected_total_bytes <= profileBudgetBytes("pro_static_llm_full") ? 10 : 0,
    hobby_profile_optional_feasibility: record.expected_total_bytes > 0 && record.expected_total_bytes <= profileBudgetBytes("hobby_static_llm_lite") ? 10 : 3,
    capacity_envelope_fit: record.declared_total_asset_bytes > 0 && record.declared_total_asset_bytes <= profileBudgetBytes(record.expected_profile) ? 10 : 0,
    shard_plan_feasibility: record.declared_largest_shard_bytes > 0 && record.declared_largest_shard_bytes <= 64_000_000 ? 10 : 0,
    browser_memory_risk_review: /low|medium|reviewed|acceptable|constrained/i.test(record.browser_memory_risk || "") ? 8 : 3,
    license_provenance_clarity: record.license && record.license_url && record.source_url && record.source_revision ? 10 : 0,
    tokenizer_config_availability: record.tokenizer_type && !/placeholder|replace_with/i.test(record.tokenizer_type) ? 10 : 0,
    conversion_complexity: record.browser_runtime_status === "known_supported" ? 10 : record.browser_runtime_status === "needs_binding" ? 6 : record.browser_runtime_status === "needs_conversion" ? 4 : 0,
    chinese_mixed_language_plausibility: /reviewed|good|strong|adequate|plausible/i.test(record.chinese_support_review || "") ? 8 : 4,
    privacy_data_safety: /false|no private|public|safe/i.test(record.privacy_review || "") ? 10 : 3,
    first_token_readiness: record.browser_runtime_status === "known_supported" ? 8 : 2,
    r24_r25_gate_compatibility: /green|pass|required|must remain/i.test(record.r24_r25_gate_review || "") ? 10 : 4
  };
  const total = Object.values(categories).reduce((sum, value) => sum + value, 0);
  return {
    decision_id: record.decision_id,
    status: record.status,
    model_id_present: Boolean(record.model_id),
    selected_for_local_artifact_intake: record.status === "selected_for_local_artifact_intake",
    total_score: total,
    max_score: Object.keys(categories).length * 10,
    categories
  };
}

async function main() {
  const files = await decisionFiles();
  const records = [];
  for (const file of files) records.push(await readJson(file));
  const scores = records.map(scoreDecision);
  const selectedCount = records.filter((record) => record.status === "selected_for_local_artifact_intake").length;
  const recommendedStatus = records.length === 0
    ? "awaiting_candidate_decision"
    : selectedCount > 0
      ? "candidate_ready_for_local_artifact_intake"
      : "review_required";
  const report = {
    ok: true,
    candidate_count: records.length,
    selected_count: selectedCount,
    scores,
    recommended_status: recommendedStatus,
    notes: records.length === 0
      ? ["No real candidate decision exists yet.", "R25G remains model-agnostic and awaits a reviewed local decoder candidate."]
      : ["Scores are advisory; they do not admit weights or bypass R25E."]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
