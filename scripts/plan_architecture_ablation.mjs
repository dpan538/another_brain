#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25u/r25u_architecture_ablation_plan.json";

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

function pickVariant(decision, plan) {
  const variants = plan?.candidate_ablations || [];
  if (decision?.recommendation === "another_data_first_pass") {
    return variants.find((variant) => variant.variant_id === "data_first_repeat_if_needed") || null;
  }
  if (decision?.recommendation !== "architecture_ablation_design") return null;
  return variants.find((variant) => variant.variant_id === "two_layer_same_width") || null;
}

function whySelected(decision, selected) {
  if (!selected) return ["No architecture ablation is recommended without a matching R25T design recommendation."];
  const reasons = [];
  if (decision?.recommendation === "architecture_ablation_design") {
    reasons.push("R25T found the data-first pass helped, so a small architecture ablation can answer the next phase_3 question without scaling.");
  }
  if (selected.variant_id === "two_layer_same_width") {
    reasons.push("two_layer_same_width isolates added depth while keeping width, context, and data assumptions close to R25S.");
  } else {
    reasons.push("data_first_repeat_if_needed is available only if review rejects architecture ablation.");
  }
  return reasons;
}

async function main() {
  const decision = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_next_step_decision.json");
  const plan = await readJsonIfPresent("training/from_scratch/architecture_ablation_plan.r25u.json");
  const selected = pickVariant(decision, plan);
  const ok = Boolean(plan?.training_allowed_by_default === false && plan?.requires_fresh_approval === true && plan?.product_model === false && plan?.release_checkpoint === false && plan?.phase_4_scaled_training === false);

  const report = {
    ok,
    training_will_run: false,
    recommended_ablation: selected?.variant_id || null,
    recommended_run_id: selected?.run_id || null,
    why: whySelected(decision, selected),
    why_not_phase4: [
      "R25U is phase_3 design only.",
      "phase_4 scaled training remains not approved.",
      "No candidate is a product model, release checkpoint, or browser static artifact.",
      "Fresh reviewer approval is required before any future run."
    ],
    fresh_approval_required: true,
    selected_candidate: selected,
    product_model: false,
    release_checkpoint: false,
    phase_4_scaled_training_approved: false,
    notes: [
      "This planner writes an ignored report only.",
      "It does not build a dataset, initialize a model, train, or write weights."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
