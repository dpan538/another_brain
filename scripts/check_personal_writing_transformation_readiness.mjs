#!/usr/bin/env node
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const execFile = promisify(execFileCb);
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const AUDIT_PATH = "artifacts/training_os/personal_writing_intake/r25af/personal_writing_inbox_audit.json";
const REPORT_PATH = "artifacts/training_os/personal_writing_intake/r25af/personal_writing_transformation_readiness.json";

const REQUIRED_DOCS = [
  "docs/R25AF_PERSONAL_WRITING_INTAKE_POLICY.md",
  "docs/R25AF_WRITING_TO_DIALOGUE_TRANSFORMATION.md",
  "docs/R25AF_R25AG_CORPUS_EXPANSION_PATH.md"
];

const REQUIRED_JSON = [
  "training/from_scratch/personal_writing_intake_policy.r25af.json",
  "training/from_scratch/personal_writing_source.schema.json",
  "training/from_scratch/personal_writing_source_manifest.template.json",
  "training/from_scratch/personal_writing_transformation.schema.json",
  "training/from_scratch/chinese_personal_corpus_expansion_plan.r25ag.json",
  "training/from_scratch/APPROVE_R25AG_DERIVED_CORPUS_EXPANSION.template.json"
];

const R25AF_SURFACE = [
  ".gitignore",
  "README.md",
  "DATA_CARD.md",
  "docs/R25AB_PROJECT_MEANING.md",
  "docs/R25AB_PERSONAL_COLOR_BOUNDARY.md",
  "docs/R25AD_CHINESE_PERSONAL_CORPUS_GAP.md",
  "docs/R25AE_PERSONAL_DATA_INVENTORY.md",
  ...REQUIRED_DOCS,
  ...REQUIRED_JSON,
  "scripts/audit_personal_writing_inbox.mjs",
  "scripts/check_personal_writing_transformation_readiness.mjs",
  "scripts/report_from_scratch_training_progress.mjs",
  "package.json"
];

function assertRepoPath(repoPath) {
  const abs = resolve(ROOT, repoPath);
  if (!(abs === ROOT || abs.startsWith(`${ROOT}${sep}`))) {
    throw new Error(`Refusing path outside repo: ${repoPath}`);
  }
  return abs;
}

async function readText(path) {
  return readFile(assertRepoPath(path), "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function runGit(args, options = {}) {
  const result = await execFile("git", args, {
    cwd: ROOT,
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024
  }).catch((error) => error);
  if (result instanceof Error) {
    if (options.allowFailure) return result;
    throw result;
  }
  return result;
}

function failIf(failures, condition, code, detail = {}) {
  if (condition) failures.push({ code, ...detail });
}

async function activeApprovalMarkers() {
  const names = await readdir(assertRepoPath("training/from_scratch"));
  const markerNames = names.filter((name) => /^APPROVE_.*\.json$/.test(name) || /^APPROVE_.*\.template\.json$/.test(name));
  const activeTraining = [];
  const activeCorpusOrParsing = [];
  const activePhase4 = [];
  for (const name of markerNames) {
    const path = `training/from_scratch/${name}`;
    const marker = await readJson(path).catch(() => null);
    if (!marker) continue;
    const active = marker.approved === true && marker.consumed !== true;
    const allowsTraining = Boolean(
      marker.allow_training === true ||
      marker.allow_small_pilot_training === true ||
      marker.allow_chinese_personal_microcycle === true ||
      marker.allow_data_regularization_training === true ||
      marker.allow_architecture_ablation_training === true ||
      marker.allow_phase_4_scaled_training === true ||
      marker.allow_product_model_training === true ||
      marker.allow_long_term_training === true
    );
    const allowsCorpusOrParsing = Boolean(marker.allow_corpus_generation === true || marker.allow_source_parsing === true);
    if (active && allowsTraining) activeTraining.push(path);
    if (active && allowsCorpusOrParsing) activeCorpusOrParsing.push(path);
    if (active && marker.allow_phase_4_scaled_training === true) activePhase4.push(path);
  }
  return { activeTraining, activeCorpusOrParsing, activePhase4 };
}

async function pathIgnored(probePath) {
  const result = await runGit(["check-ignore", "-q", probePath], { allowFailure: true });
  return !(result instanceof Error);
}

async function main() {
  const failures = [];

  const audit = await readJson(AUDIT_PATH).catch((error) => {
    failures.push({ code: "personal_writing_inbox_audit_missing_or_invalid", path: AUDIT_PATH, detail: error.message });
    return null;
  });

  const policy = await readJson("training/from_scratch/personal_writing_intake_policy.r25af.json").catch((error) => {
    failures.push({ code: "intake_policy_missing_or_invalid", detail: error.message });
    return null;
  });
  const sourceSchema = await readJson("training/from_scratch/personal_writing_source.schema.json").catch((error) => {
    failures.push({ code: "source_schema_missing_or_invalid", detail: error.message });
    return null;
  });
  const transformationSchema = await readJson("training/from_scratch/personal_writing_transformation.schema.json").catch((error) => {
    failures.push({ code: "transformation_schema_missing_or_invalid", detail: error.message });
    return null;
  });
  const r25agPlan = await readJson("training/from_scratch/chinese_personal_corpus_expansion_plan.r25ag.json").catch((error) => {
    failures.push({ code: "r25ag_plan_missing_or_invalid", detail: error.message });
    return null;
  });
  const r25agApproval = await readJson("training/from_scratch/APPROVE_R25AG_DERIVED_CORPUS_EXPANSION.template.json").catch((error) => {
    failures.push({ code: "r25ag_approval_template_missing_or_invalid", detail: error.message });
    return null;
  });

  for (const path of [...REQUIRED_DOCS, ...REQUIRED_JSON]) {
    await readText(path).catch((error) => failures.push({ code: "required_r25af_file_missing", path, detail: error.message }));
  }

  const ignoreText = await readText(".gitignore").catch(() => "");
  failIf(failures, !ignoreText.includes("private_sources/"), "private_sources_not_ignored");
  failIf(failures, !ignoreText.includes("artifacts/training_os/personal_writing_intake/"), "personal_writing_intake_artifacts_not_ignored");
  failIf(failures, !ignoreText.includes("artifacts/training_os/corpus_expansion/"), "corpus_expansion_artifacts_not_ignored");
  failIf(failures, !(await pathIgnored("private_sources/r25af_user_writing_inbox/poetry/probe.txt")), "private_sources_probe_not_git_ignored");

  failIf(failures, policy?.status !== "design_only_no_training_no_corpus_generation", "intake_policy_status_invalid");
  failIf(failures, policy?.repo_root_only !== true, "intake_policy_must_be_repo_root_only");
  failIf(failures, policy?.training_allowed !== false, "intake_policy_training_must_be_false");
  failIf(failures, policy?.corpus_generation_allowed !== false, "intake_policy_corpus_generation_must_be_false");
  failIf(failures, policy?.source_parsing_allowed_by_default !== false, "intake_policy_source_parsing_default_must_be_false");
  failIf(failures, policy?.commit_raw_source_allowed !== false, "intake_policy_raw_commit_must_be_false");
  failIf(failures, policy?.external_llm_conversion_allowed !== false, "intake_policy_external_llm_must_be_false");

  failIf(failures, sourceSchema?.properties?.parse_approved?.default !== false, "source_schema_parse_approved_must_default_false");
  failIf(failures, sourceSchema?.properties?.commit_raw_source_allowed?.default !== false, "source_schema_raw_commit_must_default_false");
  failIf(failures, !sourceSchema?.properties?.permission?.enum?.includes("approved_for_public_repo"), "source_schema_public_permission_missing");
  failIf(failures, !transformationSchema?.properties?.transformation_type?.enum?.includes("Chinese_explanation"), "transformation_schema_missing_chinese_explanation");
  failIf(failures, transformationSchema?.properties?.contains_private_data?.const !== false, "transformation_schema_private_data_must_be_false");

  failIf(failures, r25agPlan?.status !== "future_design_only_not_approved", "r25ag_plan_status_invalid");
  failIf(failures, r25agPlan?.r25af_training_allowed !== false, "r25ag_plan_r25af_training_must_be_false");
  failIf(failures, r25agPlan?.r25af_corpus_generation_allowed !== false, "r25ag_plan_r25af_generation_must_be_false");
  failIf(failures, Number(r25agPlan?.target_language_mix?.zh_min) < 0.7, "r25ag_zh_min_below_target");
  failIf(failures, Number(r25agPlan?.target_language_mix?.en_max) > 0.1, "r25ag_en_max_above_target");
  failIf(failures, r25agPlan?.phase_4_scaled_training_approved !== false, "r25ag_phase4_must_be_false");
  failIf(failures, r25agPlan?.r25ag_not_approved_in_r25af !== true, "r25ag_must_not_be_approved_in_r25af");

  failIf(failures, r25agApproval?.approved !== false, "r25ag_template_approved_must_be_false");
  for (const key of [
    "allow_source_parsing",
    "allow_corpus_generation",
    "allow_training",
    "allow_external_llm_generation",
    "allow_private_raw_commit",
    "allow_phase_4_scaled_training",
    "allow_weight_commit"
  ]) {
    failIf(failures, r25agApproval?.[key] !== false, "r25ag_template_flag_must_be_false", { key, value: r25agApproval?.[key] });
  }

  failIf(failures, audit?.repo_root_only !== true, "audit_must_be_repo_root_only");
  failIf(failures, audit?.scan_outside_repo !== false, "audit_must_not_scan_outside_repo");
  failIf(failures, audit?.raw_file_content_parsed !== false, "audit_must_not_parse_raw_file_content");
  failIf(failures, audit?.training_ran !== false, "audit_must_not_train");
  failIf(failures, audit?.corpus_generated !== false, "audit_must_not_generate_corpus");
  failIf(failures, audit?.root_pdf_docx_content_parsed !== false, "audit_must_not_parse_root_docs");
  failIf(failures, audit?.data_public_ingestion_content_parsed !== false, "audit_must_not_parse_public_ingestion");
  failIf(failures, audit?.external_api_used !== false, "audit_must_not_use_external_api");

  const staged = (await runGit(["diff", "--cached", "--name-only"])).stdout.split(/\r?\n/).filter(Boolean);
  const trackedPrivate = (await runGit(["ls-files", "private_sources"])).stdout.split(/\r?\n/).filter(Boolean);
  const unstagedChanged = (await runGit(["diff", "--name-only"])).stdout.split(/\r?\n/).filter(Boolean);

  for (const path of [...staged, ...unstagedChanged]) {
    failIf(failures, path.startsWith("training/llm_corpus/"), "training_corpus_row_file_changed", { path });
    failIf(failures, path.startsWith("private_sources/"), "raw_private_source_file_changed_or_staged", { path });
    failIf(failures, path.startsWith("artifacts/training_os/personal_writing_intake/"), "personal_writing_artifact_changed_or_staged", { path });
    failIf(failures, path.startsWith("artifacts/training_os/corpus_expansion/"), "corpus_expansion_artifact_changed_or_staged", { path });
    failIf(failures, /^[^/]+\.(pdf|docx|doc)$/i.test(path), "root_document_changed_or_staged", { path });
    failIf(failures, path.startsWith("data/public_ingestion/"), "public_ingestion_changed_or_staged", { path });
  }
  failIf(failures, trackedPrivate.length !== 0, "private_sources_tracked", { paths: trackedPrivate });

  for (const path of R25AF_SURFACE) {
    const text = await readText(path).catch(() => "");
    const selfGuard = path === "scripts/check_personal_writing_transformation_readiness.mjs";
    failIf(failures, !selfGuard && /\bfind\s+(?:\/Users|~)\b/i.test(text), "whole_disk_find_command_added", { path });
    failIf(failures, !selfGuard && /\bmdfind\b|Spotlight/i.test(text), "spotlight_scan_command_added", { path });
    failIf(failures, !selfGuard && /fetch\s*\(|openai\.com|huggingface\.co|api\.openai/i.test(text), "external_api_or_download_reference_added", { path });
    failIf(failures, !selfGuard && /chain[_-]?of[_-]?thought_allowed"?\s*:\s*true/i.test(text), "chain_of_thought_allowed", { path });
    failIf(failures, !selfGuard && /private_raw_data_allowed(?:_in_training)?"?\s*:\s*true/i.test(text), "private_raw_data_allowed", { path });
    failIf(failures, !selfGuard && /allow_(?:backend|api|external_storage)"?\s*:\s*true/i.test(text), "backend_storage_or_api_allowed", { path });
    failIf(failures, !selfGuard && /final_strategy"\s*:\s*"(?:lora|adapter|fine[-_ ]?tune)/i.test(text), "lora_adapter_finetune_final_strategy_present", { path });
  }

  const approvals = await activeApprovalMarkers();
  failIf(failures, approvals.activeTraining.length !== 0, "active_training_approval_present", { active: approvals.activeTraining });
  failIf(failures, approvals.activeCorpusOrParsing.length !== 0, "active_corpus_or_source_parsing_approval_present", { active: approvals.activeCorpusOrParsing });
  failIf(failures, approvals.activePhase4.length !== 0, "active_phase4_training_approval_present", { active: approvals.activePhase4 });

  const report = {
    ok: failures.length === 0,
    report_id: "r25af_personal_writing_transformation_readiness",
    generated_at: new Date().toISOString(),
    intake_policy_exists: Boolean(policy),
    source_manifest_schema_exists: Boolean(sourceSchema),
    transformation_taxonomy_exists: await readText("docs/R25AF_WRITING_TO_DIALOGUE_TRANSFORMATION.md").then(() => true).catch(() => false),
    transformation_schema_exists: Boolean(transformationSchema),
    r25ag_design_exists: Boolean(r25agPlan),
    r25ag_approval_template_inert: Boolean(
      r25agApproval?.approved === false &&
      r25agApproval?.allow_source_parsing === false &&
      r25agApproval?.allow_corpus_generation === false &&
      r25agApproval?.allow_training === false
    ),
    private_sources_ignored: failures.every((failure) => failure.code !== "private_sources_not_ignored" && failure.code !== "private_sources_probe_not_git_ignored"),
    raw_source_file_staged: failures.some((failure) => failure.code === "raw_private_source_file_changed_or_staged"),
    raw_source_content_tracked: trackedPrivate.length > 0,
    raw_file_content_parsed: audit?.raw_file_content_parsed === true,
    training_ran: false,
    corpus_generated: false,
    external_api_used: false,
    active_training_approval_count: approvals.activeTraining.length,
    active_corpus_or_source_parsing_approval_count: approvals.activeCorpusOrParsing.length,
    active_phase4_training_approval_count: approvals.activePhase4.length,
    phase_4_scaled_training_approved: false,
    failures
  };

  await mkdir(dirname(assertRepoPath(REPORT_PATH)), { recursive: true });
  await writeFile(assertRepoPath(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
