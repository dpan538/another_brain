#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/phase4_readiness/r25aa_phase3_pause_decision.json";

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
  const ledger = await readJsonIfPresent("training/from_scratch/phase3_final_review_ledger.r25aa.json");
  const readiness = await readJsonIfPresent("training/from_scratch/phase4_readiness_review.r25aa.json");
  const envelope = await readJsonIfPresent("artifacts/training_os/phase4_readiness/r25aa_static_envelope_report.json");
  const progress = await readJsonIfPresent("artifacts/training_os/from_scratch_training_progress_report.json");

  const bestPilot = ledger?.best_pilot || "unknown";
  const phase4Approved = readiness?.phase4_scaled_training_approved === true || envelope?.phase4_approved === true;
  const failures = [];
  if (!ledger) failures.push("phase3_final_review_ledger_missing");
  if (!readiness) failures.push("phase4_readiness_review_missing");
  if (!envelope?.ok) failures.push("phase4_static_envelope_eval_missing_or_failed");
  if (phase4Approved) failures.push("phase4_must_not_be_approved");
  if (progress && Number(progress.product_training_progress_percent || 0) !== 0) failures.push("product_training_progress_must_remain_zero");

  const report = {
    ok: failures.length === 0,
    phase3_decision: "pause_for_review",
    phase4_approved: false,
    best_pilot: bestPilot,
    why_pause: [
      "R25S remains best-so-far after R25Y did not improve the held-out result.",
      "R25V architecture ablation worsened dev/held-out relative to R25S.",
      "R25Z recommended a phase_3 pause before more pilot churn."
    ],
    why_not_more_phase3_pilots: [
      "Recent data regularization did not beat the best data-first baseline.",
      "Architecture ablation did not improve generalization.",
      "Additional phase_3 runs need a clearer reviewed hypothesis and fresh approval."
    ],
    why_not_phase4_training_yet: readiness?.blocking_items || [
      "fresh reviewer approval required",
      "phase_4 run design not reviewed",
      "release path not validated"
    ],
    required_before_any_next_training: [
      "fresh explicit reviewer approval",
      "selected next-step design review",
      "capacity and release-path review for phase_4",
      "R24/R25 gates before and after any approved run"
    ],
    must_not_do: [
      "do not run phase_4 scaled training",
      "do not run another phase_3 pilot from R25AA",
      "do not commit checkpoints or ignored artifacts",
      "do not claim a product model or release checkpoint exists"
    ],
    failures,
    notes: [
      "R25AA is a review packet only.",
      "Phase_4 readiness can move to design review only, not training."
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
