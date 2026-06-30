#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/small_decoder_second_pilot_config.json";
const ANALYSIS_PATH = "artifacts/training_os/small_decoder_pilot/r25n/r25n_small_pilot_analysis.json";
const HELDOUT_PATH = "artifacts/training_os/small_decoder_pilot/r25n/r25n_heldout_eval_report.json";
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25o/r25o_second_pilot_plan.json";

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function readJsonIfPresent(path) {
  return (await exists(path)) ? readJson(path) : null;
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function scoreVariant(variant, analysis, heldout) {
  let score = 0;
  const reasons = [];
  if (variant.run_id === "r25p_more_sequences_128") {
    score += 4;
    reasons.push("R25M showed only a small loss decrease, so doubling sequences is the lowest-risk way to test stronger signal before architecture changes.");
  }
  if (variant.max_context_tokens === 64) {
    score += 1;
    reasons.push("Keeping context at 64 isolates data-volume effects from context-length risk.");
  }
  if (variant.learning_rate === 0.01 && analysis?.signal_strength === "small_loss_decrease_pipeline_signal") {
    score += 1;
    reasons.push("R25M was stable at learning_rate 0.01, so one controlled data-size change is preferable.");
  }
  if (variant.run_id === "r25p_decoder_like_attention_if_backend_supports") {
    score -= 2;
    reasons.push("Attention-path exploration should wait until replayable checkpoint plumbing is proven.");
  }
  if (variant.max_context_tokens > 64) {
    score -= 1;
    reasons.push("Longer context should be delayed until replay loss exists for an apples-to-apples comparison.");
  }
  if (heldout?.metric_name === "heldout_next_token_pair_coverage" && heldout.heldout_metric >= 0.6) {
    score += 1;
    reasons.push("R25N structural held-out coverage passed, so a bounded data expansion is reviewable.");
  }
  return { score, reasons };
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const analysis = await readJsonIfPresent(ANALYSIS_PATH);
  const heldout = await readJsonIfPresent(HELDOUT_PATH);
  const failures = [];

  if (config.training_will_run !== false) failures.push({ code: "r25o_config_must_not_run_training" });
  if (config.fresh_approval_required !== true) failures.push({ code: "fresh_approval_required_must_be_true" });
  if (!Array.isArray(config.variants) || config.variants.length < 5) failures.push({ code: "expected_second_pilot_variants_missing" });

  const variantScores = [];
  for (const variant of config.variants || []) {
    if (variant.training_allowed_by_default !== false) failures.push({ code: "variant_training_allowed_by_default", run_id: variant.run_id });
    if (variant.requires_fresh_approval !== true) failures.push({ code: "variant_missing_fresh_approval_requirement", run_id: variant.run_id });
    if (variant.product_model !== false) failures.push({ code: "variant_claims_product_model", run_id: variant.run_id });
    if (variant.release_checkpoint !== false) failures.push({ code: "variant_claims_release_checkpoint", run_id: variant.run_id });
    if (variant.commit_weights_allowed !== false) failures.push({ code: "variant_allows_weight_commit", run_id: variant.run_id });
    if (!String(variant.heldout_source || "").endsWith("r25l_heldout.jsonl")) failures.push({ code: "variant_missing_r25l_heldout_eval_source", run_id: variant.run_id });
    variantScores.push({ run_id: variant.run_id, ...scoreVariant(variant, analysis, heldout) });
  }

  variantScores.sort((a, b) => b.score - a.score || a.run_id.localeCompare(b.run_id));
  const selected = variantScores[0] || null;
  const report = {
    ok: failures.length === 0,
    training_will_run: false,
    recommended_variant: selected?.run_id || null,
    reasons: selected?.reasons || [],
    variant_scores: variantScores,
    based_on: {
      r25m_analysis_status: analysis?.classification || analysis?.status || "not_available",
      r25n_heldout_status: heldout?.ok ? (heldout.skipped ? "skipped" : "passed_structural_eval") : "not_available",
      r25n_heldout_metric: heldout?.heldout_metric ?? null
    },
    must_not_do: [
      "do not run R25P without a fresh one-shot approval marker",
      "do not reuse consumed R25K or R25M approvals",
      "do not commit replayable or digest checkpoints",
      "do not treat a small-pilot checkpoint as a release checkpoint",
      "do not use external APIs, downloads, backend inference, LoRA, adapters, or fine-tuning as final strategy"
    ],
    fresh_approval_required: true,
    notes: [
      "R25O only designs the second pilot and writes an ignored planning report.",
      "The recommended variant is advisory and not approval to train.",
      "R25P should write a replayable ignored JSON checkpoint if separately approved."
    ],
    failures
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
