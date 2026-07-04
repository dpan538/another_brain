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

const PACK_ID = "another_brain_question_pack_001";
const REPORT = "artifacts/training_os/r26c_question_pack/r26c_question_pack_training_exclusion_check.json";
const EXCLUDED_MODULES = ["项目连续性", "训练与数据", "工具与状态诚实", "审美与风格", "多轮上下文"];
const EXCLUDED_INTENTS = [
  "project_question",
  "training_meta",
  "project_status",
  "tool_status",
  "internal_understanding",
  "progress_review",
  "corpus_strategy",
  "phase_review"
];
const BAD_STAGED_RE = /^(artifacts\/|data\/public_ingestion\/|private_sources\/)|\.(pdf|PDF|docx|DOCX|doc|DOC|csv|CSV|xlsx|XLSX)$/;
const WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;

function numericId(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function rowHasExcludedQuestion(row) {
  const pack =
    row?.source_pack_id ||
    row?.pack_id ||
    row?.provenance?.source_pack_id ||
    row?.provenance?.pack_id ||
    row?.source?.pack_id;
  const ids = [
    row?.row_id,
    row?.source_question_id,
    row?.question_id,
    row?.provenance?.row_id,
    row?.provenance?.source_question_id,
    row?.source?.row_id,
    row?.source?.question_id
  ].map(numericId).filter((id) => id !== null);
  if (pack === PACK_ID && ids.some((id) => id >= 51 && id <= 100)) return "excluded_question_id";
  if (row?.eligibility === "excluded_from_training") return "excluded_eligibility";
  if (String(row?.exclusion_reason || "").includes("Rows 51-100 are project-meta")) return "excluded_reason";
  if (pack === PACK_ID) {
    const module = row?.module || row?.question_module || row?.provenance?.module;
    const intent = row?.question_intent || row?.intent || row?.provenance?.question_intent;
    if (EXCLUDED_MODULES.includes(module) && ids.some((id) => id > 50)) return "excluded_module_for_first_pack";
    if (EXCLUDED_INTENTS.includes(intent) && ids.some((id) => id > 50)) return "excluded_intent_for_first_pack";
  }
  return null;
}

async function scanTextFile(path) {
  if (!(await exists(path))) return "";
  return readFile(repoPath(path), "utf8");
}

async function main() {
  const failures = [];
  const required = [
    "docs/current/QUESTION_PACK_POLICY.md",
    "training/current/question_pack_policy.r26c.json",
    "training/current/question_pack_manifest.schema.json",
    "training/current/question_pack_100_manifest.r26c.json"
  ];
  for (const path of required) {
    if (!(await exists(path))) failures.push({ code: "missing_required_r26c_file", path });
  }

  const policy = await readJson("training/current/question_pack_policy.r26c.json").catch((error) => {
    failures.push({ code: "policy_invalid_json", message: error.message });
    return null;
  });
  const manifest = await readJson("training/current/question_pack_100_manifest.r26c.json").catch((error) => {
    failures.push({ code: "manifest_invalid_json", message: error.message });
    return null;
  });

  if (policy?.hard_excluded_question_ids?.start_id !== 51 || policy?.hard_excluded_question_ids?.end_id !== 100) {
    failures.push({ code: "policy_missing_51_100_exclusion" });
  }
  if (manifest?.excluded_from_training_range?.start_id !== 51 || manifest?.excluded_from_training_range?.end_id !== 100) {
    failures.push({ code: "manifest_missing_51_100_exclusion" });
  }
  if (manifest?.rows_1_to_50_status !== "candidate_review_only_not_training") {
    failures.push({ code: "rows_1_50_not_review_only" });
  }
  if (manifest?.rows_51_to_100_status !== "excluded_from_training") {
    failures.push({ code: "rows_51_100_not_excluded" });
  }

  const corpusHits = [];
  for (const path of ACTIVE_CORPUS_FILES) {
    if (!(await exists(path))) continue;
    const rows = await readJsonlRows(path);
    for (const { row, line } of rows) {
      const reason = rowHasExcludedQuestion(row);
      if (reason) corpusHits.push({ path, line, reason });
    }
  }
  for (const hit of corpusHits) failures.push({ code: "excluded_question_pack_row_in_training_corpus", ...hit });

  const corpusManifest = await scanTextFile("training/current/corpus_manifest.json");
  if (new RegExp(`${PACK_ID}.*(5[1-9]|[6-9][0-9]|100).*eligible_after_review`, "s").test(corpusManifest)) {
    failures.push({ code: "current_corpus_manifest_marks_excluded_rows_eligible" });
  }

  const tracked = await trackedFiles();
  const tokenizerFiles = tracked.filter((path) => /^training\/from_scratch\/.*tokenizer.*\.json$/i.test(path));
  const teacherFiles = tracked.filter((path) => /teacher.*(policy|probe).*\.json$/i.test(path));
  const futurePlanFiles = tracked.filter((path) => /corpus.*(plan|expansion|promotion|candidate).*\.json$/i.test(path));
  const badReferenceFiles = [];
  for (const path of [...tokenizerFiles, ...teacherFiles, ...futurePlanFiles]) {
    const text = await scanTextFile(path);
    if (text.includes(PACK_ID) && /source_question_id|row_id|51|52|100|excluded_from_training/.test(text)) {
      badReferenceFiles.push(path);
    }
  }
  for (const path of badReferenceFiles) failures.push({ code: "excluded_pack_referenced_by_training_related_config", path });

  const scriptWhitelistHits = [];
  for (const path of tracked.filter((item) => /^scripts\/.*\.(mjs|js|py)$/.test(item))) {
    if (/r26c_question_pack/.test(path)) continue;
    const text = await scanTextFile(path);
    if (text.includes(PACK_ID) && /eligible_after_review|allow|whitelist|promote|generate|tokenizer|teacher/i.test(text)) {
      scriptWhitelistHits.push(path);
    }
  }
  for (const path of scriptWhitelistHits) failures.push({ code: "script_may_whitelist_excluded_pack_rows", path });

  const staged = await stagedFiles();
  for (const path of staged) {
    if (BAD_STAGED_RE.test(path)) failures.push({ code: "forbidden_file_staged", path });
    if (/^training\/llm_corpus\//.test(path)) failures.push({ code: "training_llm_corpus_staged", path });
  }
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => WEIGHT_RE.test(path));
  for (const path of trackedWeights) failures.push({ code: "tracked_model_weight", path });

  const trainingStatus = await readJson("training/current/training_status.json").catch(() => null);
  if (trainingStatus?.product_training_progress_percent !== 0) failures.push({ code: "product_training_progress_not_zero" });
  if (trainingStatus?.formal_decoder_training_progress_percent !== 0) failures.push({ code: "formal_decoder_training_progress_not_zero" });
  if (trainingStatus?.phase_4_scaled_training_approved !== false) failures.push({ code: "phase4_not_blocked" });

  const report = {
    ok: failures.length === 0,
    failures,
    pack_id: PACK_ID,
    candidate_range: "1-50",
    excluded_range: "51-100",
    corpus_hits: corpusHits.length,
    tokenizer_config_hits: badReferenceFiles.filter((path) => tokenizerFiles.includes(path)).length,
    teacher_probe_config_hits: badReferenceFiles.filter((path) => teacherFiles.includes(path)).length,
    future_plan_hits: badReferenceFiles.filter((path) => futurePlanFiles.includes(path)).length,
    raw_csv_xlsx_staged: staged.filter((path) => /\.(csv|CSV|xlsx|XLSX)$/.test(path)),
    artifacts_staged: staged.filter((path) => path.startsWith("artifacts/")),
    active_training_approval_count_expected: 0,
    phase4_approved: false
  };
  await writeJson(REPORT, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
