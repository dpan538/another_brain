#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25u/r25u_phase_decision_report.json";

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

function chooseNext(tDecision, ablationPlan) {
  if (tDecision?.recommendation === "architecture_ablation_design" && ablationPlan?.recommended_ablation) {
    return "architecture_ablation_design";
  }
  if (tDecision?.recommendation === "another_data_first_pass") return "data_first_repeat";
  return "pause_for_review";
}

async function main() {
  const criteria = await readJsonIfPresent("training/from_scratch/phase3_exit_criteria.json");
  const readiness = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25u/r25u_phase4_readiness_report.json");
  const ablationPlan = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25u/r25u_architecture_ablation_plan.json");
  const tDecision = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_next_step_decision.json");
  const progress = await readJsonIfPresent("artifacts/training_os/from_scratch_training_progress_report.json");
  const recommendedNext = chooseNext(tDecision, ablationPlan);
  const report = {
    ok: Boolean(criteria && readiness?.ok && ablationPlan?.ok),
    phase3_status: readiness?.criteria_passed_without_reviewer_approval ? "continue_phase3" : "pause_for_review",
    phase4_approved: false,
    recommended_next: recommendedNext,
    recommended_ablation: ablationPlan?.recommended_ablation || null,
    reasons: [
      "R25U is a decision framework after R25S/R25T and does not train.",
      readiness?.criteria_passed_without_reviewer_approval
        ? "Phase 3 has enough structural evidence for another reviewed phase_3 design step, but not phase_4 approval."
        : "Some phase 3 exit criteria remain missing or require reviewer interpretation.",
      recommendedNext === "architecture_ablation_design"
        ? "R25T recommended architecture ablation design after data-first balancing improved generalization signals."
        : "The next action should stay in review until a clearer bounded phase_3 question is selected."
    ],
    risks: [
      "Architecture ablation may overfit if the R25L corpus remains small.",
      "Phase_4 scaled training would require a separate capacity, provenance, heldout, and static-admission review.",
      "Replayable checkpoints remain ignored pilot artifacts, not release weights."
    ],
    required_before_next_training: [
      "fresh one-shot reviewer approval for a named R25V run_id",
      "approval marker with approved:true, consumed:false, no phase_4, product, long-term, release, or weight-commit permission",
      "R24/R25 gates green before and after",
      "ignored artifact output path reviewed",
      "heldout replay and split-integrity checks retained"
    ],
    must_not_do: [
      "do not approve phase_4 scaled training",
      "do not run R25V from a template",
      "do not rerun R25S/R25P/R25M/toy pilots",
      "do not commit checkpoints, tokenizer artifacts, generated replay reports, or model-like binaries",
      "do not add external APIs, remote downloads, backend storage, LoRA, adapters, or fine-tuning as final strategy"
    ],
    product_training_progress_percent: 0,
    formal_training_progress_percent: 0,
    pilot_training_progress_percent: progress?.pilot_training_progress_percent ?? 3,
    fresh_approval_required: true,
    phase_4_scaled_training_approved: false,
    training_ran: false
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
