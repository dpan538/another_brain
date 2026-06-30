#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25o/r25o_history_comparison.json";

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfPresent(path) {
  return (await exists(path)) ? JSON.parse(await readFile(resolve(ROOT, path), "utf8")) : null;
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function lossDelta(initial, final) {
  const start = Number(initial);
  const end = Number(final);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    absolute_decrease: start - end,
    relative_decrease: start === 0 ? null : (start - end) / Math.abs(start)
  };
}

async function main() {
  const toy = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25k_toy_run_report.json");
  const r25m = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_run_report.json");
  const r25nAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25n/r25n_small_pilot_analysis.json");
  const r25nHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25n/r25n_heldout_eval_report.json");
  const r25p = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_run_report.json");
  const runs = [];

  if (toy?.ok) {
    runs.push({
      id: "R25K",
      kind: "toy_bigram_sanity",
      train_loss_change: lossDelta(toy.initial_loss, toy.final_loss),
      dev_loss_change: null,
      heldout_structural_metric: null,
      parameter_count: null,
      sequence_count: toy.sequence_count || null,
      steps: toy.steps,
      backend: "node_builtin",
      artifact_type: "ignored_toy_checkpoint_json"
    });
  }

  if (r25m?.ok) {
    runs.push({
      id: "R25M",
      kind: "small_decoder_pilot",
      train_loss_change: lossDelta(r25m.initial_train_loss, r25m.final_train_loss),
      dev_loss_change: lossDelta(r25m.initial_dev_loss, r25m.final_dev_loss),
      heldout_structural_metric: r25nHeldout?.heldout_metric ?? null,
      heldout_metric_name: r25nHeldout?.metric_name || null,
      parameter_count: r25m.parameter_count,
      sequence_count: r25m.train_sequences,
      dev_sequence_count: r25m.dev_sequences,
      steps: r25m.steps,
      backend: r25m.backend,
      artifact_type: "ignored_non_replayable_digest_checkpoint_json",
      analysis_classification: r25nAnalysis?.classification || null
    });
  }

  if (r25p?.ok) {
    runs.push({
      id: "R25P",
      kind: "future_second_small_decoder_pilot",
      train_loss_change: lossDelta(r25p.initial_train_loss, r25p.final_train_loss),
      dev_loss_change: lossDelta(r25p.initial_dev_loss, r25p.final_dev_loss),
      heldout_structural_metric: r25p.heldout_metric ?? null,
      parameter_count: r25p.parameter_count,
      sequence_count: r25p.train_sequences,
      dev_sequence_count: r25p.dev_sequences,
      steps: r25p.steps,
      backend: r25p.backend,
      artifact_type: "ignored_replayable_checkpoint_json_expected"
    });
  }

  const report = {
    ok: true,
    status: runs.length > 1 ? "history_compared" : runs.length === 1 ? "single_run_baseline" : "no_local_ignored_artifacts",
    training_ran: false,
    product_model: false,
    release_checkpoint: false,
    runs,
    notes: [
      "R25O comparison does not train.",
      "R25M is the current small-pilot baseline.",
      "Future R25P results should be added only from ignored artifacts after fresh approval."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
