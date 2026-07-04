#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25as/r25as_next_step_decision.json";
const DOC = "docs/R25AS_NEXT_STEP_BOUNDARY.md";

async function readJson(path) {
  try { return JSON.parse(await readFile(resolve(ROOT, path), "utf8")); } catch { return null; }
}
async function write(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}
async function writeJson(path, value) { await write(path, `${JSON.stringify(value, null, 2)}\n`); }

async function main() {
  const analysis = await readJson("artifacts/training_os/small_decoder_pilot/r25as/r25as_r25ar_analysis.json");
  const comparison = await readJson("artifacts/training_os/small_decoder_pilot/r25as/r25as_r25ar_vs_r25ao.json");
  const trend = await readJson("artifacts/training_os/small_decoder_pilot/r25as/r25as_phase3_regression_trend.json");
  const highRisk = await readJson("artifacts/training_os/small_decoder_pilot/r25as/r25as_high_risk_family_regression.json");
  const intensity = await readJson("artifacts/training_os/small_decoder_pilot/r25as/r25as_training_intensity_capacity.json");
  const progress = await readJson("artifacts/training_os/from_scratch_training_progress.json");
  const heldoutRegressed = Number(comparison?.heldout_delta_r25ar_minus_r25ao || 0) > 0;
  const report = {
    ok: Boolean(analysis?.ok && comparison?.ok && trend?.ok && highRisk?.ok && intensity?.ok),
    recommendation: heldoutRegressed ? "pause_phase3_training" : "corpus_quality_review_only",
    training_approved_now: false,
    phase4_approved: false,
    product_training_progress_percent: 0,
    best_pilot_by_heldout: trend?.best_heldout?.id || analysis?.comparisons?.best_by_heldout?.id || "R25S",
    best_pilot_by_project_direction: "R25AR/R25AO fit the Chinese-personal direction but regressed; R25S remains heldout reference",
    why_r25ar_did_or_did_not_help: [
      "It hit the repaired zh/mixed/en sampler intent.",
      "It reduced train/dev loss.",
      "It worsened heldout loss versus R25AO.",
      "Mixed/en gaps did not improve relative to zh."
    ],
    why_not_repeat_r25ar: [
      "The one-shot approval is consumed.",
      "Lower intensity and mixed repair did not improve heldout.",
      "Repeating without a new evidence-backed change would only add noise."
    ],
    why_not_phase4: [
      "Best heldout remains a prior small pilot reference.",
      "Recent Chinese-personal pilots regressed on heldout.",
      "Architecture scaling is not approved and product/formal progress remains 0%."
    ],
    required_before_next_training: [
      "Fresh explicit approval.",
      "Review-only corpus/eval distribution diagnosis.",
      "A bounded change that directly targets mixed/en weakness or objective mismatch.",
      "Confirmation that routine gates do not rerun training or tokenizer commands."
    ],
    must_not_do: [
      "Do not rerun R25AR from the consumed approval.",
      "Do not run tokenizer dry-run or corpus expansion from R25AS.",
      "Do not approve phase_4 or product training.",
      "Do not commit artifacts or weights."
    ],
    source_reports: {
      analysis: Boolean(analysis?.ok),
      comparison: Boolean(comparison?.ok),
      trend: Boolean(trend?.ok),
      high_risk: Boolean(highRisk?.ok),
      intensity: Boolean(intensity?.ok),
      progress_readiness: progress?.training_readiness_percent_estimate ?? null
    }
  };
  await writeJson(OUT, report);
  await write(DOC, `# R25AS Next Step Boundary

R25AS is analysis-only. It does not train, rerun R25AR, run tokenizer dry-run, expand corpus, modify \`training/llm_corpus\`, approve phase_4, or commit artifacts/weights.

Recommendation: \`${report.recommendation}\`.

R25AR should not be repeated immediately. It met the repaired-sampler mix and lowered train/dev loss, but heldout regressed further and mixed/en buckets were not repaired. Future work should pause phase 3 training and review corpus/eval distribution or objective mismatch before any fresh pilot approval.

R25AT is only an inert future reviewed-step template. It does not authorize training, tokenizer dry-run, corpus generation, promotion, architecture ablation, phase_4, product training, release checkpoint admission, or weight commit.

Still required:

- Product training progress remains \`0%\`.
- Formal decoder training progress remains \`0%\`.
- Phase_4 scaled training remains blocked.
- No chain-of-thought, external APIs, downloads, backend/storage path, artifacts, or weights are introduced.
- R24/R25 gates remain required.
`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
