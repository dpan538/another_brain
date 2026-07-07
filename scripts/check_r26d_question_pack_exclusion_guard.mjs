#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  ACTIVE_CORPUS_FILES,
  exists,
  gitLines,
  readJson,
  readJsonlRows,
  repoPath,
  stagedFiles,
  trackedFiles,
  writeJson
} from "./r26a_project_utils.mjs";
import { R26D_CANDIDATE_FILE, R26D_PACK_ID } from "./r26d_question_pack_utils.mjs";

const ALLOWED_R28M1_STATIC_Q4_SHARD = /^web\/another_brain\/model_assets\/r28m1\/shards\/model-q4-\d{5}\.bin$/;

function rowId(row) {
  return Number(row?.source_row_id || row?.source_question_id || row?.row_id || row?.provenance?.source_row_id || 0);
}

async function textIfExists(path) {
  if (!(await exists(path))) return "";
  return readFile(repoPath(path), "utf8");
}

async function main() {
  const failures = [];
  const required = [
    "training/current/user_answer_intake_policy.r26d.json",
    "training/current/answer_as_user_candidate.schema.json",
    "training/current/question_pack_manifest.schema.json",
    "training/current/question_pack_001_manifest.r26d.json",
    "training/current/question_pack_policy.r26d.json",
    "training/from_scratch/APPROVE_R26E_PROMOTE_FIRST50_USER_ANSWERS.template.json"
  ];
  for (const path of required) {
    if (!(await exists(path))) failures.push({ code: "missing_required_file", path });
  }
  const manifest = await readJson("training/current/question_pack_001_manifest.r26d.json").catch(() => null);
  if (manifest?.excluded_from_training_range !== "51-100") failures.push({ code: "manifest_exclusion_range_invalid" });
  if (manifest?.candidate_review_only_range !== "1-50") failures.push({ code: "manifest_candidate_range_invalid" });

  if (await exists(R26D_CANDIDATE_FILE)) {
    for (const { row, line } of await readJsonlRows(R26D_CANDIDATE_FILE)) {
      if (rowId(row) >= 51) failures.push({ code: "excluded_row_in_r26d_candidate", line, source_row_id: rowId(row) });
      if (row.training_allowed !== false) failures.push({ code: "candidate_training_allowed", line });
      if (row.public_commit_allowed !== false) failures.push({ code: "candidate_public_commit_allowed", line });
    }
  }

  for (const path of ACTIVE_CORPUS_FILES) {
    if (!(await exists(path))) continue;
    for (const { row, line } of await readJsonlRows(path)) {
      const pack = row?.pack_id || row?.source_pack_id || row?.provenance?.pack_id;
      if (pack === R26D_PACK_ID && rowId(row) >= 51) {
        failures.push({ code: "excluded_row_in_training_corpus", path, line });
      }
    }
  }

  const trainingCurrent = await textIfExists("training/current/corpus_manifest.json");
  if (trainingCurrent.includes(R26D_PACK_ID) && /5[1-9]|[6-9][0-9]|100/.test(trainingCurrent) && /eligible|training_allowed|active_current/.test(trainingCurrent)) {
    failures.push({ code: "current_manifest_may_include_excluded_rows" });
  }

  const tracked = await trackedFiles();
  for (const path of tracked.filter((item) => /^training\/from_scratch\/.*tokenizer.*\.json$/i.test(item) || /teacher.*(probe|policy).*\.json$/i.test(item) || /corpus.*(plan|promotion|candidate|expansion).*\.json$/i.test(item))) {
    const text = await textIfExists(path);
    if (text.includes(R26D_PACK_ID) && /51|52|100|excluded_from_training/.test(text) && /allow|training|tokenizer|teacher|promote|generate/i.test(text)) {
      failures.push({ code: "training_related_config_references_excluded_rows", path });
    }
  }

  const staged = await stagedFiles();
  for (const path of staged) {
    if (/^artifacts\//.test(path)) failures.push({ code: "artifact_staged", path });
    if (/^private_sources\//.test(path)) failures.push({ code: "private_source_staged", path });
    if (/^data\/public_ingestion\//.test(path)) failures.push({ code: "public_ingestion_staged", path });
    if (/\.(csv|CSV|xlsx|XLSX|pdf|PDF|docx|DOCX|doc|DOC)$/.test(path)) failures.push({ code: "raw_or_document_file_staged", path });
  }

  const trackedBad = (await gitLines(["ls-files"]))
    .filter((path) => /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i.test(path))
    .filter((path) => !ALLOWED_R28M1_STATIC_Q4_SHARD.test(path));
  for (const path of trackedBad) failures.push({ code: "tracked_weight", path });

  const report = {
    ok: failures.length === 0,
    phase: "R26D",
    pack_id: R26D_PACK_ID,
    candidate_range: "1-50",
    excluded_range: "51-100",
    failures,
    rows_51_100_in_candidates: 0,
    rows_51_100_in_training_corpus: failures.filter((item) => item.code === "excluded_row_in_training_corpus").length,
    raw_csv_staged: staged.filter((path) => /\.(csv|CSV|xlsx|XLSX)$/.test(path)).length,
    artifacts_staged: staged.filter((path) => path.startsWith("artifacts/")).length,
    active_training_approval_count_expected: 0,
    phase4_approved: false
  };
  await writeJson("artifacts/training_os/user_answer_intake/r26d/r26d_question_pack_exclusion_guard.json", report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
