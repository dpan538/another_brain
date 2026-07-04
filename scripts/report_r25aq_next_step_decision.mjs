#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25aq/r25aq_next_step_decision.json";
const DOC = "docs/R25AQ_NEXT_STEP_DECISION.md";

async function readJson(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function writeText(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, value, "utf8");
}

async function writeJson(path, value) {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const rootCause = await readJson("artifacts/training_os/small_decoder_pilot/r25aq/r25aq_r25ao_root_cause.json");
  const mixedEn = await readJson("artifacts/training_os/small_decoder_pilot/r25aq/r25aq_mixed_en_weakness.json");
  const highLoss = await readJson("artifacts/training_os/small_decoder_pilot/r25aq/r25aq_high_loss_family_review.json");
  const simulation = await readJson("artifacts/training_os/small_decoder_pilot/r25aq/r25aq_sampler_variant_simulation.json");
  const r25arTemplate = await readJson("training/from_scratch/APPROVE_R25AR_REPAIRED_SAMPLER_MICROCYCLE.template.json");
  const r25arConfig = await readJson("training/from_scratch/small_decoder_pilot_run_config.r25ar.template.json");

  const evidenceOk = Boolean(rootCause?.ok && mixedEn?.ok && highLoss?.ok && simulation?.ok);
  const r25arInert = Boolean(
    r25arTemplate?.approved === false &&
    r25arTemplate?.allow_small_pilot_training === false &&
    r25arTemplate?.allow_decoder_training === false &&
    r25arTemplate?.allow_phase_4_scaled_training === false &&
    r25arTemplate?.allow_product_model_training === false &&
    r25arTemplate?.allow_weight_commit === false &&
    r25arConfig?.training_allowed_by_default === false &&
    r25arConfig?.requires_fresh_approval === true &&
    r25arConfig?.product_model === false &&
    r25arConfig?.release_checkpoint === false &&
    r25arConfig?.phase_4_scaled_training === false &&
    r25arConfig?.commit_weights_allowed === false
  );
  const recommendation = evidenceOk && r25arInert ? "approve_r25ar_later_with_fresh_approval" : "pause_for_review";
  const report = {
    ok: evidenceOk && r25arInert,
    recommendation,
    phase4_approved: false,
    training_approved_now: false,
    r25ar_approved_now: false,
    product_training_progress_percent: 0,
    formal_decoder_training_progress_percent: 0,
    why_not_repeat_r25ao: [
      "R25AO met the zh-first sampler target but heldout regressed against the best prior reference.",
      "Mixed and en buckets were weaker than zh.",
      "Several task families showed high heldout loss.",
      "The consumed R25AO approval cannot be reused."
    ],
    why_sampler_repair: [
      "Mixed is more important than generic English because repo work is Chinese-first with technical mixed terms.",
      "A zh65/mixed25/en10 target directly addresses mixed weakness while keeping English capped.",
      "Lower steps and learning rate reduce repeat-risk from fitting train/dev without heldout improvement."
    ],
    why_not_phase4: [
      "R25AO did not prove better heldout generalization.",
      "R25AR is still only a bounded phase_3 pilot design.",
      "No product/formal decoder model or release checkpoint exists."
    ],
    required_before_next_training: [
      "fresh explicit reviewer approval",
      "one bounded R25AR run only if approved",
      "no tokenizer dry-run unless separately approved",
      "keep training/llm_corpus unchanged unless a separate corpus task approves changes",
      "consume any future approval after one attempt"
    ],
    must_not_do: [
      "do not rerun R25AO",
      "do not start phase_4",
      "do not run product or formal decoder training",
      "do not commit artifacts or weights",
      "do not use external APIs or downloads"
    ],
    recommended_variant: simulation?.recommended_variant || null,
    r25ar_design_status: r25arInert ? "inert_design_ready" : "needs_review"
  };

  await writeJson(OUT, report);
  await writeText(DOC, `# R25AQ Next-Step Decision\n\nR25AQ does not train, rerun R25AO, run tokenizer dry-run, expand corpus, or approve phase_4.\n\n## Decision\n\nRecommendation: \`${report.recommendation}\`.\n\nRecommended future design, if later approved: \`${report.recommended_variant || "not_available"}\`.\n\n## Why Not Repeat R25AO\n\n${report.why_not_repeat_r25ao.map((item) => `- ${item}`).join("\n")}\n\n## Why Sampler Repair\n\n${report.why_sampler_repair.map((item) => `- ${item}`).join("\n")}\n\n## Boundary\n\nR25AR is not approved now. Any future run requires fresh explicit reviewer approval and must remain one bounded phase_3 pilot. Product training progress remains 0%, formal decoder training progress remains 0%, phase_4 remains blocked, and no weights or artifacts are committed.\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
