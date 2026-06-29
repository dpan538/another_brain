#!/usr/bin/env node
import {
  ROOT,
  discoverStaticLlmManifestPaths,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import { STATIC_LLM_POLICY } from "./static_llm_policy.mjs";

async function main() {
  const manifests = [];
  for (const path of await discoverStaticLlmManifestPaths(ROOT)) {
    manifests.push(await validateStaticLlmManifestFile(path, { root: ROOT }));
  }
  const admitted = manifests.filter((manifest) => manifest.admitted && manifest.ok);
  const fixtures = manifests.filter((manifest) => manifest.fixture);
  const report = {
    ok: true,
    real_performance_claimed: false,
    notes: [
      "R25B browser budget eval is planning-only.",
      "No real decoder weights are present.",
      "R25C must measure browser load, memory, latency, and cache behavior with a real admitted artifact."
    ],
    policy: {
      primary_profile: "pro_static_llm_full",
      optional_fallback_profile: "hobby_static_llm_lite",
      profiles: STATIC_LLM_POLICY.profiles,
      target_shard_file_bytes: STATIC_LLM_POLICY.targetShardFileBytes,
      hard_max_shard_file_bytes: STATIC_LLM_POLICY.maxShardFileBytes
    },
    manifest_count: manifests.length,
    admitted_manifest_count: admitted.length,
    fixture_manifest_count: fixtures.length,
    fixture_total_bytes: fixtures.reduce((sum, manifest) => sum + manifest.total_bytes, 0),
    admitted_total_bytes: admitted.reduce((sum, manifest) => sum + manifest.total_bytes, 0)
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
