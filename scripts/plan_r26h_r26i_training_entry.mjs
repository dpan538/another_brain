#!/usr/bin/env node
import { ACTIVE_CORPUS_FILES, readJsonlRows, splitFromPath, writeJson, writeText } from "./r26a_project_utils.mjs";
import { countBy } from "./r26g_user_answer_utils.mjs";

const REPORT_PATH = "artifacts/training_os/user_answer_readiness/r26h/r26i_training_entry_plan.json";
const SUMMARY_PATH = "docs/R26H_R26I_TRAINING_ENTRY_PLAN.md";
const TARGETS = { train: 192, dev: 48, heldout: 48 };

function isUserAnswered(row) {
  return row?.provenance?.source_type === "user_answered" || /^r26[eg]_/.test(String(row?.sample_id || ""));
}

function isAllowedNonUser(row, file) {
  if (isUserAnswered(row)) return false;
  if (row.pack_id === "another_brain_question_pack_001" && Number(row.source_row_id) >= 51) return false;
  if (/r25l_|r25ak_|r25am_|\/(train|dev|heldout)\.jsonl$/.test(file)) return true;
  return false;
}

function compact(row, file) {
  return {
    sample_id: row.sample_id,
    split: row.split || splitFromPath(file),
    source_file: file,
    user_answered: isUserAnswered(row),
    language: row.language || "unknown",
    answer_mode: row.answer_mode || "unknown",
    pack_id: row.pack_id || "",
    source_category: row.source_category || row.provenance?.source_type || "unknown"
  };
}

function fill(split, rows) {
  const candidates = rows.filter((item) => item.split === split);
  const user = candidates.filter((item) => item.user_answered);
  const nonUser = candidates.filter((item) => !item.user_answered);
  const picked = [...user.slice(0, TARGETS[split]), ...nonUser.slice(0, Math.max(0, TARGETS[split] - user.length))].slice(0, TARGETS[split]);
  return picked;
}

async function main() {
  const rows = [];
  for (const file of ACTIVE_CORPUS_FILES) {
    for (const { row } of await readJsonlRows(file)) {
      if (isUserAnswered(row) || isAllowedNonUser(row, file)) rows.push(compact(row, file));
    }
  }
  const planned = Object.fromEntries(Object.keys(TARGETS).map((split) => [split, fill(split, rows)]));
  const failures = [];
  for (const [split, target] of Object.entries(TARGETS)) {
    if (planned[split].length !== target) failures.push({ code: "planned_count_mismatch", split, expected: target, actual: planned[split].length });
  }
  const shares = Object.fromEntries(Object.entries(planned).map(([split, items]) => [split, items.filter((item) => item.user_answered).length / Math.max(1, items.length)]));
  if (shares.train < 0.35 || shares.train > 0.45) failures.push({ code: "train_user_answered_share_out_of_range", share: shares.train });
  for (const split of ["dev", "heldout"]) {
    if (shares[split] < 0.15 || shares[split] > 0.25) failures.push({ code: "eval_user_answered_share_out_of_range", split, share: shares[split] });
  }
  const report = {
    ok: failures.length === 0,
    phase: "R26H",
    plan_id: "r26i_answer_as_user_microcycle_entry_plan",
    proposed_training_config: {
      run_id: "r26i_answer_as_user_microcycle",
      max_train_rows: 192,
      max_dev_rows: 48,
      max_heldout_rows: 48,
      max_context_tokens: 64,
      max_steps: 50,
      learning_rate: 0.0025,
      batch_size: 4,
      architecture: "same 1-layer causal_decoder_pilot baseline",
      early_stop_if_dev_worsens: true
    },
    planned_counts: Object.fromEntries(Object.entries(planned).map(([split, items]) => [split, items.length])),
    user_answered_counts: Object.fromEntries(Object.entries(planned).map(([split, items]) => [split, items.filter((item) => item.user_answered).length])),
    user_answered_share: shares,
    source_file_distribution: countBy(Object.values(planned).flat(), "source_file"),
    focus: ["answer_as_user", "weird_question_abstraction", "pressure_resistance", "refusal_boundary", "abstract_judgment", "values/aesthetics/language meaning"],
    excluded_sources: ["old question_pack_001 rows 51-100", "eval prompts", "private_sources", "data/public_ingestion", "root docs", "artifacts"],
    selected_sample_ids: Object.fromEntries(Object.entries(planned).map(([split, items]) => [split, items.map((item) => item.sample_id)])),
    failures,
    safety: {
      training_ran: false,
      dataset_files_written: false,
      corpus_modified: false,
      phase4_scaled_training: false
    }
  };
  await writeJson(REPORT_PATH, report);
  await writeText(SUMMARY_PATH, `# R26H R26I Training-Entry Plan

R26H simulates the R26I training-entry plan without training and without writing train/dev/heldout dataset files.

## Proposed R26I Microcycle

- Run id: \`r26i_answer_as_user_microcycle\`
- Train/dev/heldout planned counts: ${report.planned_counts.train}/${report.planned_counts.dev}/${report.planned_counts.heldout}
- User-answer counts: train ${report.user_answered_counts.train}, dev ${report.user_answered_counts.dev}, heldout ${report.user_answered_counts.heldout}
- User-answer shares: train ${Math.round(shares.train * 1000) / 10}%, dev ${Math.round(shares.dev * 1000) / 10}%, heldout ${Math.round(shares.heldout * 1000) / 10}%
- Max context tokens: 64
- Max steps: 50
- Learning rate: 0.0025
- Batch size: 4
- Architecture: same 1-layer causal decoder pilot baseline
- Decision status: ${report.ok ? "plan_ready" : "plan_blocked"}

This is a bounded answer-as-user microcycle plan only. R26I is not automatically approved; product/formal training progress remains 0%, phase_4 remains blocked, and no weights or artifacts are committed.
`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
