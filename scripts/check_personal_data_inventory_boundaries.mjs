#!/usr/bin/env node
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const execFile = promisify(execFileCb);
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const INVENTORY_PATH = "artifacts/training_os/personal_inventory/r25ae/personal_data_inventory.json";
const PROFILE_PATH = "artifacts/training_os/personal_inventory/r25ae/personal_corpus_signal_profile.json";
const LEGACY_PATH = "artifacts/training_os/personal_inventory/r25ae/legacy_disk_scan_footprint_audit.json";
const BOUNDARY_REPORT_PATH = "artifacts/training_os/personal_inventory/r25ae/personal_data_inventory_boundary_check.json";

const REQUIRED_TRACKED_DOCS = [
  "docs/R25AE_PERSONAL_DATA_INVENTORY.md",
  "docs/R25AE_PERSONAL_DATA_INVENTORY_POLICY.md",
  "docs/R25AE_PERSONAL_DATA_INVENTORY_SUMMARY.md",
  "docs/R25AE_PERSONAL_CORPUS_SIGNAL_SUMMARY.md",
  "docs/R25AE_LEGACY_DISK_SCAN_AUDIT.md"
];

const R25AE_SURFACE = [
  ...REQUIRED_TRACKED_DOCS,
  "training/from_scratch/personal_data_inventory_policy.r25ae.json",
  "scripts/audit_personal_data_inventory.mjs",
  "scripts/profile_personal_corpus_signals.mjs",
  "scripts/audit_legacy_disk_scan_footprints.mjs",
  "scripts/check_personal_data_inventory_boundaries.mjs",
  "scripts/report_from_scratch_training_progress.mjs",
  "package.json"
];

function assertRepoPath(repoPath) {
  const abs = resolve(ROOT, repoPath);
  if (!(abs === ROOT || abs.startsWith(`${ROOT}${sep}`))) throw new Error(`Refusing path outside repo: ${repoPath}`);
  return abs;
}

async function readText(path) {
  return readFile(assertRepoPath(path), "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function runGit(args) {
  const { stdout } = await execFile("git", args, { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

function failIf(failures, condition, code, detail = {}) {
  if (condition) failures.push({ code, ...detail });
}

async function activeApprovalMarkers() {
  const names = await readdir(assertRepoPath("training/from_scratch"));
  const markerNames = names.filter((name) => /^APPROVE_.*\.json$/.test(name) || /^APPROVE_.*\.template\.json$/.test(name));
  const activeTraining = [];
  const activePhase4 = [];
  for (const name of markerNames) {
    const path = `training/from_scratch/${name}`;
    const marker = await readJson(path).catch(() => null);
    if (!marker) continue;
    const active = marker.approved === true && marker.consumed !== true;
    const allowsTraining = Boolean(
      marker.allow_training === true ||
      marker.allow_corpus_generation === true ||
      marker.allow_small_pilot_training === true ||
      marker.allow_chinese_personal_microcycle === true ||
      marker.allow_data_regularization_training === true ||
      marker.allow_architecture_ablation_training === true ||
      marker.allow_phase4_design === true ||
      marker.allow_phase_4_scaled_training === true ||
      marker.allow_product_model_training === true ||
      marker.allow_long_term_training === true
    );
    if (active && allowsTraining) activeTraining.push(path);
    if (active && marker.allow_phase_4_scaled_training === true) activePhase4.push(path);
  }
  return { activeTraining, activePhase4 };
}

async function main() {
  const failures = [];
  const inventory = await readJson(INVENTORY_PATH).catch((error) => {
    failures.push({ code: "inventory_report_missing_or_invalid", path: INVENTORY_PATH, detail: error.message });
    return null;
  });
  const profile = await readJson(PROFILE_PATH).catch((error) => {
    failures.push({ code: "corpus_signal_profile_missing_or_invalid", path: PROFILE_PATH, detail: error.message });
    return null;
  });
  const legacy = await readJson(LEGACY_PATH).catch((error) => {
    failures.push({ code: "legacy_disk_scan_audit_missing_or_invalid", path: LEGACY_PATH, detail: error.message });
    return null;
  });

  for (const path of REQUIRED_TRACKED_DOCS) {
    await readText(path).catch((error) => failures.push({ code: "required_safe_doc_missing", path, detail: error.message }));
  }

  failIf(failures, inventory?.root_pdf_docx_content_parsed !== false, "root_pdf_docx_must_be_metadata_only");
  failIf(failures, inventory?.data_public_ingestion_content_parsed !== false, "data_public_ingestion_must_be_metadata_only");
  failIf(failures, legacy?.root_pdf_docx_content_parsed !== false, "legacy_root_docs_must_be_metadata_only");
  failIf(failures, legacy?.data_public_ingestion_content_parsed !== false, "legacy_public_ingestion_must_be_metadata_only");
  failIf(failures, inventory?.scan_outside_repo !== false || legacy?.scan_outside_repo !== false, "scan_outside_repo_must_be_false");
  failIf(failures, inventory?.training_ran !== false || profile?.training_ran !== false || legacy?.training_ran !== false, "training_must_not_run");
  failIf(failures, inventory?.corpus_generated !== false || profile?.corpus_generated !== false || legacy?.corpus_generated !== false, "corpus_generation_must_not_run");
  failIf(failures, inventory?.phase_4_scaled_training_approved !== false, "phase4_must_not_be_approved");
  failIf(failures, inventory?.private_raw_data_ingested !== false, "private_raw_data_must_not_be_ingested");

  const staged = (await runGit(["diff", "--cached", "--name-only"])).split(/\r?\n/).filter(Boolean);
  for (const path of staged) {
    failIf(failures, path.startsWith("artifacts/training_os/personal_inventory/"), "generated_inventory_artifact_staged", { path });
    failIf(failures, /(^|\/).*\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i.test(path), "weight_or_checkpoint_staged", { path });
    failIf(failures, /^data\/public_ingestion(\/|$)/.test(path), "data_public_ingestion_staged", { path });
    failIf(failures, /^[^/]+\.(pdf|docx|doc)$/i.test(path), "root_document_staged", { path });
  }

  const combinedSurface = [];
  for (const path of R25AE_SURFACE) {
    const text = await readText(path).catch(() => "");
    combinedSurface.push({ path, text });
  }

  for (const { path, text } of combinedSurface) {
    const selfGuard = path === "scripts/check_personal_data_inventory_boundaries.mjs";
    failIf(failures, !selfGuard && /\bfind\s+(?:\/Users|~)\b/i.test(text), "whole_disk_find_command_added", { path });
    failIf(failures, !selfGuard && /\bmdfind\b|Spotlight/i.test(text), "spotlight_scan_command_added", { path });
    failIf(failures, !selfGuard && /https?:\/\/|fetch\s*\(|openai\.com|huggingface\.co|api\.openai/i.test(text), "external_api_or_download_reference_added", { path });
    failIf(failures, !selfGuard && /allow_(?:backend|api|external_storage)"?\s*:\s*true/i.test(text), "backend_storage_or_api_allowed", { path });
    failIf(failures, !selfGuard && /final_strategy"\s*:\s*"(?:lora|adapter|fine[-_ ]?tune)/i.test(text), "lora_adapter_finetune_final_strategy_present", { path });
    failIf(failures, !selfGuard && /(?:pretrained|pre-trained|foundation model|external model).{0,80}(?:product target|final strategy|selected)/i.test(text), "named_pretrained_or_external_model_selected", { path });
  }

  for (const path of REQUIRED_TRACKED_DOCS) {
    const text = await readText(path).catch(() => "");
    failIf(failures, /\/Users\/(?!jarlgiovanni\/Desktop\/another_brain\b)/.test(text), "local_private_path_in_tracked_doc", { path });
    failIf(failures, /(?:api[_-]?key|password|secret|token)\s*[:=]\s*["'][^"']{8,}["']/i.test(text), "secret_like_string_in_tracked_doc", { path });
    failIf(failures, /chain[_-]?of[_-]?thought\s*[:=]\s*true/i.test(text), "chain_of_thought_field_enabled", { path });
    failIf(failures, /hidden[_-]?prompt\s*[:=]\s*["'][^"']+["']/i.test(text), "hidden_prompt_field_present", { path });
  }

  const approvals = await activeApprovalMarkers();
  failIf(failures, approvals.activeTraining.length !== 0, "active_training_approval_present", { active: approvals.activeTraining });
  failIf(failures, approvals.activePhase4.length !== 0, "active_phase4_training_approval_present", { active: approvals.activePhase4 });

  const report = {
    ok: failures.length === 0,
    report_id: "r25ae_personal_data_inventory_boundary_check",
    generated_at: new Date().toISOString(),
    inventory_report_exists: Boolean(inventory),
    corpus_signal_profile_exists: Boolean(profile),
    legacy_disk_scan_audit_exists: Boolean(legacy),
    root_pdf_docx_metadata_only: inventory?.root_pdf_docx_content_parsed === false && legacy?.root_pdf_docx_content_parsed === false,
    data_public_ingestion_metadata_only: inventory?.data_public_ingestion_content_parsed === false && legacy?.data_public_ingestion_content_parsed === false,
    no_whole_disk_scan_command_added: !failures.some((failure) => failure.code === "whole_disk_find_command_added" || failure.code === "spotlight_scan_command_added"),
    no_external_api_use: !failures.some((failure) => failure.code === "external_api_or_download_reference_added"),
    no_generated_inventory_artifacts_staged: !failures.some((failure) => failure.code === "generated_inventory_artifact_staged"),
    active_training_approval_count: approvals.activeTraining.length,
    active_phase4_training_approval_count: approvals.activePhase4.length,
    phase_4_scaled_training_approved: false,
    training_ran: false,
    corpus_generated: false,
    failures
  };

  await mkdir(dirname(assertRepoPath(BOUNDARY_REPORT_PATH)), { recursive: true });
  await writeFile(assertRepoPath(BOUNDARY_REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
