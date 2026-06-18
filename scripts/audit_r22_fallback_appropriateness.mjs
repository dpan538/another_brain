#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import { gitHead, nowIso, R22_BASELINE_COMMIT, updateR22State } from "./r22_long_cycle_common.mjs";

const IN = resolve(ROOT, "artifacts/training_os/r22_shadow_coverage_baseline.json");
const OUT = resolve(ROOT, "artifacts/training_os/r22_fallback_appropriateness_report.json");

function classify(row) {
  const reason = row.candidate_fallback_reason || "";
  if (!reason) return "no_fallback";
  if (/boundary/.test(reason) || row.safety_or_boundary_status) return "justified_boundary_fallback";
  if (/uncertainty/.test(reason)) return "justified_uncertainty_fallback";
  if (/polarity/.test(reason)) return "justified_negative_polarity_fallback";
  if (/quantity/.test(reason)) return "justified_quantity_preservation_fallback";
  if (/required_text|required_fact/.test(reason)) return "justified_required_fact_fallback";
  if (/confirmation_shadow_requires_review/.test(reason)) return "unknown_requires_review";
  if (/turn_function_not_in_shadow_scope|unsupported_or_boundary_response_type/.test(reason)) return "unsupported_turn_function";
  if (/no_confident_candidate/.test(reason)) {
    if (!row.primitives_available) return "missing_structured_primitive";
    if ((row.binding_confidence ?? 1) < 0.5) return "insufficient_binding";
    if (!row.evidence_ids?.length && !row.primitives_used?.length) return "insufficient_evidence";
    return "realization_not_available";
  }
  if (/candidate_failed_semantic_verifier/.test(reason)) {
    const failures = row.semantic_verifier_result?.hard_failures || [];
    if (failures.some((failure) => /unsupported_named|quantity|polarity|uncertainty|boundary|referent/.test(failure))) return "semantic_verifier_rejection";
    return "semantic_verifier_false_positive";
  }
  return "unknown_requires_review";
}

function isUnnecessary(row, classification) {
  return (
    [
      "realization_not_available",
      "semantic_verifier_false_positive",
      "unknown_requires_review"
    ].includes(classification) &&
    row.candidate_fallback_reason !== "confirmation_shadow_requires_review" &&
    ["confirmation", "analogy_statement", "affective_disclosure", "compliment", "deepening_invitation", "topic_reentry", "reflection", "declaration_with_signal"].includes(row.turn_function) &&
    (row.binding_confidence ?? 1) >= 0.5 &&
    !row.safety_or_boundary_status
  );
}

function inc(map, key) {
  map[key || "unknown"] = (map[key || "unknown"] || 0) + 1;
}

async function main() {
  await updateR22State({ current_phase: "phase1_fallback_appropriateness" });
  const input = JSON.parse(await readFile(IN, "utf8"));
  const rows = input.rows || [];
  const classified = rows
    .filter((row) => row.candidate_fallback_reason)
    .map((row) => {
      const fallback_class = classify(row);
      return {
        ...row,
        fallback_class,
        unnecessary_conservative: isUnnecessary(row, fallback_class)
      };
    });
  const counts = {};
  const byDomain = {};
  const byTurnFunction = {};
  const byReason = {};
  for (const row of classified) {
    inc(counts, row.unnecessary_conservative ? "unnecessary_conservative_fallback" : row.fallback_class);
    inc(byDomain, `${row.domain || "unknown"}|${row.fallback_class}`);
    inc(byTurnFunction, `${row.turn_function || "unknown"}|${row.fallback_class}`);
    inc(byReason, row.candidate_fallback_reason);
  }
  const unnecessary = classified.filter((row) => row.unnecessary_conservative);
  const unknown = classified.filter((row) => row.fallback_class === "unknown_requires_review");
  const report = {
    execution_ok: true,
    behavior_ok: unnecessary.length === 0,
    audit_only: false,
    baseline_commit: R22_BASELINE_COMMIT,
    evaluated_commit: gitHead(),
    generated_at: nowIso(),
    total_fallbacks: classified.length,
    justified_fallback_count: classified.length - unnecessary.length - unknown.length,
    unnecessary_fallback_count: unnecessary.length,
    unknown_fallback_count: unknown.length,
    fallback_class_counts: counts,
    fallback_by_domain: byDomain,
    fallback_by_turn_function: byTurnFunction,
    fallback_by_reason: byReason,
    top_false_positive_extractors: classified
      .filter((row) => /false_positive|content_unit/.test(`${row.fallback_class} ${row.candidate_fallback_reason}`))
      .slice(0, 20),
    top_missing_primitive_domains: classified.filter((row) => row.fallback_class === "missing_structured_primitive").slice(0, 20),
    representative_examples: classified.slice(0, 80),
    blocking_shadow_backlog: unnecessary.slice(0, 80)
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await updateR22State({
    current_phase: "phase1_fallback_appropriateness_done",
    completed_phases: ["phase0_shadow_coverage_baseline", "phase1_fallback_appropriateness"],
    pending_failures: report.behavior_ok ? [] : [{ phase: "phase1_fallback_appropriateness", count: unnecessary.length }]
  });
  console.log(JSON.stringify({
    behavior_ok: report.behavior_ok,
    total_fallbacks: report.total_fallbacks,
    justified_fallback_count: report.justified_fallback_count,
    unnecessary_fallback_count: report.unnecessary_fallback_count,
    unknown_fallback_count: report.unknown_fallback_count,
    out: OUT
  }, null, 2));
  if (!report.behavior_ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
