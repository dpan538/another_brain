#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const DOCS = [
  "docs/R24_INTELLIGENCE_RECOVERY.md",
  "docs/R24B_SHARD_RUNTIME.md",
  "docs/R24C_BEHAVIOR_RECOVERY.md",
  "docs/R24D_HELDOUT_GENERALIZATION.md",
  "docs/LONG_HORIZON_TRAINING.md",
  "docs/R24E_RECOVERY_CANDIDATE.md",
  "docs/R24F_KNOWLEDGE_BUILD_SOURCE_MIGRATION.md",
  "docs/R24G_KNOWLEDGE_SOURCE_DERIVATION.md"
];

async function readMaybe(rel) {
  try {
    return await readFile(resolve(ROOT, rel), "utf8");
  } catch {
    return "";
  }
}

function contextFor(lines, index, radius = 5) {
  return lines.slice(Math.max(0, index - radius), Math.min(lines.length, index + radius + 1)).join(" ");
}

async function main() {
  const failures = [];
  const docs = [];
  for (const rel of DOCS) {
    const text = await readMaybe(rel);
    if (text) docs.push({ rel, text, lines: text.split(/\r?\n/) });
  }

  for (const doc of docs) {
    doc.lines.forEach((line, index) => {
      const context = contextFor(doc.lines, index);
      if (/0\.19047619047619047|0\.08333333333333333/.test(line) && !/historical|baseline|starting|initial|after r24b|before/i.test(context)) {
        failures.push({ file: doc.rel, line: index + 1, type: "historical_baseline_not_labeled", text: line.trim() });
      }
      if (/0\.9761904761904762/.test(line) && !/older|original|previous|recorded|discrepancy/i.test(context)) {
        failures.push({ file: doc.rel, line: index + 1, type: "stale_r24c_score_not_labeled", text: line.trim() });
      }
      if (/0\.9666666666666667|29 of 30|29\/30/.test(line) && !/before r24e|pre-r24e|historical|r24d|improved from/i.test(context)) {
        failures.push({ file: doc.rel, line: index + 1, type: "stale_r24d_score_not_labeled", text: line.trim() });
      }
      if (/training is enabled by default|training remains enabled|训练默认开启/i.test(line)) {
        failures.push({ file: doc.rel, line: index + 1, type: "claims_training_enabled", text: line.trim() });
      }
      if (/weights were added|model weights.*added|添加.*权重/i.test(line) && !/\bno\b|not|without|没有|未|不/i.test(line)) {
        failures.push({ file: doc.rel, line: index + 1, type: "claims_weights_added", text: line.trim() });
      }
      if (/dialog_rules\.js.*imports.*knowledge_base\.generated/i.test(line) && !/no longer|does not|fail if|removed|不再|禁止/i.test(line)) {
        failures.push({ file: doc.rel, line: index + 1, type: "claims_runtime_monolith_import", text: line.trim() });
      }
      if (/R24D.*does not exist|R24D.*not run|R24D.*has not run/i.test(line)) {
        failures.push({ file: doc.rel, line: index + 1, type: "claims_r24d_missing", text: line.trim() });
      }
    });
  }

  const allText = docs.map((doc) => doc.text).join("\n").toLowerCase();
  for (const required of [
    "check:intelligence-recovery",
    "check:long-horizon",
    "check:r24d-heldout-recovery",
    "check:long-horizon-heldout",
    "knowledge_sources/registry.json",
    "training remains disabled"
  ]) {
    if (!allText.includes(required)) failures.push({ type: "missing_required_current_story", text: required });
  }

  const trainingPolicy = await readMaybe("web/training_policy.js");
  for (const flag of [
    "llmTrainingEnabledByDefault: false",
    "experimentalGeneratorEnabledByDefault: false",
    "personal200mEnabledByDefault: false",
    "externalSyntheticSamplesEnabledByDefault: false"
  ]) {
    if (!trainingPolicy.includes(flag)) failures.push({ type: "training_policy_flag_not_false", text: flag });
  }

  const dialogRules = await readMaybe("web/dialog_rules.js");
  if (/knowledge_base\.generated\.js/.test(dialogRules)) {
    failures.push({ type: "dialog_rules_runtime_imports_monolith" });
  }

  const report = {
    ok: failures.length === 0,
    docs_scanned: docs.map((doc) => doc.rel),
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
