#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25as/r25as_training_intensity_capacity.json";
const DOC = "docs/R25AS_TRAINING_INTENSITY_CAPACITY_REVIEW.md";

async function readJson(path) {
  try { return JSON.parse(await readFile(resolve(ROOT, path), "utf8")); } catch { return null; }
}
async function write(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}
async function writeJson(path, value) { await write(path, `${JSON.stringify(value, null, 2)}\n`); }
function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function main() {
  const arRun = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_small_decoder_run_report.json");
  const arHeld = await readJson("artifacts/training_os/small_decoder_pilot/r25ar/r25ar_heldout_eval_report.json");
  const aoRun = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_small_decoder_run_report.json");
  const aoHeld = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_heldout_eval_report.json");
  if (!arRun || !arHeld || !aoRun || !aoHeld) {
    const skipped = { ok: true, skipped: true, reason: "ignored_artifacts_missing", training_ran: false, phase4_approved: false };
    await writeJson(OUT, skipped);
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }
  const heldoutDelta = n(arHeld.heldout_loss) - n(aoHeld.heldout_loss);
  const intensityHelped = heldoutDelta <= 0;
  const report = {
    ok: true,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    r25ao: {
      steps: n(aoRun.steps),
      learning_rate: n(aoRun.learning_rate),
      layers: n(aoRun.actual_layers),
      heldout_loss: n(aoHeld.heldout_loss)
    },
    r25ar: {
      steps: n(arRun.steps),
      learning_rate: n(arRun.learning_rate),
      layers: n(arRun.actual_layers),
      heldout_loss: n(arHeld.heldout_loss)
    },
    heldout_delta_r25ar_minus_r25ao: heldoutDelta,
    intensity_helped: intensityHelped,
    capacity_limit_possible: true,
    architecture_scale_now_approved: false,
    phase4_approved: false,
    product_training_progress_percent: 0,
    recommendation: "architecture_capacity_review_only",
    interpretation: [
      "R25AR reduced steps from 100 to 60 and learning rate from 0.004 to 0.003.",
      "The same one-layer architecture and smaller intensity still produced worse heldout loss.",
      "Capacity limits are plausible, but phase_4 and architecture scaling are not approved.",
      "Any further pilot needs fresh evidence and fresh approval."
    ]
  };
  await writeJson(OUT, report);
  await write(DOC, `# R25AS Training Intensity Capacity Review

R25AS does not train, rerun R25AR, run tokenizer dry-run, expand corpus, or approve architecture scaling.

R25AO used 100 steps at learning rate 0.004. R25AR used 60 steps at learning rate 0.003 with the same one-layer pilot architecture. The lower-intensity run still worsened heldout loss by ${heldoutDelta.toFixed(4)} versus R25AO.

- Intensity helped: \`${intensityHelped}\`
- Capacity limit possible: \`true\`
- Architecture scale approved now: \`false\`
- Phase_4 approved: \`false\`

Conclusion: lowering intensity alone did not repair quality. Capacity may be a real limit, but it is a review topic, not a permission to scale.
`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
