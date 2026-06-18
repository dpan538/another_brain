#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import { extractSurfaceContentUnits } from "../web/surface_content_units.js";
import { verifySurfaceCandidate } from "../web/surface_semantic_verifier.js";
import { gitHead, jsonlRows, nowIso, R22_BASELINE_COMMIT, updateR22State } from "./r22_long_cycle_common.mjs";

const DIR = resolve(ROOT, "evals/r22_semantic_preservation");
const OUT = resolve(ROOT, "artifacts/training_os/r22_surface_semantic_selectivity_report.json");

async function loadRows() {
  const rows = [];
  for (const file of await readdir(DIR)) {
    if (!file.endsWith(".jsonl")) continue;
    for (const row of jsonlRows(await readFile(resolve(DIR, file), "utf8"))) {
      if (!row.expect || row.current === undefined || row.candidate === undefined) continue;
      rows.push({ ...row, file });
    }
  }
  return rows;
}

function runCase(row) {
  const binding = row.binding || {};
  const responseType = row.response_type || "answer";
  const responseMode = row.response_mode || "contextual_answer";
  const evidenceIds = row.evidence_ids || [];
  const currentUnits = extractSurfaceContentUnits({
    answer: row.current,
    query: row.query,
    plan: row.plan || {},
    binding,
    responseType,
    responseMode,
    activeReferent: binding.active_referent || binding.target_ids?.[0] || "",
    evidenceIds
  });
  const candidateUnits = extractSurfaceContentUnits({
    answer: row.candidate,
    query: row.query,
    plan: row.plan || {},
    binding,
    responseType,
    responseMode,
    activeReferent: currentUnits.active_referent || binding.active_referent || binding.target_ids?.[0] || "",
    evidenceIds
  });
  const verification = verifySurfaceCandidate({
    query: row.query,
    currentAnswer: row.current,
    candidateAnswer: row.candidate,
    currentUnits,
    candidateUnits,
    plan: row.plan || {},
    binding,
    responseType,
    responseMode,
    turnFunction: row.turn_function || "",
    surfaceControl: row.surface_control || {},
    evidenceIds
  });
  const shouldReject = row.expect === "reject";
  const expectedFailures = row.expected_failure_any || [];
  const expectedFailureHit = !expectedFailures.length || expectedFailures.some((failure) => verification.hard_failures.includes(failure));
  const passed = shouldReject ? !verification.ok && expectedFailureHit : verification.ok;
  return {
    ...row,
    passed,
    rejected: !verification.ok,
    expectedFailureHit,
    verification
  };
}

function inc(map, key) {
  map[key || "unknown"] = (map[key || "unknown"] || 0) + 1;
}

async function main() {
  await updateR22State({ current_phase: "phase2_semantic_selectivity" });
  const rows = await loadRows();
  const results = rows.map(runCase);
  const failures = results.filter((row) => !row.passed);
  const matrix = {};
  const harmful = results.filter((row) => row.expect === "reject");
  const benign = results.filter((row) => row.expect === "accept");
  for (const row of results) {
    inc(matrix, `${row.file}|${row.family}|${row.expect}|${row.passed ? "passed" : "failed"}`);
  }
  const report = {
    execution_ok: true,
    behavior_ok: failures.length === 0 && benign.some((row) => row.verification.ok),
    audit_only: false,
    baseline_commit: R22_BASELINE_COMMIT,
    evaluated_commit: gitHead(),
    generated_at: nowIso(),
    total: rows.length,
    harmful_total: harmful.length,
    harmful_rejected: harmful.filter((row) => !row.verification.ok).length,
    benign_total: benign.length,
    benign_accepted: benign.filter((row) => row.verification.ok).length,
    verifier_false_negative_count: harmful.filter((row) => row.verification.ok).length,
    verifier_false_positive_count: benign.filter((row) => !row.verification.ok).length,
    fallback_due_to_verifier_count: 0,
    selectivity_confusion_matrix: matrix,
    harmful_mutation_rejection_by_family: Object.fromEntries(
      Object.entries(
        harmful.reduce((acc, row) => {
          const key = row.family || "unknown";
          acc[key] ||= { total: 0, rejected: 0 };
          acc[key].total += 1;
          if (!row.verification.ok) acc[key].rejected += 1;
          return acc;
        }, {})
      )
    ),
    benign_paraphrase_acceptance_by_family: Object.fromEntries(
      Object.entries(
        benign.reduce((acc, row) => {
          const key = row.family || "unknown";
          acc[key] ||= { total: 0, accepted: 0 };
          acc[key].total += 1;
          if (row.verification.ok) acc[key].accepted += 1;
          return acc;
        }, {})
      )
    ),
    failures,
    results
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await updateR22State({
    current_phase: "phase2_semantic_selectivity_done",
    completed_phases: ["phase0_shadow_coverage_baseline", "phase1_fallback_appropriateness", "phase2_semantic_selectivity"],
    pending_failures: report.behavior_ok ? [] : [{ phase: "phase2_semantic_selectivity", count: failures.length }]
  });
  console.log(JSON.stringify({
    behavior_ok: report.behavior_ok,
    total: report.total,
    harmful_rejected: report.harmful_rejected,
    benign_accepted: report.benign_accepted,
    false_positive: report.verifier_false_positive_count,
    false_negative: report.verifier_false_negative_count,
    failures: failures.slice(0, 10),
    out: OUT
  }, null, 2));
  if (!report.behavior_ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
