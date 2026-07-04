#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25aq/r25aq_sampler_variant_simulation.json";
const DOC = "docs/R25AQ_SAMPLER_VARIANT_SIMULATION.md";
const SPLITS = { train: 384, dev: 96, heldout: 96 };
const TARGETS = ["project_continuation", "repair_after_weak_answer", "local_first_static_browser_reasoning", "style_preference", "tool_status_honesty", "bounded_judgment"];
const VARIANTS = [
  { id: "r25ar_balanced_zh65_mixed25_en10", mix: { zh: 0.65, mixed: 0.25, en: 0.1 }, max_steps: 100, learning_rate: 0.004 },
  { id: "r25ar_zh70_mixed25_en5", mix: { zh: 0.7, mixed: 0.25, en: 0.05 }, max_steps: 100, learning_rate: 0.004 },
  { id: "r25ar_zh70_mixed20_en10_lower_intensity", mix: { zh: 0.7, mixed: 0.2, en: 0.1 }, max_steps: 60, learning_rate: 0.003 },
  { id: "r25ar_zh70_mixed20_en10_shorter_steps", mix: { zh: 0.7, mixed: 0.2, en: 0.1 }, max_steps: 50, learning_rate: 0.004 },
  { id: "r25ar_zh70_mixed20_en10_more_personal_targets", mix: { zh: 0.7, mixed: 0.2, en: 0.1 }, max_steps: 80, learning_rate: 0.0035, personal_target_bias: true },
  { id: "r25ar_zh65_mixed25_en10_lower_intensity", mix: { zh: 0.65, mixed: 0.25, en: 0.1 }, max_steps: 60, learning_rate: 0.003, recommended: true }
];

async function writeText(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, value, "utf8");
}

async function writeJson(path, value) {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function readJsonl(path) {
  try {
    const text = await readFile(resolve(ROOT, path), "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function splitFromFile(name) {
  if (/_train\.jsonl$|\/train\.jsonl$|r25l_train\.jsonl$/.test(name)) return "train";
  if (/_dev\.jsonl$|\/dev\.jsonl$|r25l_dev\.jsonl$/.test(name)) return "dev";
  if (/_heldout\.jsonl$|\/heldout\.jsonl$|r25l_heldout\.jsonl$/.test(name)) return "heldout";
  return "unknown";
}

function lang(row) {
  return ["zh", "mixed", "en"].includes(row.language) ? row.language : "other";
}

function hasTarget(row, target) {
  const targets = Array.isArray(row.personal_color_targets) ? row.personal_color_targets : [];
  const tags = Array.isArray(row.policy_tags) ? row.policy_tags : [];
  const family = String(row.task_family || row.task_type || row.transformation_type || "");
  return targets.includes(target) || tags.includes(target) || family.includes(target);
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function targetCounts(total, mix) {
  const en = Math.floor(total * mix.en);
  const mixed = Math.round(total * mix.mixed);
  const zh = total - mixed - en;
  return { zh, mixed, en, total };
}

function simulateVariant(variant, rowsBySplit) {
  const bySplit = {};
  let replacementRisk = "low";
  for (const [split, total] of Object.entries(SPLITS)) {
    const counts = targetCounts(total, variant.mix);
    const available = countBy(rowsBySplit[split] || [], lang);
    const shortage = Object.fromEntries(["zh", "mixed", "en"].map((language) => [language, Math.max(0, counts[language] - (available[language] || 0))]));
    if (Object.values(shortage).some((value) => value > 0)) replacementRisk = "high";
    bySplit[split] = { target_counts: counts, available_without_replacement: available, shortage };
  }
  const targetCoverage = Object.fromEntries(TARGETS.map((target) => [target, countBy(rowsBySplit.train || [], (row) => hasTarget(row, target) ? "hit" : "miss").hit || 0]));
  const sourceCounts = countBy(rowsBySplit.train || [], (row) => row.provenance?.source_type || row.source_category || "unknown");
  const maxSourceShare = Object.values(sourceCounts).reduce((max, value) => Math.max(max, value), 0) / Math.max(1, (rowsBySplit.train || []).length);
  return {
    id: variant.id,
    train_dev_heldout_target_counts: bySplit,
    repeated_row_risk: replacementRisk,
    mixed_en_coverage: {
      train_mixed_target: bySplit.train.target_counts.mixed,
      train_en_target: bySplit.train.target_counts.en,
      mixed_priority: variant.mix.mixed >= 0.25 ? "improved" : "baseline",
      english_cap_ok: variant.mix.en <= 0.1
    },
    personal_target_availability: targetCoverage,
    source_concentration_risk: maxSourceShare >= 0.5 ? "moderate" : "low",
    intensity: {
      max_steps: variant.max_steps,
      learning_rate: variant.learning_rate,
      lower_than_r25ao: variant.max_steps < 100 || variant.learning_rate < 0.004
    },
    expected_tradeoff: variant.mix.mixed >= 0.25 && variant.learning_rate <= 0.003
      ? "better mixed robustness with lower overfit pressure; slightly less zh dominance"
      : variant.mix.en < 0.1
        ? "protects English cap but may not address mixed enough"
        : "baseline sampler change; quality risk remains if intensity is unchanged"
  };
}

async function main() {
  const names = (await readdir(resolve(ROOT, "training/llm_corpus"))).filter((name) => name.endsWith(".jsonl"));
  const rowsBySplit = { train: [], dev: [], heldout: [] };
  for (const name of names) {
    const split = splitFromFile(name);
    if (!rowsBySplit[split]) continue;
    const rows = await readJsonl(`training/llm_corpus/${name}`);
    for (const row of rows) rowsBySplit[split].push(row);
  }
  const r25ao = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_dataset_report.json");
  const r25apNext = await readJson("artifacts/training_os/small_decoder_pilot/r25ap/r25ap_next_step_decision.json");
  const simulations = VARIANTS.map((variant) => simulateVariant(variant, rowsBySplit));
  const recommended = simulations.find((item) => item.id === "r25ar_zh65_mixed25_en10_lower_intensity") || simulations[0];
  const report = {
    ok: true,
    skipped: false,
    training_ran_in_r25aq: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    dataset_files_written: false,
    phase4_approved: false,
    source_rows_seen_by_split: Object.fromEntries(Object.entries(rowsBySplit).map(([split, rows]) => [split, rows.length])),
    r25ao_reference_mix: r25ao?.actual_train_language_mix || null,
    r25ap_recommendation: r25apNext?.recommendation || null,
    variants: simulations,
    recommended_variant: recommended.id,
    recommendation_reason: [
      "mixed bucket was weaker than zh and is more important than generic English for this project",
      "English remains capped at 10%",
      "lower steps and learning rate reduce the repeat-risk from R25AO train/dev fitting with heldout regression",
      "architecture stays one-layer and phase_4 stays blocked"
    ]
  };

  await writeJson(OUT, report);
  const variantLines = simulations.map((item) => `- ${item.id}: train zh/mixed/en ${item.train_dev_heldout_target_counts.train.target_counts.zh}/${item.train_dev_heldout_target_counts.train.target_counts.mixed}/${item.train_dev_heldout_target_counts.train.target_counts.en}; risk ${item.repeated_row_risk}; ${item.expected_tradeoff}`).join("\n");
  await writeText(DOC, `# R25AQ Sampler Variant Simulation\n\nR25AQ does not train, run a tokenizer dry-run, expand corpus, or write train/dev/heldout dataset files. This simulation only counts available tracked corpus rows and target allocations.\n\n## Simulated Variants\n\n${variantLines}\n\n## Recommendation\n\nRecommended design: \`${recommended.id}\`.\n\nThis choice raises mixed coverage while keeping English capped at 10%, lowers training intensity from R25AO, keeps the one-layer pilot architecture, and keeps phase_4 blocked. It is not approved by R25AQ; a future R25AR run requires fresh reviewer approval.\n\nProduct training progress remains 0%. No weights, artifacts, backend/storage path, external APIs/downloads, chain-of-thought, or private raw data are added.\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
