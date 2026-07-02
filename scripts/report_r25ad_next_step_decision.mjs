#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25ad/r25ad_next_step_decision.json";

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const analysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ad/r25ad_r25ac_analysis.json");
  const coverage = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ad/r25ad_personal_target_coverage.json");
  const gap = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ad/r25ad_chinese_personal_corpus_gap.json");
  const r25aeCheck = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ad/r25ad_r25ae_corpus_expansion_design_check.json");
  const r25aeTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25AE_CHINESE_PERSONAL_CORPUS_EXPANSION.template.json");
  const failures = [];

  if (analysis?.ok !== true) failures.push({ code: "r25ac_analysis_not_ok" });
  if (coverage?.ok !== true) failures.push({ code: "personal_target_coverage_not_ok" });
  if (gap?.ok !== true) failures.push({ code: "chinese_personal_corpus_gap_not_ok" });
  if (r25aeCheck?.ok !== true) failures.push({ code: "r25ae_design_check_not_ok" });
  if (r25aeTemplate?.approved !== false) failures.push({ code: "r25ae_template_must_be_inert" });

  const report = {
    ok: failures.length === 0,
    report_id: "r25ad_next_step_decision",
    training_ran: false,
    r25ac_rerun: false,
    corpus_generated: false,
    active_training_approval_count: 0,
    active_phase4_training_approval_count: 0,
    r25ac_analysis_classification: analysis?.classification || "not_run",
    r25ac_language_mix_success: analysis?.language_mix_success === true,
    r25ac_quality_regressed_vs_r25s: analysis?.quality_regressed_vs_r25s === true,
    r25s_remains_best_by_loss: analysis?.pilot_comparison?.r25s_remains_best_by_loss === true,
    current_r25l_distribution: gap?.current_r25l_distribution || null,
    target_distribution: gap?.target_distribution || {
      zh_min: 0.7,
      mixed_target: 0.2,
      en_max: 0.1
    },
    chinese_personal_corpus_gap_status: gap?.current_r25l_insufficient_for_chinese_personal_target ? "gap_confirmed" : "needs_review",
    personal_target_coverage_status: coverage?.ok ? coverage.status : "not_run",
    r25ae_design_status: r25aeCheck?.ok ? "future_design_only_not_approved" : "needs_review",
    recommendation: "r25ae_chinese_personal_corpus_expansion_review_before_any_new_microcycle",
    recommended_next_allowed_scope: "corpus_expansion_review_only",
    r25ae_approved: false,
    next_training_allowed: false,
    phase_4_scaled_training_approved: false,
    product_model_training_allowed: false,
    release_checkpoint_allowed: false,
    notes: [
      "R25AC showed the language-mix mechanism works, but held-out loss remains worse than R25S.",
      "The next useful step is reviewed Chinese-personal corpus expansion, not repeated training from the same approval.",
      "After a future corpus review, a separate fresh approval may authorize one bounded micro-cycle; phase_4 remains blocked."
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
