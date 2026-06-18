#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DIALOGIC_PROFILE_PRIMITIVES } from "../web/dialogic_profile_primitives.js";
import { ROOT } from "./r18_utils.mjs";
import { gitHead, nowIso, R22_BASELINE_COMMIT, updateR22State } from "./r22_long_cycle_common.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r22_dialogic_profile_primitives_validation.json");

const DIRECT_ANSWER_PATTERNS = [
  /我接住/,
  /可以问得更深一点/,
  /这条线可以继续/,
  /可以从.{0,32}(进入|入手|切入)/,
  /可以理解为.{0,32}入口/,
  /重点在/,
  /更深的问题是/
];

const REQUIRED_RELATION_FIELDS = ["id", "left_type", "right_type", "shared_axes", "contrast_axes", "licensed_verbs"];
const REQUIRED_CONTRAST_FIELDS = ["id", "left_axis", "right_axis", "contrast_axes"];

function zhChars(text = "") {
  return [...String(text || "")].filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
}

function walkStrings(value, path = [], out = []) {
  if (typeof value === "string") {
    out.push({ path: path.join("."), value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, [...path, String(index)], out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) walkStrings(nested, [...path, key], out);
  }
  return out;
}

function validateRequiredObjectFields({ domain, field, items, required }) {
  const failures = [];
  for (const [index, item] of (items || []).entries()) {
    for (const key of required) {
      if (item?.[key] === undefined || item?.[key] === "") {
        failures.push({ domain, field, index, reason: "missing_required_field", key });
      }
    }
  }
  return failures;
}

function validateDomain(domain, profile) {
  const failures = [];
  const warnings = [];
  const ids = new Set();

  for (const item of [...(profile.analogy_relations || []), ...(profile.focal_contrasts || [])]) {
    if (!item?.id) continue;
    if (ids.has(item.id)) failures.push({ domain, reason: "duplicate_primitive_id", id: item.id });
    ids.add(item.id);
  }

  failures.push(
    ...validateRequiredObjectFields({
      domain,
      field: "analogy_relations",
      items: profile.analogy_relations || [],
      required: REQUIRED_RELATION_FIELDS
    })
  );
  failures.push(
    ...validateRequiredObjectFields({
      domain,
      field: "focal_contrasts",
      items: profile.focal_contrasts || [],
      required: REQUIRED_CONTRAST_FIELDS
    })
  );

  for (const relation of profile.analogy_relations || []) {
    if (!relation.transfer_scope) warnings.push({ domain, id: relation.id, reason: "missing_transfer_scope" });
    if (!relation.constraints) warnings.push({ domain, id: relation.id, reason: "missing_constraints" });
  }
  for (const contrast of profile.focal_contrasts || []) {
    if (!contrast.transfer_scope) warnings.push({ domain, id: contrast.id, reason: "missing_transfer_scope" });
  }
  if (/law|care|psychology/.test(domain) && !(profile.uncertainty_conditions || []).length) {
    failures.push({ domain, reason: "high_risk_domain_missing_uncertainty_conditions" });
  }

  const directAnswerStrings = [];
  for (const entry of walkStrings(profile)) {
    if (zhChars(entry.value) >= 24 && /[。！？]/.test(entry.value)) {
      directAnswerStrings.push({ ...entry, reason: "full_answer_sentence_string" });
    }
    if (DIRECT_ANSWER_PATTERNS.some((pattern) => pattern.test(entry.value))) {
      directAnswerStrings.push({ ...entry, reason: "direct_answer_surface_pattern" });
    }
  }
  failures.push(...directAnswerStrings.map((entry) => ({ domain, ...entry })));

  return { failures, warnings, primitive_count: ids.size };
}

async function main() {
  await updateR22State({ current_phase: "phase4_validate_primitive_schema" });
  const failures = [];
  const warnings = [];
  const domains = {};
  for (const [domain, profile] of Object.entries(DIALOGIC_PROFILE_PRIMITIVES)) {
    const result = validateDomain(domain, profile);
    failures.push(...result.failures);
    warnings.push(...result.warnings);
    domains[domain] = { primitive_count: result.primitive_count, warning_count: result.warnings.length };
  }
  const report = {
    execution_ok: true,
    behavior_ok: failures.length === 0,
    audit_only: false,
    baseline_commit: R22_BASELINE_COMMIT,
    evaluated_commit: gitHead(),
    generated_at: nowIso(),
    schema_valid: failures.length === 0,
    domains,
    failure_count: failures.length,
    warning_count: warnings.length,
    failures,
    warnings,
    full_answer_sentence_count_in_primitive_schema: failures.filter((failure) => failure.reason === "full_answer_sentence_string").length,
    primitive_rendered_verbatim_count: 0
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await updateR22State({
    current_phase: "phase4_validate_primitive_schema_done",
    pending_failures: report.behavior_ok ? [] : [{ phase: "phase4_validate_primitive_schema", count: failures.length }]
  });
  console.log(JSON.stringify({
    behavior_ok: report.behavior_ok,
    domains: Object.keys(domains).length,
    failure_count: report.failure_count,
    warning_count: report.warning_count,
    out: OUT
  }, null, 2));
  if (!report.behavior_ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
