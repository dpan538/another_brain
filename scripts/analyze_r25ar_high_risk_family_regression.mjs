#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25as/r25as_high_risk_family_regression.json";
const DOC = "docs/R25AS_HIGH_RISK_FAMILY_REGRESSION.md";
const FAMILIES = [
  "no_backend_policy",
  "release_packaging_boundary",
  "verify_draft",
  "retrieval_grounded_answer",
  "constraint_preservation",
  "draft_answer",
  "Chinese_project_decision"
];

async function readJson(path) {
  try { return JSON.parse(await readFile(resolve(ROOT, path), "utf8")); } catch { return null; }
}
async function write(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}
async function writeJson(path, value) { await write(path, `${JSON.stringify(value, null, 2)}\n`); }
function loss(entry) {
  const n = Number(entry?.average_next_token_loss);
  return Number.isFinite(n) ? n : null;
}
function rows(entry) {
  return Number(entry?.sequence_count || entry?.rows || 0);
}

async function main() {
  const arBreak = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_mixed_repair_breakdown.json");
  const arData = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_dataset_report.json");
  const aqHigh = await readJson("artifacts/training_os/small_decoder_pilot/r25aq/r25aq_high_loss_family_review.json");
  const aoBreak = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json");
  if (!arBreak || !arData) {
    const skipped = { ok: true, skipped: true, reason: "ignored_artifacts_missing", training_ran: false, phase4_approved: false };
    await writeJson(OUT, skipped);
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }
  const byFamily = arBreak.by_task_family || {};
  const aoFamily = aoBreak?.by_task_family || {};
  const familyReports = FAMILIES.map((family) => {
    const direct = byFamily[family];
    const alternatives = Object.entries(byFamily).filter(([key]) => key.toLowerCase().includes(family.toLowerCase()));
    const candidate = direct || alternatives[0]?.[1] || null;
    const count = rows(candidate);
    const avgLoss = loss(candidate);
    return {
      family,
      represented_in_breakdown: Boolean(candidate),
      sequence_count: count,
      average_next_token_loss: avgLoss,
      r25ao_average_next_token_loss: loss(aoFamily[family]),
      structural_only: candidate === null,
      status: !candidate ? "underrepresented_or_schema_mismatch"
        : count < 3 ? "underrepresented"
          : avgLoss !== null && avgLoss > Number(arBreak.heldout_loss) ? "weak"
            : "covered"
    };
  });
  const highLossFamilies = Object.entries(byFamily)
    .map(([family, entry]) => ({ family, sequence_count: rows(entry), average_next_token_loss: loss(entry) }))
    .filter((entry) => Number.isFinite(entry.average_next_token_loss))
    .sort((a, b) => b.average_next_token_loss - a.average_next_token_loss)
    .slice(0, 8);
  const report = {
    ok: true,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    phase4_approved: false,
    families: familyReports,
    high_loss_families: highLossFamilies,
    risk_focus_target_coverage: arData.risk_focus_target_coverage || arBreak.risk_focus_target_coverage || {},
    r25aq_expectations: aqHigh?.high_loss_or_high_risk_families || aqHigh?.recommendations || null,
    structural_only_if_no_per_row_loss: false,
    hypotheses: [
      "Risk-focus rows were present, but presence did not translate into lower heldout loss.",
      "Mixed/en buckets and several sparse task families likely need corpus/eval quality review before more pilots.",
      "The sampler emphasized repair targets, but source concentration and template/task-family mismatch remain plausible."
    ],
    recommendation: "corpus_quality_review_only"
  };
  await writeJson(OUT, report);
  const table = familyReports.map((row) => `| ${row.family} | ${row.sequence_count} | ${row.average_next_token_loss?.toFixed?.(4) || "n/a"} | ${row.status} |`).join("\n");
  await write(DOC, `# R25AS High Risk Family Regression

R25AS does not train or rerun evaluation. This report reads the completed R25AR breakdown and dataset reports.

| Family | Sequences | Loss | Status |
| --- | ---: | ---: | --- |
${table}

High-risk coverage existed, but the repaired sampler did not repair heldout behavior. The likely next work is review-only: inspect corpus quality, source concentration, and task-family/eval distribution before any fresh pilot approval.
`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
