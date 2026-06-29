#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { auditStaticLlmBackendFormat } from "./audit_static_llm_backend_format.mjs";
import { checkStaticLlmAdmissionApproval } from "./check_static_llm_admission_approval.mjs";
import { discoverStaticLlmArtifacts } from "./discover_static_llm_artifacts.mjs";
import { STATIC_LLM_POLICY, profileBudgetBytes } from "./static_llm_policy.mjs";
import {
  buildStaticManifestFromInspection,
  inspectArtifactDirectory,
  safeModelSlug,
  validateArtifactMetadata,
  writeJson
} from "./static_llm_artifact_utils.mjs";
import {
  ROOT,
  validateStaticLlmManifestObject
} from "./static_llm_manifest_utils.mjs";

function parseArgs(argv) {
  const args = { candidate: "", writeReport: false, profile: "pro_static_llm_full" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--candidate") args.candidate = argv[++index];
    else if (arg === "--write-report") args.writeReport = true;
    else if (arg === "--profile") args.profile = argv[++index];
  }
  return args;
}

function planFromInspection(inspection) {
  const plannedFiles = [];
  for (const file of inspection.files || []) {
    if (file.bytes <= STATIC_LLM_POLICY.maxShardFileBytes) {
      plannedFiles.push({ source_path: file.path, planned_path: file.relative_path, bytes: file.bytes, role: file.role });
      continue;
    }
    const parts = Math.ceil(file.bytes / STATIC_LLM_POLICY.targetShardFileBytes);
    for (let index = 0; index < parts; index += 1) {
      plannedFiles.push({
        source_path: file.path,
        planned_part: index + 1,
        planned_bytes_max: STATIC_LLM_POLICY.targetShardFileBytes,
        role: file.role
      });
    }
  }
  const totalBytes = inspection.total_bytes || 0;
  const maxFileBytes = inspection.max_file_bytes || 0;
  return {
    ok: totalBytes <= profileBudgetBytes("pro_static_llm_full") && maxFileBytes <= STATIC_LLM_POLICY.maxShardFileBytes,
    total_bytes: totalBytes,
    max_file_bytes: maxFileBytes,
    shard_count: plannedFiles.length,
    copy_required: (inspection.files || []).some((file) => file.bytes > STATIC_LLM_POLICY.maxShardFileBytes),
    planned_files: plannedFiles,
    profile_fit: inspection.profile_fit || {}
  };
}

async function candidateReport(candidate, options, approvalReport) {
  const inspection = await inspectArtifactDirectory(candidate.dir, { production: false });
  const metadataValidation = validateArtifactMetadata(inspection.metadata || {}, { production: false });
  const shardPlan = planFromInspection(inspection);
  const manifest = buildStaticManifestFromInspection(inspection, {
    profile: options.profile,
    admitProduction: false
  });
  const manifestValidation = await validateStaticLlmManifestObject(manifest, { root: ROOT });
  const admittedManifestValidation = await validateStaticLlmManifestObject(manifest, { root: ROOT, admit: true });
  const backendFormat = await auditStaticLlmBackendFormat({ dir: candidate.dir });
  const approval = approvalReport.candidates.find((item) => item.dir === candidate.dir) || null;
  const productionAdmissionPossible = Boolean(
    inspection.ok &&
      metadataValidation.ok &&
      shardPlan.ok &&
      manifestValidation.ok &&
      approval?.may_commit_assets &&
      backendFormat.backend_supported_now
  );
  const realFirstToken = productionAdmissionPossible
    ? { attempted: false, skipped: true, reason: "real_backend_binding_not_invoked_by_admission_runner" }
    : { attempted: false, skipped: true, reason: backendFormat.first_token_possible_now ? "production_manifest_not_admitted" : "backend_format_not_supported_now" };
  const failures = [];
  if (!inspection.ok) failures.push(...inspection.failures);
  if (!metadataValidation.ok) failures.push(...metadataValidation.failures);
  if (!shardPlan.ok) failures.push({ code: "shard_or_profile_plan_rejected" });
  if (!manifestValidation.ok) failures.push(...manifestValidation.failures);
  if (admittedManifestValidation.ok) failures.push({ code: "candidate_manifest_unexpectedly_admitted" });

  return {
    ok: failures.length === 0,
    blocked: !productionAdmissionPossible,
    blocked_reason: productionAdmissionPossible ? "" : "candidate_not_admitted_for_production",
    candidate_id: candidate.candidate_id,
    dir: candidate.dir,
    inspection,
    metadata_validation: metadataValidation,
    shard_plan: shardPlan,
    dry_run_manifest: manifest,
    manifest_validation: manifestValidation,
    admitted_manifest_validation: admittedManifestValidation,
    approval,
    backend_format: backendFormat,
    production_admission_possible: productionAdmissionPossible,
    real_first_token: realFirstToken,
    failures
  };
}

export async function runStaticLlmArtifactAdmission(options = {}) {
  const discovery = await discoverStaticLlmArtifacts();
  const approval = await checkStaticLlmAdmissionApproval();
  const selected = options.candidate
    ? discovery.candidates.filter((candidate) => candidate.candidate_id === options.candidate || candidate.dir.endsWith(`/${options.candidate}`))
    : discovery.candidates;

  if (!selected.length) {
    const report = {
      ok: true,
      blocked: true,
      blocked_reason: discovery.blocked_reason || "candidate_not_found",
      discovery,
      approval,
      candidates: [],
      admitted_model_count: 0,
      real_first_token_attempted: false
    };
    if (options.writeReport) await writeJson(resolve(ROOT, "artifacts/static_llm/r25e_admission_report.json"), report);
    return report;
  }

  const reports = [];
  for (const candidate of selected) {
    const report = await candidateReport(candidate, options, approval);
    reports.push(report);
    if (options.writeReport) {
      const slug = safeModelSlug(candidate.candidate_id);
      await writeJson(resolve(ROOT, `artifacts/static_llm/r25e_candidate_${slug}_report.json`), report);
    }
  }

  const failures = reports.flatMap((report) => report.failures.map((failure) => ({ candidate_id: report.candidate_id, ...failure })));
  const summary = {
    ok: failures.length === 0,
    blocked: reports.every((report) => report.blocked),
    blocked_reason: reports.every((report) => report.blocked) ? "no_candidate_admitted_for_production" : "",
    discovery,
    approval,
    candidates: reports,
    admitted_model_count: reports.filter((report) => report.production_admission_possible).length,
    real_first_token_attempted: false,
    failures
  };
  if (options.writeReport) await writeJson(resolve(ROOT, "artifacts/static_llm/r25e_admission_report.json"), summary);
  return summary;
}

async function main() {
  const report = await runStaticLlmArtifactAdmission(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
