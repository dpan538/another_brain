#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  R26E_FILES,
  R26E_PACK_ID,
  R26E_PHASE,
  R26E_VALIDATION_REPORT,
  collectStrings,
  loadPromotedRows,
  normalizeTarget,
  stagedForbiddenArtifacts,
  writePromotionLikeReport,
  FORBIDDEN_FIELD_RE,
  LOCAL_PATH_RE,
  SECRET_RE
} from "./r26e_user_answer_promotion_utils.mjs";
import { exists, repoPath } from "./r26a_project_utils.mjs";

function walk(value, path = "$", out = []) {
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      out.push({ key, path: `${path}.${key}`, value: nested });
      walk(nested, `${path}.${key}`, out);
    }
  }
  return out;
}

async function readEvalStrings() {
  const sources = [
    "evals/r24_intelligence_recovery/prompts.jsonl",
    "evals/r24d_heldout_recovery/prompts.jsonl",
    "evals/r25_static_llm_admission/prompts.jsonl"
  ];
  const out = new Set();
  for (const source of sources) {
    if (!(await exists(source))) continue;
    const text = await readFile(repoPath(source), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      for (const value of collectStrings(row).map(normalizeTarget).filter((item) => item.length >= 12)) out.add(value);
    }
  }
  return out;
}

async function main() {
  const failures = [];
  for (const path of Object.values(R26E_FILES)) {
    if (!(await exists(path))) failures.push({ code: "promoted_file_missing", path });
  }
  const rows = await loadPromotedRows();
  const evalStrings = await readEvalStrings();
  const sampleIds = new Set();
  const targetAnswers = new Set();
  const splitTargets = { train: new Set(), dev: new Set(), heldout: new Set() };

  for (const row of rows) {
    const loc = { file: row.__file, line: row.__line, sample_id: row.sample_id };
    if (row.split !== row.__expected_split) failures.push({ code: "split_file_mismatch", ...loc, split: row.split });
    if (sampleIds.has(row.sample_id)) failures.push({ code: "duplicate_sample_id", ...loc });
    sampleIds.add(row.sample_id);
    const sourceRowId = Number(row.source_row_id);
    if (!Number.isInteger(sourceRowId) || sourceRowId < 1 || sourceRowId > 50) failures.push({ code: "source_row_id_not_1_50", ...loc, source_row_id: row.source_row_id });
    if (sourceRowId >= 51) failures.push({ code: "source_row_id_51_100_promoted", ...loc });
    if (!row.target_answer || !normalizeTarget(row.target_answer)) failures.push({ code: "empty_target_answer", ...loc });
    if (normalizeTarget(row.target_answer) !== normalizeTarget(row.user_answer_clean)) failures.push({ code: "target_not_derived_from_user_answer_clean", ...loc });
    const target = normalizeTarget(row.target_answer);
    if (targetAnswers.has(target)) failures.push({ code: "duplicate_target_answer", ...loc });
    targetAnswers.add(target);
    if (splitTargets.train.has(target) || splitTargets.dev.has(target) || splitTargets.heldout.has(target)) {
      failures.push({ code: "train_dev_heldout_overlap", ...loc });
    }
    splitTargets[row.split]?.add(target);
    for (const item of walk(row)) if (FORBIDDEN_FIELD_RE.test(item.key)) failures.push({ code: "forbidden_field", ...loc, path: item.path });
    for (const text of collectStrings(row)) {
      if (LOCAL_PATH_RE.test(text)) failures.push({ code: "local_absolute_or_private_path", ...loc });
      if (SECRET_RE.test(text)) failures.push({ code: "secret_like_string", ...loc });
      if (/^data\/public_ingestion\//.test(text)) failures.push({ code: "data_public_ingestion_source", ...loc });
      if (/\.(pdf|PDF|docx|DOCX|doc|DOC)$/.test(text) && /^[^/]+\./.test(text)) failures.push({ code: "root_document_source", ...loc });
      if (evalStrings.has(normalizeTarget(text))) failures.push({ code: "eval_prompt_copy", ...loc });
    }
    if (row.review_status !== "reviewed_for_training_corpus") failures.push({ code: "review_status_not_promoted", ...loc });
    if (row.training_allowed !== true) failures.push({ code: "training_allowed_not_true", ...loc });
    if (row.public_commit_allowed !== true) failures.push({ code: "public_commit_allowed_not_true", ...loc });
    if (row.contains_private_data !== false) failures.push({ code: "contains_private_data_not_false", ...loc });
    if (row.provenance?.source_type !== "user_answered") failures.push({ code: "provenance_source_type_not_user_answered", ...loc });
    if (row.provenance?.pack_id !== R26E_PACK_ID) failures.push({ code: "provenance_pack_id_mismatch", ...loc });
    if (row.provenance?.promotion_phase !== R26E_PHASE) failures.push({ code: "provenance_promotion_phase_mismatch", ...loc });
    if (row.provenance?.external_llm_used !== false) failures.push({ code: "external_llm_used_not_false", ...loc });
    if (row.release_checkpoint === true) failures.push({ code: "release_checkpoint_claim", ...loc });
    if (row.product_model === true) failures.push({ code: "product_model_claim", ...loc });
  }

  const staged = await stagedForbiddenArtifacts();
  for (const [category, paths] of Object.entries(staged)) {
    for (const path of paths) failures.push({ code: `${category}_staged`, path });
  }
  const report = {
    ok: failures.length === 0,
    phase: R26E_PHASE,
    promoted_rows_checked: rows.length,
    split_counts: {
      train: rows.filter((row) => row.split === "train").length,
      dev: rows.filter((row) => row.split === "dev").length,
      heldout: rows.filter((row) => row.split === "heldout").length
    },
    source_row_id_min: rows.length ? Math.min(...rows.map((row) => row.source_row_id)) : null,
    source_row_id_max: rows.length ? Math.max(...rows.map((row) => row.source_row_id)) : null,
    rows_51_100_promoted: rows.filter((row) => Number(row.source_row_id) >= 51).length,
    raw_csv_committed: false,
    artifacts_staged: staged.artifacts.length,
    failures
  };
  await writePromotionLikeReport(R26E_VALIDATION_REPORT, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
