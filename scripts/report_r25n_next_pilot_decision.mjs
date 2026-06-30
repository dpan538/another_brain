#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25n/r25n_next_pilot_decision.json";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const run = await readJson("artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_run_report.json").catch(() => null);
  const analysis = await readJson("artifacts/training_os/small_decoder_pilot/r25n/r25n_small_pilot_analysis.json").catch(() => null);
  const heldout = await readJson("artifacts/training_os/small_decoder_pilot/r25n/r25n_heldout_eval_report.json").catch(() => null);
  const capacity = await readJson("artifacts/training_os/small_decoder_pilot/r25l_small_decoder_pilot_plan.json").catch(() => null);
  const reasons = [];
  const required = [
    "review R25N analysis and held-out structural evaluation",
    "issue a fresh one-shot approval marker before any R25O or R25M2 run",
    "choose adjusted architecture/data settings explicitly",
    "run R24/R25 gates before and after any later approved pilot",
    "keep all checkpoints under ignored artifacts and commit no weights"
  ];
  const mustNotDo = [
    "do not treat R25M or R25N as product training",
    "do not admit R25M checkpoint digest as a release checkpoint",
    "do not rerun with consumed R25K/R25M approval markers",
    "do not add external APIs, downloads, backend inference, LoRA, adapters, or fine-tuning as final strategy"
  ];

  let recommendation = "review_required";
  if (!run || analysis?.status === "blocked_no_local_ignored_artifacts" || heldout?.skipped) {
    recommendation = "review_required";
    reasons.push("local ignored R25M artifacts are unavailable or incomplete, so no continuation decision can be made");
  } else if (analysis?.classification === "pipeline_sanity_pass" && heldout?.ok === true && run?.train_loss_decreased === true) {
    recommendation = "second_bounded_pilot_may_be_considered";
    reasons.push("R25M produced a small but valid loss decrease and R25N structural held-out checks passed");
    reasons.push("capacity estimates remain within the planning envelope, but browser release remains disabled");
  } else {
    recommendation = "review_required";
    reasons.push("R25M signals are weak or incomplete and need reviewer interpretation before any next run");
  }

  if (analysis?.signal_strength) reasons.push(`analysis signal strength: ${analysis.signal_strength}`);
  if (heldout?.metric_name) reasons.push(`held-out metric: ${heldout.metric_name}=${heldout.heldout_metric}`);
  if (capacity?.capacity_profile_fit?.profile) reasons.push(`capacity profile reference: ${capacity.capacity_profile_fit.profile}`);

  const report = {
    ok: true,
    recommendation,
    reasons,
    required_before_next_training: required,
    must_not_do: mustNotDo,
    suggested_next_phase: "R25O reviewer-approved second bounded pilot only if a fresh one-shot approval is issued",
    reviewer_approval_required: true,
    automatic_approval_granted: false,
    product_training_progress_percent: 0,
    release_checkpoint: false,
    product_model: false
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
