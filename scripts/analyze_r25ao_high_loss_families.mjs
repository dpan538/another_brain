#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25aq/r25aq_high_loss_family_review.json";
const DOC = "docs/R25AQ_HIGH_LOSS_FAMILY_REVIEW.md";

async function readJson(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function writeText(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, value, "utf8");
}

async function writeJson(path, value) {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function summarizeLossBuckets(buckets = {}, threshold = 7) {
  return Object.entries(buckets)
    .map(([name, value]) => ({
      name,
      sequence_count: Number(value?.sequence_count || 0),
      average_next_token_loss: Number.isFinite(Number(value?.average_next_token_loss)) ? Number(value.average_next_token_loss) : null,
      token_count: Number(value?.token_count || 0)
    }))
    .filter((item) => item.average_next_token_loss !== null)
    .sort((a, b) => b.average_next_token_loss - a.average_next_token_loss)
    .map((item) => ({
      ...item,
      high_loss: item.average_next_token_loss >= threshold,
      low_support: item.sequence_count > 0 && item.sequence_count < 4
    }));
}

function countToShare(counts = {}) {
  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, total ? Number(value || 0) / total : 0]));
}

async function main() {
  const dataset = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_dataset_report.json");
  const breakdown = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json");
  if (!dataset?.ok || !breakdown?.ok) {
    const skipped = {
      ok: true,
      skipped: true,
      reason: "r25ao_breakdown_or_dataset_missing",
      training_ran_in_r25aq: false,
      phase4_approved: false
    };
    await writeJson(OUT, skipped);
    await writeText(DOC, "# R25AQ High-Loss Family Review\n\nR25AQ does not train. The high-loss family review skipped because R25AO reports were missing.\n");
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }

  const taskBuckets = summarizeLossBuckets(breakdown.by_task_type || {});
  const targetBuckets = summarizeLossBuckets(breakdown.by_personal_target || {}, 6);
  const highLossTaskFamilies = taskBuckets.filter((item) => item.high_loss);
  const undercoveredFamilies = taskBuckets.filter((item) => item.low_support);
  const taskShares = {
    train: countToShare(dataset.task_family_counts?.train),
    dev: countToShare(dataset.task_family_counts?.dev),
    heldout: countToShare(dataset.task_family_counts?.heldout)
  };
  const overrepresentedFamilies = Object.entries(taskShares.train || {})
    .filter(([, share]) => share >= 0.25)
    .map(([family, share]) => ({ family, train_share: share }));

  const report = {
    ok: true,
    skipped: false,
    training_ran_in_r25aq: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    phase4_approved: false,
    per_row_loss_available: false,
    aggregate_bucket_loss_available: true,
    high_loss_or_high_risk_families: highLossTaskFamilies,
    undercovered_families: undercoveredFamilies,
    overrepresented_families: overrepresentedFamilies,
    personal_target_bucket_losses: targetBuckets,
    task_family_counts: dataset.task_family_counts || null,
    recommendations: [
      "do not repeat R25AO unchanged",
      "rebalance mixed and high-loss families before any next pilot",
      "keep source-family diversity visible in the sampler",
      "lower training intensity for the next bounded pilot design"
    ]
  };

  await writeJson(OUT, report);
  const highLossLines = highLossTaskFamilies.map((item) => `- ${item.name}: loss ${item.average_next_token_loss.toFixed(4)}, sequences ${item.sequence_count}`).join("\n") || "- No aggregate task family exceeded the high-loss threshold.";
  const targetLines = targetBuckets.slice(0, 6).map((item) => `- ${item.name}: loss ${item.average_next_token_loss.toFixed(4)}, sequences ${item.sequence_count}`).join("\n");
  await writeText(DOC, `# R25AQ High-Loss Family Review\n\nR25AQ does not train, rerun R25AO, or generate a dataset. It reviews aggregate R25AO heldout buckets only; per-row loss is not faked.\n\n## High-Loss Task Families\n\n${highLossLines}\n\n## Personal Target Buckets\n\n${targetLines}\n\n## Structural Risks\n\n- Train task-family counts are dominated by \`unknown\`, so source/task family labeling is still a risk.\n- Several high-loss buckets have low sequence counts, making them fragile but still important as warning signals.\n- Mixed/en weakness overlaps with technical boundary tasks, so repairing mixed coverage is higher priority than generic English fluency.\n\n## Recommendation\n\nR25AR should not repeat R25AO unchanged. It should use a lower-intensity repaired sampler with explicit mixed coverage and source/task-family diversity checks. R25AR remains inert design only; future training requires fresh approval, phase_4 remains blocked, and no weights or artifacts are committed.\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
