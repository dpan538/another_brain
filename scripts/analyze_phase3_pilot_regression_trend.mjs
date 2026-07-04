#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25as/r25as_phase3_regression_trend.json";
const DOC = "docs/R25AS_PHASE3_PILOT_REGRESSION_TREND.md";
const RUNS = ["r25m", "r25p", "r25s", "r25v", "r25y", "r25ac", "r25ao", "r25ar"];

async function readJson(path) {
  try { return JSON.parse(await readFile(resolve(ROOT, path), "utf8")); } catch { return null; }
}
async function write(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}
async function writeJson(path, value) { await write(path, `${JSON.stringify(value, null, 2)}\n`); }
function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function delta(start, end) {
  const a = num(start); const b = num(end);
  return a === null || b === null ? null : a - b;
}
function classify(id, run, held, bestLoss) {
  if (!run?.ok) return "missing_or_invalid";
  if (!held?.ok && id !== "r25m") return "heldout_missing";
  const loss = num(held?.heldout_loss);
  if (id === "r25s") return "best_data_first_reference";
  if (loss !== null && bestLoss !== null && loss > bestLoss) return "heldout_regressed_vs_best";
  return "informative_but_not_product";
}

async function main() {
  const rows = [];
  for (const id of RUNS) {
    const run = await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_small_decoder_run_report.json`);
    const held = await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_heldout_eval_report.json`);
    const data = await readJson(`artifacts/training_os/small_decoder_pilot/${id}/${id}_dataset_report.json`);
    rows.push({
      id: id.toUpperCase(),
      run_id: run?.run_id || data?.run_id || null,
      variant_id: run?.variant_id || data?.variant_id || null,
      trained: run?.small_pilot_training_ran === true,
      steps: num(run?.steps),
      learning_rate: num(run?.learning_rate),
      train_loss_decrease: delta(run?.initial_train_loss, run?.final_train_loss),
      dev_loss_decrease: delta(run?.initial_dev_loss, run?.final_dev_loss),
      final_train_loss: num(run?.final_train_loss),
      final_dev_loss: num(run?.final_dev_loss),
      heldout_loss: num(held?.heldout_loss),
      language_mix: run?.actual_language_mix || data?.actual_train_language_mix || null,
      replayable: run?.replayable_checkpoint_written === true || held?.replayable_checkpoint_used === true,
      phase4_approved: false,
      product_model: false
    });
  }
  const heldoutRows = rows.filter((row) => Number.isFinite(row.heldout_loss));
  const best = heldoutRows.sort((a, b) => a.heldout_loss - b.heldout_loss)[0] || null;
  const r25s = rows.find((row) => row.id === "R25S");
  const r25ao = rows.find((row) => row.id === "R25AO");
  const r25ar = rows.find((row) => row.id === "R25AR");
  const classified = rows.map((row) => ({
    ...row,
    heldout_minus_r25s: Number.isFinite(row.heldout_loss) && Number.isFinite(r25s?.heldout_loss) ? row.heldout_loss - r25s.heldout_loss : null,
    classification: classify(row.id.toLowerCase(), { ok: row.trained }, { ok: Number.isFinite(row.heldout_loss), heldout_loss: row.heldout_loss }, best?.heldout_loss)
  }));
  const laterRegression = Number.isFinite(r25ar?.heldout_loss) && Number.isFinite(r25ao?.heldout_loss) && r25ar.heldout_loss > r25ao.heldout_loss;
  const report = {
    ok: true,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    phase4_approved: false,
    runs: classified,
    best_heldout: best,
    best_by_project_direction: "R25AR/R25AO align with Chinese-personal direction but do not beat R25S; direction needs review before more pilots",
    worst_recent_regressions: classified.filter((row) => ["R25AO", "R25AR"].includes(row.id) && Number(row.heldout_minus_r25s) > 0.5),
    recent_corpus_sampler_changes_improved_loss: false,
    later_pilots_drifted_from_r25s: laterRegression || Number(r25ao?.heldout_loss) > Number(r25s?.heldout_loss),
    small_pilot_objective_still_informative: true,
    recommendation: "pause_phase3_training"
  };
  await writeJson(OUT, report);
  const table = classified.map((row) => `| ${row.id} | ${row.variant_id || "n/a"} | ${row.steps ?? "n/a"} | ${row.final_dev_loss?.toFixed?.(4) || "n/a"} | ${row.heldout_loss?.toFixed?.(4) || "n/a"} | ${row.classification} |`).join("\n");
  await write(DOC, `# R25AS Phase 3 Pilot Regression Trend

R25AS reads completed reports only. It does not train, rerun pilots, run tokenizer dry-run, expand corpus, or approve phase_4.

| Pilot | Variant | Steps | Final dev | Heldout | Classification |
| --- | --- | ---: | ---: | ---: | --- |
${table}

Best heldout reference: \`${best?.id || "unknown"}\`. R25S remains the loss reference. R25AO and R25AR are more aligned with the Chinese-personal direction, but both regressed on heldout quality, with R25AR worse than R25AO. The small-pilot objective remains useful as a warning signal, not as a product-readiness proof.
`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
