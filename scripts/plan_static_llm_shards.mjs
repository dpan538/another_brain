#!/usr/bin/env node
import { STATIC_LLM_POLICY, profileBudgetBytes } from "./static_llm_policy.mjs";
import { inspectArtifactDirectory } from "./static_llm_artifact_utils.mjs";

function parseArgs(argv) {
  const args = { dir: "", writeStaging: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dir") args.dir = argv[++index];
    else if (arg === "--write-staging") args.writeStaging = true;
  }
  return args;
}

function plannedShardParts(file) {
  if (file.bytes <= STATIC_LLM_POLICY.maxShardFileBytes) return [file];
  const parts = Math.ceil(file.bytes / STATIC_LLM_POLICY.targetShardFileBytes);
  return Array.from({ length: parts }, (_, index) => ({
    source_path: file.path,
    planned_part: index + 1,
    planned_bytes_max: STATIC_LLM_POLICY.targetShardFileBytes,
    role: file.role
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) {
    console.error("Usage: npm run plan:static-llm-shards -- --dir static_llm/inbox/<candidate>");
    process.exit(2);
  }
  const inspection = await inspectArtifactDirectory(args.dir);
  const plannedFiles = inspection.files.flatMap(plannedShardParts);
  const maxFileBytes = inspection.max_file_bytes || 0;
  const totalBytes = inspection.total_bytes || 0;
  const profileFit = Object.fromEntries(
    Object.keys(STATIC_LLM_POLICY.profiles).map((profile) => [profile, {
      fits: totalBytes <= profileBudgetBytes(profile) && maxFileBytes <= STATIC_LLM_POLICY.maxShardFileBytes,
      max_total_bytes: profileBudgetBytes(profile),
      total_bytes: totalBytes,
      max_file_bytes: maxFileBytes
    }])
  );
  const risks = [];
  if (!inspection.ok) risks.push(...inspection.failures.map((failure) => failure.code));
  if (maxFileBytes > STATIC_LLM_POLICY.maxShardFileBytes) risks.push("source_contains_file_larger_than_hard_static_shard_max");
  if (totalBytes > profileBudgetBytes("pro_static_llm_full")) risks.push("artifact_exceeds_pro_static_profile");
  if (!profileFit.hobby_static_llm_lite.fits) risks.push("hobby_profile_rejects_candidate");

  const report = {
    ok: inspection.ok && totalBytes <= profileBudgetBytes("pro_static_llm_full"),
    profile_fit: profileFit,
    total_bytes: totalBytes,
    planned_files: plannedFiles,
    max_file_bytes: maxFileBytes,
    shard_count: plannedFiles.length,
    copy_required: inspection.files.some((file) => file.bytes > STATIC_LLM_POLICY.maxShardFileBytes),
    write_staging_requested: args.writeStaging,
    write_staging_performed: false,
    risks
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
