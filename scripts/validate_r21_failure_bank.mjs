import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const BANK = resolve(ROOT, "data/failure_bank/r21_failure_bank.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/r21_failure_bank_report.json");

const REQUIRED = [
  "id",
  "raw_session",
  "failed_turn_index",
  "expected_response_type",
  "expected_response_mode",
  "expected_binding_kind",
  "expected_active_referent",
  "expected_operation",
  "actual_response_type",
  "actual_response_mode",
  "actual_binding_kind",
  "actual_answer",
  "failure_type",
  "root_cause_guess",
  "must_not_patch_directly",
  "requires_generalized_eval"
];

const ALLOWED_FAILURE_TYPES = new Set([
  "wrong_response_mode",
  "wrong_binding",
  "active_topic_lost",
  "repair_overtrigger",
  "repair_undertrigger",
  "affordance_overtrigger",
  "generic_fallback_leaked",
  "answer_density_fail",
  "dedupe_masked_bad_answer",
  "entity_specific_patch_risk",
  "test_overfit_risk",
  "reasoning_step_missing",
  "same_template_streak"
]);

function lines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim());
}

async function main() {
  const rows = lines(await readFile(BANK, "utf8")).map((line, index) => ({ index: index + 1, row: JSON.parse(line) }));
  const failures = [];
  const ids = new Set();
  const typeCounts = {};

  for (const { index, row } of rows) {
    for (const key of REQUIRED) {
      if (!(key in row)) failures.push({ index, id: row.id || "", reason: `missing_${key}` });
    }
    if (ids.has(row.id)) failures.push({ index, id: row.id, reason: "duplicate_id" });
    ids.add(row.id);
    if (!Array.isArray(row.raw_session) || row.raw_session.length === 0) failures.push({ index, id: row.id, reason: "raw_session_empty" });
    if (!ALLOWED_FAILURE_TYPES.has(row.failure_type)) failures.push({ index, id: row.id, reason: "unknown_failure_type" });
    if (row.must_not_patch_directly !== true) failures.push({ index, id: row.id, reason: "must_not_patch_directly_not_true" });
    if (row.requires_generalized_eval !== true) failures.push({ index, id: row.id, reason: "requires_generalized_eval_not_true" });
    typeCounts[row.failure_type] = (typeCounts[row.failure_type] || 0) + 1;
  }

  const report = {
    ok: failures.length === 0,
    rows: rows.length,
    failure_types: typeCounts,
    failures
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
