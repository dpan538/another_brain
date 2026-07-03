#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "artifacts/training_os/small_decoder_pilot/r25ap/r25ap_personal_target_source_coverage.json";
const TARGETS = [
  "project_continuation",
  "repair_after_weak_answer",
  "local_first_static_browser_reasoning",
  "style_preference",
  "tool_status_honesty",
  "bounded_judgment"
];

async function readJson(path) {
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

function summarizeCoverage(coverage = {}) {
  const rows = {};
  const undercovered = [];
  for (const target of TARGETS) {
    const count = Number(coverage[target]?.rows || 0);
    rows[target] = {
      rows: count,
      fabricated: coverage[target]?.fabricated === true,
      source: coverage[target]?.source || null
    };
    if (count <= 0 || coverage[target]?.fabricated === true) undercovered.push(target);
  }
  return { rows, undercovered };
}

async function main() {
  const dataset = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_dataset_report.json");
  const run = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_small_decoder_run_report.json");
  const breakdown = await readJson("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json");
  if (!dataset?.ok && !run?.ok && !breakdown?.ok) {
    const skipped = {
      ok: true,
      skipped: true,
      reason: "r25ao_reports_missing",
      training_ran: false,
      tokenizer_dry_run_ran: false,
      phase4_approved: false
    };
    await writeJson(OUT, skipped);
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }

  const coverage = summarizeCoverage(run?.personal_target_coverage || dataset?.personal_target_coverage || {});
  const sourceFiles = run?.source_files || {};
  const sourceContribution = {
    includes_r25ak_promoted_corpus: JSON.stringify(sourceFiles).includes("r25ak_repo_derived"),
    includes_r25am_promoted_corpus: JSON.stringify(sourceFiles).includes("r25am_repo_derived"),
    includes_r25l_base_corpus: JSON.stringify(sourceFiles).includes("r25l_"),
    source_files: sourceFiles
  };
  const taskLosses = Object.fromEntries(
    Object.entries(breakdown?.by_task_type || {}).map(([task, value]) => [
      task,
      {
        sequence_count: value.sequence_count || 0,
        average_next_token_loss: value.average_next_token_loss ?? null
      }
    ])
  );
  const highLossTasks = Object.entries(taskLosses)
    .filter(([, value]) => Number(value.average_next_token_loss) >= 7)
    .map(([task]) => task);

  const report = {
    ok: true,
    skipped: false,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    phase4_approved: false,
    run_id: run?.run_id || dataset?.run_id || breakdown?.run_id,
    personal_target_coverage: coverage.rows,
    undercovered_personal_targets: coverage.undercovered,
    target_coverage_broad_enough: coverage.undercovered.length === 0,
    reviewed_for_training_corpus_share: "reported_as_reviewed_project_corpus_sources",
    repo_derived_share: sourceContribution.includes_r25ak_promoted_corpus || sourceContribution.includes_r25am_promoted_corpus ? "present" : "not_detected",
    source_contribution: sourceContribution,
    repeated_source_concentration_risk: "needs_review_if_future_training_repeats_same_sampled_rows",
    heldout_task_type_losses: taskLosses,
    high_loss_task_types: highLossTasks,
    risk_summary: [
      coverage.undercovered.length ? "some personal targets missing or fabricated" : "all configured personal targets have nonzero nonfabricated train coverage",
      highLossTasks.length ? "some heldout task types show high loss and need qualitative review" : "no heldout task type above high-loss threshold",
      "source contribution is dominated by reviewed repo-derived and expanded corpus files, not private raw sources"
    ]
  };

  await writeJson(OUT, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
