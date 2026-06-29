#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const APPROVAL_PATH = "training/from_scratch/APPROVE_R25K_TOY_OVERFIT.json";
const DATASET_PATH = "artifacts/training_os/tiny_decoder_toy/r25k_toy_train.json";
const ARTIFACT_DIR = "artifacts/training_os/tiny_decoder_toy/";
const CHECKPOINT_PATH = `${ARTIFACT_DIR}r25k_toy_checkpoint.json`;
const METRICS_PATH = `${ARTIFACT_DIR}r25k_toy_metrics.json`;
const RUN_REPORT_PATH = `${ARTIFACT_DIR}r25k_toy_run_report.json`;

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function gitLines(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function isIgnored(path) {
  try {
    await execFileAsync("git", ["check-ignore", path], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

function seededRandom(seed = 2525) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function collectPairs(samples) {
  const pairs = [];
  for (const sample of samples) {
    const ids = Array.isArray(sample.token_ids) ? sample.token_ids.map(Number).filter(Number.isInteger) : [];
    for (let i = 0; i < ids.length - 1; i += 1) pairs.push([ids[i], ids[i + 1]]);
  }
  return pairs;
}

function initializeRows(contextIds, targetIds) {
  const random = seededRandom(2525);
  const rows = new Map();
  for (const contextId of contextIds) {
    const row = new Map();
    for (const targetId of targetIds) row.set(targetId, (random() - 0.5) * 0.02);
    rows.set(contextId, row);
  }
  return rows;
}

function rowProbabilities(row, targetIds) {
  let maxLogit = -Infinity;
  for (const targetId of targetIds) maxLogit = Math.max(maxLogit, row.get(targetId) ?? 0);
  const exps = new Map();
  let denom = 0;
  for (const targetId of targetIds) {
    const value = Math.exp((row.get(targetId) ?? 0) - maxLogit);
    exps.set(targetId, value);
    denom += value;
  }
  const probs = new Map();
  for (const targetId of targetIds) probs.set(targetId, (exps.get(targetId) || 0) / Math.max(denom, 1e-12));
  return probs;
}

function evaluate(rows, pairs, targetIds) {
  let loss = 0;
  let correct = 0;
  for (const [contextId, targetId] of pairs) {
    const row = rows.get(contextId);
    const probs = rowProbabilities(row, targetIds);
    const probability = Math.max(probs.get(targetId) || 1e-12, 1e-12);
    loss += -Math.log(probability);
    let bestTarget = targetIds[0];
    let bestProbability = -1;
    for (const id of targetIds) {
      const value = probs.get(id) || 0;
      if (value > bestProbability) {
        bestProbability = value;
        bestTarget = id;
      }
    }
    if (bestTarget === targetId) correct += 1;
  }
  return {
    loss: pairs.length ? loss / pairs.length : 0,
    accuracy: pairs.length ? correct / pairs.length : 0
  };
}

function trainBigramToy(rows, pairs, targetIds, steps, learningRate) {
  const history = [];
  const initial = evaluate(rows, pairs, targetIds);
  history.push({ step: 0, loss: initial.loss, accuracy: initial.accuracy });
  for (let step = 1; step <= steps; step += 1) {
    for (const [contextId, targetId] of pairs) {
      const row = rows.get(contextId);
      const probs = rowProbabilities(row, targetIds);
      for (const id of targetIds) {
        const gradient = (probs.get(id) || 0) - (id === targetId ? 1 : 0);
        row.set(id, (row.get(id) || 0) - learningRate * gradient);
      }
    }
    if (step === steps || step % 10 === 0) {
      const score = evaluate(rows, pairs, targetIds);
      history.push({ step, loss: score.loss, accuracy: score.accuracy });
    }
  }
  const final = evaluate(rows, pairs, targetIds);
  return { initial, final, history };
}

function serializeRows(rows, targetIds) {
  const out = {};
  for (const [contextId, row] of [...rows.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    out[contextId] = targetIds.map((targetId) => Number((row.get(targetId) || 0).toFixed(6)));
  }
  return out;
}

async function main() {
  const config = await readJson("training/from_scratch/toy_decoder_config.json");
  const allow = process.argv.includes("--allow-toy-training");
  await mkdir(resolve(ROOT, config.output_dir), { recursive: true });

  if (!allow) {
    const report = {
      ok: true,
      skipped: true,
      reason: "explicit_allow_toy_training_flag_required",
      formal_decoder_training: false,
      product_model: false,
      weights_written: false,
      weights_committed: false,
      output_dir: config.output_dir
    };
    await writeJson(`${config.output_dir}r25j_toy_overfit_skip_report.json`, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const failures = [];
  const approval = await readJson(APPROVAL_PATH).catch(() => null);
  if (!approval?.approved) failures.push({ code: "r25k_approval_missing_or_not_approved", path: APPROVAL_PATH });
  if (approval?.scope !== "toy_overfit_sanity_only") failures.push({ code: "r25k_approval_scope_invalid", scope: approval?.scope });
  if (approval?.phase !== "phase_2_tiny_overfit_sanity") failures.push({ code: "r25k_approval_phase_invalid", phase: approval?.phase });
  if (approval?.allow_formal_training !== false) failures.push({ code: "r25k_approval_must_not_allow_formal_training" });
  if (approval?.allow_long_term_training !== false) failures.push({ code: "r25k_approval_must_not_allow_long_term_training" });
  if (approval?.allow_product_model_training !== false) failures.push({ code: "r25k_approval_must_not_allow_product_model_training" });
  if (approval?.allow_weight_commit !== false) failures.push({ code: "r25k_approval_must_not_allow_weight_commit" });
  if (approval?.allow_artifacts_write !== true) failures.push({ code: "r25k_approval_must_allow_ignored_artifact_write" });
  if (approval?.artifact_output_root !== ARTIFACT_DIR) failures.push({ code: "r25k_artifact_root_mismatch", artifact_output_root: approval?.artifact_output_root });
  if (config.commit_weights_allowed !== false) failures.push({ code: "toy_config_must_not_allow_weight_commit" });
  if (config.product_model !== false) failures.push({ code: "toy_config_must_not_be_product" });
  if (config.formal_decoder_training !== false) failures.push({ code: "toy_config_must_not_mark_formal_training" });
  if (config.output_dir !== ARTIFACT_DIR) failures.push({ code: "toy_config_output_dir_mismatch", output_dir: config.output_dir });
  if (!(await isIgnored(CHECKPOINT_PATH))) failures.push({ code: "toy_checkpoint_path_not_ignored", path: CHECKPOINT_PATH });

  if (failures.length) {
    const report = {
      ok: false,
      skipped: false,
      toy_training_ran: false,
      formal_training: false,
      product_model: false,
      failures
    };
    await writeJson(RUN_REPORT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const dataset = await readJson(DATASET_PATH);
  if (!dataset.ok) throw new Error("R25K toy dataset report is not ok");
  const pairs = collectPairs(dataset.samples || []);
  const contextIds = [...new Set(pairs.map(([contextId]) => contextId))].sort((a, b) => a - b);
  const targetIds = [...new Set(pairs.map(([, targetId]) => targetId))].sort((a, b) => a - b);
  if (!pairs.length || !contextIds.length || !targetIds.length) throw new Error("R25K toy dataset has no next-token pairs");

  const steps = 60;
  const learningRate = 0.16;
  const rows = initializeRows(contextIds, targetIds);
  const { initial, final, history } = trainBigramToy(rows, pairs, targetIds, steps, learningRate);
  const artifactPaths = [CHECKPOINT_PATH, METRICS_PATH, RUN_REPORT_PATH];
  const trackedToyArtifacts = (await gitLines(["ls-files", "--cached", ARTIFACT_DIR])).filter(Boolean);
  const checkpoint = {
    checkpoint_id: "r25k_trainable_bigram_next_token_toy_v0",
    toy_only: true,
    model_type: "trainable_bigram_next_token_toy",
    formal_training: false,
    product_model: false,
    tokenizer_id: dataset.tokenizer_id,
    sample_count: dataset.samples.length,
    sequence_count: dataset.samples.length,
    pair_count: pairs.length,
    context_count: contextIds.length,
    target_count: targetIds.length,
    target_ids: targetIds,
    logits_by_context_id: serializeRows(rows, targetIds),
    notes: [
      "This checkpoint is a tiny toy sanity artifact only.",
      "It proves local pipeline mechanics, not intelligence or transformer/product equivalence.",
      "It must remain ignored and untracked."
    ]
  };
  const metrics = {
    ok: final.loss < initial.loss,
    toy_training_ran: true,
    formal_training: false,
    product_model: false,
    model_type: "trainable_bigram_next_token_toy",
    steps,
    learning_rate: learningRate,
    initial_loss: initial.loss,
    final_loss: final.loss,
    loss_decreased: final.loss < initial.loss,
    initial_accuracy_proxy: initial.accuracy,
    train_accuracy_proxy: final.accuracy,
    history
  };
  const runReport = {
    ok: metrics.ok && trackedToyArtifacts.length === 0,
    toy_training_ran: true,
    formal_training: false,
    product_model: false,
    steps,
    initial_loss: initial.loss,
    final_loss: final.loss,
    loss_decreased: metrics.loss_decreased,
    train_accuracy_proxy: final.accuracy,
    artifact_paths: artifactPaths,
    weights_tracked: trackedToyArtifacts.length > 0,
    formal_training_progress_percent: 0,
    notes: [
      "R25K ran a bounded toy-only overfit sanity loop after explicit approval.",
      "The toy model is a from-scratch trainable bigram next-token table, not a transformer or product model.",
      "Loss decrease only indicates local pipeline mechanics.",
      "No formal decoder training, long-term training, product training, or weight commit is allowed."
    ],
    failures: trackedToyArtifacts.map((path) => ({ code: "toy_artifact_tracked", path }))
  };

  await writeJson(CHECKPOINT_PATH, checkpoint);
  await writeJson(METRICS_PATH, metrics);
  await writeJson(RUN_REPORT_PATH, runReport);
  console.log(JSON.stringify(runReport, null, 2));
  if (!runReport.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
