#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25ad/r25ad_r25ae_corpus_expansion_design_check.json";
const PLAN_PATH = "training/from_scratch/chinese_personal_corpus_expansion_plan.r25ae.json";
const TEMPLATE_PATH = "training/from_scratch/APPROVE_R25AE_CHINESE_PERSONAL_CORPUS_EXPANSION.template.json";
const DOC_PATH = "docs/R25AD_R25AE_CORPUS_EXPANSION_DESIGN.md";
const TARGET = { zh_min: 0.7, mixed_target: 0.2, en_max: 0.1 };

async function readText(path) {
  return readFile(resolve(ROOT, path), "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function collectSourceLikeValues(value, out = [], sourceLikeContext = false) {
  if (typeof value === "string") {
    if (sourceLikeContext) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSourceLikeValues(item, out, sourceLikeContext);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, item] of Object.entries(value)) {
    if (/forbidden|blocked/i.test(key)) continue;
    const childSourceLike = sourceLikeContext || /source|path|root|input|corpus|doc/i.test(key);
    collectSourceLikeValues(item, out, childSourceLike);
  }
  return out;
}

function flagIf(failures, condition, code, detail = {}) {
  if (condition) failures.push({ code, ...detail });
}

async function main() {
  const failures = [];
  const plan = await readJson(PLAN_PATH).catch((error) => {
    failures.push({ code: "plan_missing_or_invalid_json", path: PLAN_PATH, detail: error.message });
    return null;
  });
  const template = await readJson(TEMPLATE_PATH).catch((error) => {
    failures.push({ code: "approval_template_missing_or_invalid_json", path: TEMPLATE_PATH, detail: error.message });
    return null;
  });
  const doc = await readText(DOC_PATH).catch((error) => {
    failures.push({ code: "design_doc_missing", path: DOC_PATH, detail: error.message });
    return "";
  });

  flagIf(failures, plan?.plan_id !== "r25ae_chinese_personal_corpus_expansion", "plan_id_mismatch");
  flagIf(failures, plan?.status !== "future_design_only_not_approved", "plan_status_must_be_future_design_only");
  flagIf(failures, plan?.training_allowed !== false, "plan_training_must_be_false");
  flagIf(failures, plan?.corpus_generation_allowed_in_r25ad !== false, "r25ad_must_not_allow_corpus_generation");
  flagIf(failures, plan?.requires_fresh_approval_for_r25ae !== true, "r25ae_must_require_fresh_approval");
  flagIf(failures, plan?.external_llm_generation_allowed !== false, "external_llm_generation_must_be_false");
  flagIf(failures, plan?.private_raw_data_allowed !== false, "private_raw_data_must_be_false");
  flagIf(failures, plan?.chain_of_thought_allowed !== false, "chain_of_thought_must_be_false");
  flagIf(failures, plan?.phase_4_scaled_training_approved !== false, "phase4_must_be_false");
  flagIf(failures, plan?.product_model_training_allowed !== false, "product_training_must_be_false");
  flagIf(failures, plan?.commit_weights_allowed !== false, "weight_commit_must_be_false");
  flagIf(failures, Number(plan?.target_language_mix?.zh_min) < TARGET.zh_min, "zh_min_below_target");
  flagIf(failures, Number(plan?.target_language_mix?.en_max) > TARGET.en_max, "en_max_above_target");

  flagIf(failures, template?.approved !== false, "template_must_be_approved_false");
  flagIf(failures, template?.reviewer !== "", "template_reviewer_must_be_blank");
  flagIf(failures, template?.scope !== "chinese_personal_corpus_expansion_only", "template_scope_mismatch");
  flagIf(failures, template?.phase !== "phase_3_corpus_expansion", "template_phase_mismatch");
  flagIf(failures, template?.run_id !== "r25ae_chinese_personal_corpus_expansion", "template_run_id_mismatch");
  for (const key of [
    "allow_corpus_generation",
    "allow_training",
    "allow_small_pilot_training",
    "allow_phase_4_scaled_training",
    "allow_long_term_training",
    "allow_product_model_training",
    "allow_external_llm_generation",
    "allow_private_data_sources",
    "allow_release_checkpoint",
    "allow_weight_commit"
  ]) {
    flagIf(failures, template?.[key] !== false, "template_flag_must_be_false", { key });
  }

  for (const value of collectSourceLikeValues(plan)) {
    flagIf(failures, /(^|\/)data\/public_ingestion(\/|$)|(^|\/)public_ingestion(\/|$)/i.test(value), "forbidden_public_ingestion_source", { value });
    flagIf(failures, /^(?!docs\/|training\/|scripts\/|static_llm\/|web\/|evals\/|knowledge_sources\/|identity_pack\/|artifacts\/)[^/]+\.(pdf|docx)$/i.test(value), "forbidden_root_pdf_docx_source", { value });
  }

  const combined = `${JSON.stringify(plan)}\n${JSON.stringify(template)}\n${doc}`;
  const removed = [113, 119, 101, 110].map((code) => String.fromCharCode(code)).join("");
  const removedRe = new RegExp(`${removed}|${removed}2|${removed}lm|${removed}2_5|${removed}2\\.5|${removed}\\/${removed}|${removed}lm\\/${removed}`, "i");
  flagIf(failures, removedRe.test(combined), "named_pretrained_model_string_present");
  flagIf(failures, /final_strategy"\s*:\s*"(?:lora|adapter|fine[-_ ]?tune)/i.test(combined), "lora_adapter_finetune_final_strategy_present");
  flagIf(failures, /allow_(?:backend|api|external_storage)"\s*:\s*true/i.test(combined), "backend_storage_or_api_allowed");

  const report = {
    ok: failures.length === 0,
    report_id: "r25ad_r25ae_corpus_expansion_design_check",
    training_ran: false,
    corpus_generated: false,
    phase_4_scaled_training_approved: false,
    product_model_training_allowed: false,
    release_checkpoint_allowed: false,
    approval_template_status: template?.approved === false ? "inert_template_approved_false" : "needs_review",
    plan_status: plan?.status || "not_present",
    failures,
    notes: [
      "R25AE is a future corpus-expansion design only in R25AD.",
      "The inert approval template does not authorize corpus generation, training, phase_4, product training, external LLM generation, private sources, release checkpoints, or weight commits."
    ]
  };

  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
