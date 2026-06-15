#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { ARTIFACT_DIR, ROOT, readJson, readJsonl, splitCounts, writeJson } from "./r18_utils.mjs";

const REPORT = resolve(ARTIFACT_DIR, "r18_completion_gate_report.json");

const THRESHOLDS = Object.freeze({
  candidate_sources_min: 80,
  admitted_sources_min: 10,
  rejected_sources_min: 25,
  reasoning_dataset_candidates_min: 25,
  reasoning_sources_admitted_min: 2,
  external_cards_min: 5000,
  relation_edges_min: 8000,
  reasoning_rows_min: 50000,
  hard_negative_ratio_min: 0.25,
  blind_split_ratio_min: 0.1,
  persona_method_rows_min: 5000,
  controlled_gate_cycles_min: 5,
  blackbox_prompts_min: 500,
  blackbox_cycles_min: 5,
  memory_stress_cases_min: 500,
  webgpu_browser_test_attempted: true,
  wasm_fallback_required: true,
  npm_check_required: true
});

function checkMin(name, observed, min, blockers = []) {
  const ok = Number(observed || 0) >= min;
  return { name, ok, observed: Number(observed || 0), required: min, blockers };
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

async function main() {
  const openSources = await readJsonl(resolve(ROOT, "data/external_sources/open_dataset_registry.jsonl"));
  const admittedSources = await readJsonl(resolve(ROOT, "data/external_sources/admitted_open_sources.jsonl"));
  const rejectedSources = await readJsonl(resolve(ROOT, "data/external_sources/rejected_open_sources.jsonl"));
  const reasoningSources = await readJsonl(resolve(ROOT, "data/external_sources/reasoning_dataset_registry.jsonl"));
  const externalCards = await readJsonl(resolve(ROOT, "data/culture_cards/r18_external_knowledge_cards.jsonl"));
  const relationEdges = await readJsonl(resolve(ROOT, "data/culture_cards/r18_external_relation_edges.jsonl"));
  const reasoningRows = await readJsonl(resolve(ARTIFACT_DIR, "r18_reasoning_trace_training.jsonl"));
  const personaRows = await readJsonl(resolve(ARTIFACT_DIR, "r18_persona_method_training.jsonl"));
  const gateMetrics = await readJson(resolve(ARTIFACT_DIR, "r18_controlled_gate_training_metrics.json"), {});
  const memoryStress = await readJson(resolve(ARTIFACT_DIR, "r18_16turn_stress_report.json"), {});
  const blackbox = await readJson(resolve(ARTIFACT_DIR, "r18_blackbox_generalization_report.json"), {});
  const webgpu = await readJson(resolve(ARTIFACT_DIR, "r18_webgpu_reality_report.json"), {});
  const checkRelease = await readJson(resolve(ARTIFACT_DIR, "r18_final_check_snapshot.json"), {});

  const reasoningAdmitted = reasoningSources.filter((row) => row.admission_status === "admitted");
  const hardNegativeRows = reasoningRows.filter((row) => Array.isArray(row.bad_answers) && row.bad_answers.length > 0).length;
  const splits = splitCounts(reasoningRows);
  const blindRatio = ratio(splits.blind || 0, reasoningRows.length);
  const hardNegativeRatio = ratio(hardNegativeRows, reasoningRows.length);
  const completionBlockers = [];

  if (!webgpu.real_browser_benchmark) completionBlockers.push("real browser WebGPU benchmark was not completed");
  if (!webgpu.wasm_fallback_available) completionBlockers.push("WASM fallback was not validated by browser benchmark");
  if ((gateMetrics.cycles || gateMetrics.training_cycles || 0) < THRESHOLDS.controlled_gate_cycles_min) {
    completionBlockers.push("controlled gate has not run enough R18 cycles");
  }

  const checks = [
    checkMin("candidate_sources", openSources.length, THRESHOLDS.candidate_sources_min),
    checkMin("admitted_sources", admittedSources.length, THRESHOLDS.admitted_sources_min),
    checkMin("rejected_sources", rejectedSources.length, THRESHOLDS.rejected_sources_min),
    checkMin("reasoning_dataset_candidates", reasoningSources.length, THRESHOLDS.reasoning_dataset_candidates_min),
    checkMin("reasoning_sources_admitted", reasoningAdmitted.length, THRESHOLDS.reasoning_sources_admitted_min),
    checkMin("external_cards", externalCards.length, THRESHOLDS.external_cards_min),
    checkMin("relation_edges", relationEdges.length, THRESHOLDS.relation_edges_min),
    checkMin("reasoning_rows", reasoningRows.length, THRESHOLDS.reasoning_rows_min),
    { name: "hard_negative_ratio", ok: hardNegativeRatio >= THRESHOLDS.hard_negative_ratio_min, observed: hardNegativeRatio, required: THRESHOLDS.hard_negative_ratio_min },
    { name: "blind_split_ratio", ok: blindRatio >= THRESHOLDS.blind_split_ratio_min, observed: blindRatio, required: THRESHOLDS.blind_split_ratio_min },
    checkMin("persona_method_rows", personaRows.length, THRESHOLDS.persona_method_rows_min),
    checkMin("controlled_gate_cycles", gateMetrics.cycles || gateMetrics.training_cycles || 0, THRESHOLDS.controlled_gate_cycles_min),
    checkMin("blackbox_prompts", blackbox.total || blackbox.prompts || 0, THRESHOLDS.blackbox_prompts_min),
    checkMin("blackbox_cycles", blackbox.cycles || 0, THRESHOLDS.blackbox_cycles_min),
    checkMin("memory_stress_cases", memoryStress.total || memoryStress.cases || 0, THRESHOLDS.memory_stress_cases_min),
    { name: "webgpu_browser_test_attempted", ok: webgpu.browser_test_attempted === true, observed: Boolean(webgpu.browser_test_attempted), required: true },
    { name: "wasm_fallback_required", ok: webgpu.wasm_fallback_available === true, observed: Boolean(webgpu.wasm_fallback_available), required: true },
    { name: "npm_check_required", ok: checkRelease.npm_check_passed === true || existsSync(resolve(ARTIFACT_DIR, "casepack_eval_report.json")), observed: Boolean(checkRelease.npm_check_passed), required: true }
  ];

  const unmet = checks.filter((check) => !check.ok);
  const report = {
    generated_at: new Date().toISOString(),
    thresholds: THRESHOLDS,
    checks,
    splits,
    hard_negative_rows: hardNegativeRows,
    hard_negative_ratio: hardNegativeRatio,
    blind_split_ratio: blindRatio,
    blockers: completionBlockers,
    verdict: unmet.length === 0 ? "completed" : "safe_partial",
    unmet_criteria: unmet,
    note: unmet.length === 0
      ? "R18 proof thresholds passed."
      : "R18 proof thresholds are not all satisfied; this must be reported as safe_partial unless fixed."
  };

  await writeJson(REPORT, report);
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== "completed") process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

