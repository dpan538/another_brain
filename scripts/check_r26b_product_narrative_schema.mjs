#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  exists,
  gitLines,
  readJson,
  repoPath,
  stagedFiles,
  writeJson
} from "./r26a_project_utils.mjs";

const REQUIRED = [
  "docs/current/PRODUCT_TARGET.md",
  "docs/current/ANSWER_AS_USER_MODEL.md",
  "docs/current/DATA_STRATEGY.md",
  "docs/current/TRAINING_STRATEGY.md",
  "docs/current/TEACHER_PROBE_POLICY.md",
  "docs/current/TEACHER_PROBE_FEASIBILITY.md",
  "training/current/answer_as_user.schema.json",
  "training/current/answer_modes.json",
  "training/current/teacher_probe_policy.json",
  "evals/current/anti_malicious_fallback_plan.md",
  "evals/current/answer_as_user_eval_plan.md",
  "docs/R26B_R26A_COMPLETENESS_AUDIT.md",
  "docs/R26B_ASSISTANT_PERSONA_WORDING_AUDIT.md",
  "docs/R26B_CLEANUP_REVIEW_PACKET.md"
];

const BAD_STAGED_RE = /^(artifacts\/|data\/public_ingestion\/|private_sources\/)|\.(pdf|PDF|docx|DOCX|doc|DOC)$/;
const WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;
const BACKEND_RE = /\b(Vercel Blob|KV|Postgres|Redis|AI Gateway|api\/|functions|edge function)\b/i;

function walkKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, keys);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      walkKeys(child, keys);
    }
  }
  return keys;
}

async function main() {
  const failures = [];
  for (const path of REQUIRED) {
    if (!(await exists(path))) failures.push({ code: "missing_required_r26b_file", path });
  }

  const schema = await readJson("training/current/answer_as_user.schema.json").catch((error) => {
    failures.push({ code: "answer_schema_invalid_json", message: error.message });
    return null;
  });
  const modes = await readJson("training/current/answer_modes.json").catch((error) => {
    failures.push({ code: "answer_modes_invalid_json", message: error.message });
    return null;
  });
  const teacher = await readJson("training/current/teacher_probe_policy.json").catch((error) => {
    failures.push({ code: "teacher_policy_invalid_json", message: error.message });
    return null;
  });

  for (const field of ["sample_id", "language", "speaker_context", "question", "answer_mode", "answer_as", "target_answer"]) {
    if (!schema?.required?.includes(field)) failures.push({ code: "schema_missing_required_field", field });
  }
  if (schema?.properties?.answer_as?.const !== "user_self") failures.push({ code: "schema_answer_as_not_user_self" });
  for (const forbidden of ["chain_of_thought", "hidden_prompt", "raw_private_data", "local_private_path"]) {
    const keys = walkKeys(schema);
    if (!JSON.stringify(schema).includes(forbidden)) failures.push({ code: "schema_missing_forbidden_marker", forbidden });
    if (keys.includes(forbidden) && !JSON.stringify(schema.not || {}).includes(forbidden)) {
      failures.push({ code: "schema_allows_forbidden_field", forbidden });
    }
  }
  if (!modes?.answer_modes?.includes("pressure_resistance")) failures.push({ code: "answer_modes_missing_pressure_resistance" });
  if (teacher?.r26b_calls_teacher !== false || teacher?.runtime_dependency_allowed !== false) {
    failures.push({ code: "teacher_policy_too_permissive" });
  }

  const productDoc = await readFile(repoPath("docs/current/PRODUCT_TARGET.md"), "utf8").catch(() => "");
  const answerDoc = await readFile(repoPath("docs/current/ANSWER_AS_USER_MODEL.md"), "utf8").catch(() => "");
  if (!/not a generic AI assistant/i.test(productDoc)) failures.push({ code: "product_doc_missing_not_generic_assistant" });
  if (!/assistant.*serialization only/i.test(productDoc + "\n" + answerDoc)) failures.push({ code: "current_docs_missing_serialization_only" });
  if (BACKEND_RE.test(productDoc + "\n" + answerDoc)) failures.push({ code: "current_docs_backend_or_external_api_path" });

  const staged = await stagedFiles();
  for (const path of staged) {
    if (BAD_STAGED_RE.test(path)) failures.push({ code: "forbidden_file_staged", path });
    if (/^training\/llm_corpus\//.test(path)) failures.push({ code: "training_llm_corpus_staged", path });
  }
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => WEIGHT_RE.test(path));
  for (const path of trackedWeights) failures.push({ code: "tracked_model_weight", path });

  const status = await readJson("training/current/training_status.json").catch(() => null);
  if (status?.product_training_progress_percent !== 0) failures.push({ code: "product_training_progress_not_zero" });
  if (status?.formal_decoder_training_progress_percent !== 0) failures.push({ code: "formal_decoder_progress_not_zero" });
  if (status?.phase_4_scaled_training_approved !== false) failures.push({ code: "phase4_not_blocked" });

  const report = {
    ok: failures.length === 0,
    failures,
    staged_checked: staged.length,
    active_training_approval_count_expected: 0,
    active_tokenizer_approval_count_expected: 0,
    phase4_approved: false,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false
  };
  await writeJson("artifacts/training_os/r26b_review/r26b_product_narrative_schema_check.json", report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
