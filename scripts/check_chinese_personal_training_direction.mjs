#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

const REQUIRED_TEXT_FILES = [
  "docs/R25AB_PROJECT_MEANING.md",
  "docs/R25AB_CHINESE_FIRST_TRAINING_DOCTRINE.md",
  "docs/R25AB_PERSONAL_COLOR_BOUNDARY.md",
  "docs/R25AB_HEALTHY_TRAINING_CYCLE.md"
];

const REQUIRED_JSON_FILES = [
  "training/from_scratch/personal_color_boundary.r25ab.json",
  "training/from_scratch/healthy_training_cycle.r25ab.json",
  "training/from_scratch/small_decoder_r25ac_chinese_personal_config.json",
  "training/from_scratch/small_decoder_pilot_run_config.r25ac.template.json",
  "training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.template.json",
  "training/from_scratch/small_decoder_pilot_run_config.r25ac.json",
  "training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.json"
];

const R25AB_SURFACE = [
  ...REQUIRED_TEXT_FILES,
  ...REQUIRED_JSON_FILES,
  "README.md",
  "DATA_CARD.md",
  "DEPLOYMENT.md",
  "docs/R25AC_CHINESE_PERSONAL_MICROCYCLE_RUN.md",
  "docs/R25AC_CHINESE_HELDOUT_EVAL.md",
  "docs/R25AA_PHASE3_PAUSE_AND_REVIEW.md",
  "docs/R25AA_PHASE4_READINESS_REVIEW.md",
  "docs/R25I_TRAINING_PHASE_PLAN.md",
  "docs/R25I_FROM_SCRATCH_LLM_TRAINING_DOCTRINE.md",
  "docs/R25AM_CORPUS_EXPANSION_SUMMARY.md",
  "docs/R25AN_CHINESE_SAMPLER_FEASIBILITY_SUMMARY.md",
  "docs/R25AN_NEXT_STEP_BOUNDARY.md",
  "docs/R25AO_EXPANDED_CHINESE_PERSONAL_MICROCYCLE_RUN.md",
  "docs/R25AO_HELDOUT_AND_BREAKDOWN_EVAL.md",
  "docs/R25AO_REVIEW_AND_NEXT_BOUNDARY.md",
  "docs/R25AQ_R25AO_ROOT_CAUSE_SUMMARY.md",
  "docs/R25AQ_MIXED_EN_WEAKNESS_REVIEW.md",
  "docs/R25AQ_HIGH_LOSS_FAMILY_REVIEW.md",
  "docs/R25AQ_SAMPLER_VARIANT_SIMULATION.md",
  "docs/R25AQ_NEXT_STEP_DECISION.md",
  "docs/R25AQ_R25AR_REPAIRED_SAMPLER_DESIGN.md",
  "docs/R25AR_REPAIRED_SAMPLER_MICROCYCLE_RUN.md",
  "docs/R25AR_HELDOUT_AND_MIXED_REPAIR_EVAL.md",
  "docs/R25AR_REVIEW_AND_NEXT_BOUNDARY.md",
  "training/from_scratch/APPROVE_R25AO_EXPANDED_CHINESE_PERSONAL_MICROCYCLE.template.json",
  "training/from_scratch/APPROVE_R25AO_EXPANDED_CHINESE_PERSONAL_MICROCYCLE.json",
  "training/from_scratch/APPROVE_R25AP_ANALYZE_R25AO.template.json",
  "training/from_scratch/APPROVE_R25AQ_NEXT_REVIEWED_STEP.template.json",
  "training/from_scratch/APPROVE_R25AR_REPAIRED_SAMPLER_MICROCYCLE.template.json",
  "training/from_scratch/APPROVE_R25AR_REPAIRED_SAMPLER_MICROCYCLE.json",
  "training/from_scratch/APPROVE_R25AS_ANALYZE_R25AR.template.json",
  "training/from_scratch/small_decoder_pilot_run_config.r25ao.template.json",
  "training/from_scratch/small_decoder_pilot_run_config.r25ao.json",
  "training/from_scratch/small_decoder_pilot_run_config.r25ar.template.json",
  "training/from_scratch/small_decoder_pilot_run_config.r25ar.json",
  "scripts/eval_small_decoder_pilot_r25ao.mjs",
  "scripts/eval_r25ao_chinese_personal_breakdown.mjs",
  "scripts/eval_small_decoder_pilot_r25ar.mjs",
  "scripts/eval_r25ar_mixed_repair_breakdown.mjs",
  "scripts/analyze_r25ao_root_cause.mjs",
  "scripts/analyze_r25ao_mixed_en_weakness.mjs",
  "scripts/analyze_r25ao_high_loss_families.mjs",
  "scripts/simulate_r25aq_sampler_variants.mjs",
  "scripts/report_r25aq_next_step_decision.mjs",
  "scripts/eval_small_decoder_pilot_r25ac.mjs",
  "scripts/eval_r25ac_chinese_personal_breakdown.mjs",
  "scripts/check_r25ac_chinese_personal_microcycle_history.mjs",
  "package.json"
];

const removedName = [113, 119, 101, 110].map((code) => String.fromCharCode(code)).join("");
const NAMED_PRETRAINED_RE = new RegExp([
  removedName,
  `${removedName}2`,
  `${removedName}lm`,
  `${removedName}2_5`,
  `${removedName}2\\.5`,
  `${removedName}\\/${removedName}`,
  `${removedName}lm\\/${removedName}`
].join("|"), "i");
const ROOT_DOC_RE = /^(?!docs\/|training\/|scripts\/|static_llm\/|web\/|evals\/|knowledge_sources\/|identity_pack\/|artifacts\/)[^/]+\.(?:pdf|docx)$/i;
const BAD_SOURCE_RE = /(^|\/)data\/public_ingestion(\/|$)|(^|\/)public_ingestion(\/|$)/i;
const NEGATED_CONTEXT_RE = /no |not |must not|cannot|without|forbidden|blocked|rejected|reject|does not|do not|unapproved|approved:false|false|only as|baseline|compatibility|secondary|supportive/i;

async function readText(path) {
  return readFile(resolve(ROOT, path), "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

function collectSourceLikeValues(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceLikeValues(item, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, item] of Object.entries(value)) {
    if (/source|path|config|root/i.test(key) && typeof item === "string") out.push({ key, value: item });
    else collectSourceLikeValues(item, out);
  }
  return out;
}

async function activeApprovalMarkers() {
  const dir = resolve(ROOT, "training/from_scratch");
  const names = await readdir(dir);
  const markerNames = names.filter((name) => /^APPROVE_.*\.json$/.test(name) || /^APPROVE_.*\.template\.json$/.test(name));
  const active = [];
  const summaries = [];
  for (const name of markerNames) {
    const path = `training/from_scratch/${name}`;
    const marker = await readJson(path).catch(() => null);
    if (!marker) continue;
    const activeTraining = Boolean(
      marker.approved === true &&
      marker.consumed !== true &&
      (
        marker.allow_small_pilot_training === true ||
        marker.allow_chinese_personal_microcycle === true ||
        marker.allow_data_regularization_training === true ||
        marker.allow_architecture_ablation_training === true ||
        marker.allow_phase4_design === true ||
        marker.allow_phase_4_scaled_training === true ||
        marker.allow_product_model_training === true ||
        marker.allow_long_term_training === true
      )
    );
    const summary = {
      path,
      approved: marker.approved === true,
      consumed: marker.consumed === true,
      active_training_approval: activeTraining
    };
    summaries.push(summary);
    if (activeTraining) active.push(summary);
  }
  return { active, summaries };
}

function pushIf(failures, condition, code, detail = {}) {
  if (condition) failures.push({ code, ...detail });
}

async function main() {
  const failures = [];
  const textByPath = new Map();

  for (const path of [...REQUIRED_TEXT_FILES, ...REQUIRED_JSON_FILES]) {
    const text = await readText(path).catch((error) => {
      failures.push({ code: "required_file_missing_or_unreadable", path, detail: error.message });
      return null;
    });
    if (text != null) textByPath.set(path, text);
  }

  const projectDoc = textByPath.get("docs/R25AB_PROJECT_MEANING.md") || "";
  const chineseDoc = textByPath.get("docs/R25AB_CHINESE_FIRST_TRAINING_DOCTRINE.md") || "";
  const personalDoc = textByPath.get("docs/R25AB_PERSONAL_COLOR_BOUNDARY.md") || "";
  const cycleDoc = textByPath.get("docs/R25AB_HEALTHY_TRAINING_CYCLE.md") || "";

  pushIf(failures, !/Chinese-first/i.test(projectDoc), "project_meaning_missing_chinese_first");
  pushIf(failures, !/not trying to clone GPT/i.test(projectDoc), "project_meaning_missing_not_gpt_clone");
  pushIf(failures, !/do not mean project reset/i.test(projectDoc), "project_meaning_missing_not_reset_boundary");
  pushIf(failures, !/phase_4 scaled training/i.test(projectDoc) || !/does\s+not approve phase_4/i.test(projectDoc), "project_meaning_missing_phase4_block");

  pushIf(failures, !/at least 70%/i.test(chineseDoc), "chinese_doctrine_missing_zh_min");
  pushIf(failures, !/at most 10%/i.test(chineseDoc), "chinese_doctrine_missing_en_max");
  pushIf(failures, !/separately track `zh`, `mixed`, and `en`/i.test(chineseDoc), "chinese_doctrine_missing_eval_buckets");

  pushIf(failures, !/Raw private memory/i.test(personalDoc), "personal_boundary_missing_raw_private_memory_forbid");
  pushIf(failures, !/Root PDFs or DOCX/i.test(personalDoc), "personal_boundary_missing_root_doc_forbid");
  pushIf(failures, !/data\/public_ingestion/i.test(personalDoc), "personal_boundary_missing_public_ingestion_forbid");

  for (const stage of ["Design", "Reviewer approval", "One bounded run", "Replayable checkpoint", "Held-out eval", "R24/R25 gates", "Comparison to the best pilot", "Approval consumed", "Analysis", "Pause"]) {
    pushIf(failures, !cycleDoc.includes(stage), "healthy_cycle_stage_missing", { stage });
  }

  const boundary = await readJson("training/from_scratch/personal_color_boundary.r25ab.json").catch(() => null);
  const cycle = await readJson("training/from_scratch/healthy_training_cycle.r25ab.json").catch(() => null);
  const config = await readJson("training/from_scratch/small_decoder_r25ac_chinese_personal_config.json").catch(() => null);
  const runTemplate = await readJson("training/from_scratch/small_decoder_pilot_run_config.r25ac.template.json").catch(() => null);
  const approvalTemplate = await readJson("training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.template.json").catch(() => null);
  const runConfig = await readJson("training/from_scratch/small_decoder_pilot_run_config.r25ac.json").catch(() => null);
  const approvalMarker = await readJson("training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.json").catch(() => null);

  pushIf(failures, approvalTemplate?.approved !== false, "r25ac_template_must_be_approved_false");
  pushIf(failures, approvalTemplate?.allow_small_pilot_training !== false, "r25ac_template_small_pilot_flag_must_be_false");
  pushIf(failures, approvalTemplate?.allow_chinese_personal_microcycle !== false, "r25ac_template_microcycle_flag_must_be_false");
  pushIf(failures, approvalTemplate?.allow_phase_4_scaled_training !== false, "r25ac_template_phase4_flag_must_be_false");
  pushIf(failures, approvalTemplate?.allow_product_model_training !== false, "r25ac_template_product_flag_must_be_false");
  pushIf(failures, approvalTemplate?.allow_weight_commit !== false, "r25ac_template_weight_flag_must_be_false");

  pushIf(failures, Number(config?.language_mix_target?.zh_min) < 0.7, "r25ac_zh_min_below_0_7");
  pushIf(failures, Number(config?.language_mix_target?.en_max) > 0.1, "r25ac_en_max_above_0_1");
  pushIf(failures, config?.product_model !== false, "r25ac_product_model_must_be_false");
  pushIf(failures, config?.release_checkpoint !== false, "r25ac_release_checkpoint_must_be_false");
  pushIf(failures, config?.phase_4_scaled_training !== false, "r25ac_phase4_must_be_false");
  pushIf(failures, config?.commit_weights_allowed !== false, "r25ac_commit_weights_must_be_false");
  pushIf(failures, Number(config?.architecture?.layers) !== 1, "r25ac_must_not_use_two_layer_r25v_architecture");
  pushIf(failures, config?.basis_pilot !== "r25s_data_first_balanced_192", "r25ac_basis_pilot_must_remain_r25s");

  pushIf(failures, runConfig?.run_id !== "r25ac_chinese_personal_microcycle_256", "r25ac_run_config_run_id_mismatch");
  pushIf(failures, runConfig?.training_allowed_by_default !== false, "r25ac_run_config_training_default_must_be_false");
  pushIf(failures, runConfig?.approval_required !== true, "r25ac_run_config_must_require_approval");
  pushIf(failures, runConfig?.product_model !== false, "r25ac_run_config_product_model_must_be_false");
  pushIf(failures, runConfig?.release_checkpoint !== false, "r25ac_run_config_release_must_be_false");
  pushIf(failures, runConfig?.phase_4_scaled_training !== false, "r25ac_run_config_phase4_must_be_false");
  pushIf(failures, runConfig?.commit_weights_allowed !== false, "r25ac_run_config_commit_weights_must_be_false");
  pushIf(failures, Number(runConfig?.language_mix_target?.zh_min) < 0.7, "r25ac_run_config_zh_min_below_0_7");
  pushIf(failures, Number(runConfig?.language_mix_target?.en_max) > 0.1, "r25ac_run_config_en_max_above_0_1");
  pushIf(failures, Number(runConfig?.architecture?.layers) !== 1, "r25ac_run_config_must_keep_one_layer");

  if (approvalMarker) {
    pushIf(failures, approvalMarker.scope !== "chinese_personal_microcycle_only", "r25ac_approval_scope_mismatch");
    pushIf(failures, approvalMarker.phase !== "phase_3_small_decoder_pilot", "r25ac_approval_phase_mismatch");
    pushIf(failures, approvalMarker.run_id !== "r25ac_chinese_personal_microcycle_256", "r25ac_approval_run_id_mismatch");
    pushIf(failures, approvalMarker.consumed !== true, "r25ac_approval_must_be_consumed_after_attempt");
    pushIf(failures, approvalMarker.allow_additional_runs !== false, "r25ac_approval_must_not_allow_additional_runs");
    pushIf(failures, approvalMarker.allow_phase_4_scaled_training !== false, "r25ac_approval_phase4_must_be_false");
    pushIf(failures, approvalMarker.allow_product_model_training !== false, "r25ac_approval_product_must_be_false");
    pushIf(failures, approvalMarker.allow_weight_commit !== false, "r25ac_approval_weight_commit_must_be_false");
  }

  pushIf(failures, runTemplate?.training_allowed_by_default !== false, "r25ac_run_template_training_default_must_be_false");
  pushIf(failures, runTemplate?.approval_required !== true, "r25ac_run_template_must_require_approval");
  pushIf(failures, runTemplate?.product_model !== false, "r25ac_run_template_product_model_must_be_false");
  pushIf(failures, runTemplate?.phase_4_scaled_training !== false, "r25ac_run_template_phase4_must_be_false");

  pushIf(failures, boundary?.private_raw_data_allowed !== false, "private_raw_data_must_not_be_allowed");
  pushIf(failures, boundary?.chain_of_thought_allowed !== false, "chain_of_thought_must_not_be_allowed");
  pushIf(failures, boundary?.root_pdf_docx_active_source !== false, "root_pdf_docx_active_source_must_be_false");
  pushIf(failures, boundary?.data_public_ingestion_active_source !== false, "data_public_ingestion_active_source_must_be_false");
  pushIf(failures, cycle?.rules?.continuous_unbounded_training_allowed !== false, "unbounded_training_must_not_be_allowed");
  pushIf(failures, cycle?.rules?.repeated_run_from_same_approval_allowed !== false, "repeated_run_must_not_be_allowed");
  pushIf(failures, cycle?.phase_4_scaled_training_approved !== false, "healthy_cycle_phase4_must_be_false");

  for (const [label, json] of [["boundary", boundary], ["cycle", cycle], ["config", config], ["run_template", runTemplate], ["approval_template", approvalTemplate], ["run_config", runConfig], ["approval_marker", approvalMarker]]) {
    for (const source of collectSourceLikeValues(json)) {
      pushIf(failures, ROOT_DOC_RE.test(source.value), "root_pdf_docx_active_source_reference", { label, key: source.key, value: source.value });
      pushIf(failures, BAD_SOURCE_RE.test(source.value), "data_public_ingestion_active_source_reference", { label, key: source.key, value: source.value });
    }
  }

  for (const path of R25AB_SURFACE) {
    const text = await readText(path).catch(() => "");
    if (NAMED_PRETRAINED_RE.test(text)) failures.push({ code: "named_pretrained_model_string_present", path });
    if (/final_strategy"\s*:\s*"(?:lora|adapter|fine[-_ ]?tune)/i.test(text)) failures.push({ code: "lora_adapter_finetune_final_strategy_present", path });
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const block = [lines[index - 1] || "", line, lines[index + 1] || ""].join(" ");
      if (/(?:Vercel Blob|KV|Postgres|Redis|AI Gateway|huggingface\.co|openai\.com|api\/|functions\/|edge function).{0,80}(?:required|allowed|main path|final target|product target)/i.test(block) && !NEGATED_CONTEXT_RE.test(block)) {
        failures.push({ code: "backend_storage_or_api_path_introduced", path, line: index + 1 });
      }
      if (/(?:chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data).{0,80}(?:allowed|true|training source)/i.test(block) && !NEGATED_CONTEXT_RE.test(block)) {
        failures.push({ code: "private_or_cot_training_source_allowed", path, line: index + 1 });
      }
    }
  }

  const approvals = await activeApprovalMarkers();
  if (approvals.active.length !== 0) failures.push({ code: "active_training_approval_count_must_be_zero", active: approvals.active });

  const report = {
    ok: failures.length === 0,
    r25ab_project_meaning_status: failures.some((failure) => failure.code.startsWith("project_meaning")) ? "needs_review" : "present",
    chinese_first_training_direction_status: failures.some((failure) => failure.code.startsWith("chinese_doctrine") || failure.code.startsWith("r25ac_zh") || failure.code.startsWith("r25ac_en")) ? "needs_review" : "present",
    personal_color_boundary_status: failures.some((failure) => failure.code.startsWith("personal_boundary") || failure.code.includes("private") || failure.code.includes("chain_of_thought")) ? "needs_review" : "present",
    healthy_training_cycle_status: failures.some((failure) => failure.code.startsWith("healthy_cycle") || failure.code.includes("unbounded") || failure.code.includes("repeated_run")) ? "needs_review" : "present",
    r25ac_design_status: failures.some((failure) => failure.code.startsWith("r25ac")) ? "needs_review" : approvalMarker?.consumed === true ? "bounded_microcycle_history_ready" : "designed_requires_fresh_approval",
    active_training_approval_count: approvals.active.length,
    phase_4_scaled_training_approved: false,
    product_model: false,
    release_checkpoint: false,
    training_ran_in_r25ab: false,
    r25ac_training_status: approvalMarker?.consumed === true ? "approval_consumed_after_one_bounded_attempt" : "not_run_or_not_consumed",
    failures
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
