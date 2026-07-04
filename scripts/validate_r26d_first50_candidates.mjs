#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  ACTIVE_CORPUS_FILES,
  exists,
  gitLines,
  readJsonlRows,
  repoPath,
  stagedFiles,
  writeJson
} from "./r26a_project_utils.mjs";
import { R26D_CANDIDATE_FILE, R26D_PACK_ID } from "./r26d_question_pack_utils.mjs";

const FORBIDDEN_FIELD_RE = /chain_of_thought|hidden_prompt|system_prompt|raw_private_data|local_private_path/i;
const PRIVATE_PATH_RE = /\/Users\/|file:\/\/|Desktop\/|private_sources\//;
const SECRET_RE = /(api[_-]?key|secret|password|token)\s*[:=]/i;

async function main() {
  const failures = [];
  if (!(await exists(R26D_CANDIDATE_FILE))) failures.push({ code: "candidate_file_missing", path: R26D_CANDIDATE_FILE });
  const rows = (await exists(R26D_CANDIDATE_FILE)) ? await readJsonlRows(R26D_CANDIDATE_FILE) : [];
  const sampleIds = new Set();
  for (const { row, line } of rows) {
    const text = JSON.stringify(row);
    if (sampleIds.has(row.sample_id)) failures.push({ code: "duplicate_sample_id", line, sample_id: row.sample_id });
    sampleIds.add(row.sample_id);
    if (!(row.source_row_id >= 1 && row.source_row_id <= 50)) failures.push({ code: "source_row_outside_first50", line, source_row_id: row.source_row_id });
    if (row.source_row_id >= 51) failures.push({ code: "excluded_row_candidate", line, source_row_id: row.source_row_id });
    if (!row.target_answer) failures.push({ code: "empty_target_answer", line });
    if (FORBIDDEN_FIELD_RE.test(text)) failures.push({ code: "forbidden_prompt_or_cot_marker", line });
    if (PRIVATE_PATH_RE.test(text)) failures.push({ code: "local_private_path_or_private_source_reference", line });
    if (SECRET_RE.test(text)) failures.push({ code: "secret_like_string", line });
    if (row.training_allowed !== false) failures.push({ code: "training_allowed_not_false", line });
    if (row.public_commit_allowed !== false) failures.push({ code: "public_commit_allowed_not_false", line });
    if (row.review_status !== "candidate_unreviewed") failures.push({ code: "review_status_not_candidate_unreviewed", line });
    if (Array.isArray(row.rejected_answers) && row.rejected_answers.length > 0) failures.push({ code: "unexpected_generated_rejected_answers", line });
    if (row.provenance?.pack_id !== R26D_PACK_ID) failures.push({ code: "missing_pack_provenance", line });
  }

  for (const path of ACTIVE_CORPUS_FILES) {
    if (!(await exists(path))) continue;
    for (const { row, line } of await readJsonlRows(path)) {
      const pack = row?.pack_id || row?.source_pack_id || row?.provenance?.pack_id;
      const id = row?.source_row_id || row?.source_question_id || row?.row_id || row?.provenance?.source_row_id;
      if (pack === R26D_PACK_ID && Number(id) >= 51) {
        failures.push({ code: "excluded_question_pack_row_in_training_corpus", path, line });
      }
    }
  }

  const staged = await stagedFiles();
  for (const path of staged) {
    if (/^artifacts\//.test(path)) failures.push({ code: "artifact_staged", path });
    if (/^private_sources\//.test(path)) failures.push({ code: "private_source_staged", path });
    if (/\.(csv|CSV|xlsx|XLSX)$/.test(path)) failures.push({ code: "raw_question_pack_staged", path });
    if (/^training\/llm_corpus\//.test(path)) failures.push({ code: "training_corpus_staged", path });
  }
  const trackedCsv = (await gitLines(["ls-files"])).filter((path) => /another_brain_question_pack_001_answered\.csv$|\.(csv|CSV|xlsx|XLSX)$/.test(path));
  for (const path of trackedCsv) {
    if (/question_pack|问题包|answer/i.test(path)) failures.push({ code: "raw_question_pack_tracked", path });
  }

  const report = {
    ok: failures.length === 0,
    phase: "R26D",
    candidate_file: R26D_CANDIDATE_FILE,
    candidate_rows: rows.length,
    rows_51_100_candidates: rows.filter(({ row }) => Number(row.source_row_id) >= 51).length,
    failures,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_promotion_ran: false
  };
  await writeJson("artifacts/training_os/user_answer_intake/r26d/r26d_first50_candidate_validation.json", report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
