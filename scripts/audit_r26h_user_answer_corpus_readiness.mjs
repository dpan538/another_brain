#!/usr/bin/env node
import { ACTIVE_CORPUS_FILES, readJsonlRows, writeJson, writeText } from "./r26a_project_utils.mjs";
import { countBy, normalizeTarget } from "./r26g_user_answer_utils.mjs";

const REPORT_PATH = "artifacts/training_os/user_answer_readiness/r26h/r26h_user_answer_corpus_readiness.json";
const SUMMARY_PATH = "docs/R26H_USER_ANSWER_CORPUS_READINESS.md";
const RISK_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|raw_private_data|private_memory|api_key|BEGIN PRIVATE KEY|\/Users\/|\/private\/var\/|private_sources\//i;

function isUserAnswered(row) {
  return row?.provenance?.source_type === "user_answered" || /^r26[eg]_/.test(String(row?.sample_id || ""));
}

function stats(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] : 0;
  return { min: sorted[0] || 0, p25: at(0.25), median: at(0.5), p75: at(0.75), max: sorted[sorted.length - 1] || 0 };
}

async function main() {
  const rows = [];
  for (const file of ACTIVE_CORPUS_FILES) {
    for (const { row, line } of await readJsonlRows(file)) rows.push({ ...row, __file: file, __line: line });
  }
  const userRows = rows.filter(isUserAnswered);
  const duplicateGroups = Object.entries(countBy(userRows, (row) => normalizeTarget(row.target_answer)))
    .filter(([target, count]) => target && count > 1)
    .map(([target, count]) => ({ normalized_target_sha_hint: target.slice(0, 24), count }));
  const riskRows = userRows.filter((row) => RISK_RE.test(JSON.stringify(row)));
  const emptyTargetRows = userRows.filter((row) => !String(row.target_answer || "").trim());
  const oldExcludedRows = rows.filter((row) => row.pack_id === "another_brain_question_pack_001" && Number(row.source_row_id) >= 51);
  const failures = [];
  if (userRows.length < 90) failures.push({ code: "too_few_user_answered_rows", count: userRows.length });
  if (oldExcludedRows.length) failures.push({ code: "old_question_pack_001_rows_51_100_present", count: oldExcludedRows.length });
  if (userRows.some((row) => row.response_obligation !== "produce_response")) failures.push({ code: "response_obligation_not_produce_response_for_all_user_rows" });
  if (emptyTargetRows.length) failures.push({ code: "empty_target_answer", count: emptyTargetRows.length });
  if (userRows.some((row) => row.contains_private_data === true || row.provenance?.contains_private_data === true)) failures.push({ code: "private_data_true" });
  if (riskRows.length) failures.push({ code: "chain_hidden_prompt_or_local_path_risk", count: riskRows.length });
  if (duplicateGroups.some((group) => group.count > 2)) failures.push({ code: "duplicate_target_group_above_threshold", duplicateGroups });
  for (const split of ["train", "dev", "heldout"]) {
    if (!userRows.some((row) => row.split === split)) failures.push({ code: "missing_user_answered_split", split });
  }
  const report = {
    ok: failures.length === 0,
    phase: "R26H",
    full_checked_corpus_rows: rows.length,
    user_answered_rows_total: userRows.length,
    user_answered_split_counts: countBy(userRows, "split"),
    pack_distribution: countBy(userRows, "pack_id"),
    r26e_vs_r26g_counts: {
      r26e: userRows.filter((row) => String(row.sample_id || "").startsWith("r26e_")).length,
      r26g: userRows.filter((row) => String(row.sample_id || "").startsWith("r26g_")).length
    },
    answer_mode_distribution: countBy(userRows, "answer_mode"),
    response_obligation_distribution: countBy(userRows, "response_obligation"),
    should_answer_distribution: countBy(userRows, (row) => String(row.should_answer)),
    direct_compliance_distribution: countBy(userRows, (row) => String(row.direct_compliance)),
    valid_nonanswer_distribution: countBy(userRows, (row) => String(row.valid_nonanswer)),
    evidence_policy_distribution: countBy(userRows, "evidence_policy"),
    target_answer_length_distribution: stats(userRows.map((row) => String(row.target_answer || "").length)),
    duplicate_normalized_target_answer_count: duplicateGroups.reduce((sum, group) => sum + group.count, 0),
    duplicate_groups: duplicateGroups,
    empty_target_count: emptyTargetRows.length,
    private_data_true_count: userRows.filter((row) => row.contains_private_data === true || row.provenance?.contains_private_data === true).length,
    old_question_pack_001_rows_51_100_count: oldExcludedRows.length,
    chain_hidden_prompt_local_path_risk_count: riskRows.length,
    failures,
    safety: {
      decoder_training_ran: false,
      small_pilot_training_ran: false,
      phase4_scaled_training_ran: false,
      corpus_modified: false
    }
  };
  await writeJson(REPORT_PATH, report);
  await writeText(SUMMARY_PATH, `# R26H User-Answer Corpus Readiness

R26H validates the post-R26G user-answer corpus without training, corpus expansion, corpus promotion, or corpus row mutation.

## Result

- Status: ${report.ok ? "passed" : "blocked"}
- Full checked corpus rows: ${report.full_checked_corpus_rows}
- User-answer rows: ${report.user_answered_rows_total}
- User-answer split counts: ${JSON.stringify(report.user_answered_split_counts)}
- Pack distribution: ${JSON.stringify(report.pack_distribution)}
- R26E/R26G counts: ${JSON.stringify(report.r26e_vs_r26g_counts)}
- Response obligation: ${JSON.stringify(report.response_obligation_distribution)}
- Should answer: ${JSON.stringify(report.should_answer_distribution)}
- Empty targets: ${report.empty_target_count}
- Duplicate normalized target rows: ${report.duplicate_normalized_target_answer_count}
- Private-data true rows: ${report.private_data_true_count}
- Chain-of-thought / hidden prompt / local path risks: ${report.chain_hidden_prompt_local_path_risk_count}
- Old question_pack_001 rows 51-100 present: ${report.old_question_pack_001_rows_51_100_count}

R26H is the final readiness gate before a possible R26I answer-as-user microcycle. R26I is not automatically approved, product/formal training progress remains 0%, phase_4 remains blocked, and no weights or tokenizer artifacts are committed.
`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
