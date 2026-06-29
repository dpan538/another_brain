#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./static_llm_manifest_utils.mjs";
import { STATIC_LLM_POLICY } from "./static_llm_policy.mjs";

const DOC = "docs/R25C_BROWSER_STORAGE_AND_LOAD_PLAN.md";

async function main() {
  const text = await readFile(resolve(ROOT, DOC), "utf8");
  const required = [
    { code: "manifest_first", pattern: /manifest/i },
    { code: "tokenizer_config_before_shards", pattern: /tokenizer\/config|tokenizer and config|config and tokenizer/i },
    { code: "sha256_verification", pattern: /sha256/i },
    { code: "cache_storage", pattern: /CacheStorage/i },
    { code: "indexeddb_or_opfs_future_hook", pattern: /IndexedDB|OPFS/i },
    { code: "no_external_storage_products", pattern: /no external storage|forbidden.*storage|Blob, KV, Postgres, Redis/i },
    { code: "no_server_session_state", pattern: /no server session state/i },
    { code: "memory_pressure", pattern: /memory pressure/i },
    { code: "disabled_or_degraded_status", pattern: /disabled|degraded/i },
    { code: "no_performance_claim", pattern: /does not claim real model performance|no real browser performance claim/i }
  ];
  const failures = required
    .filter((item) => !item.pattern.test(text))
    .map((item) => ({ code: `storage_plan_missing_${item.code}` }));
  const report = {
    ok: failures.length === 0,
    doc: DOC,
    real_performance_claimed: false,
    policy: {
      profiles: STATIC_LLM_POLICY.profiles,
      target_shard_file_bytes: STATIC_LLM_POLICY.targetShardFileBytes,
      hard_max_shard_file_bytes: STATIC_LLM_POLICY.maxShardFileBytes,
      no_backend_or_external_storage: true
    },
    planned_sequence: [
      "load manifest",
      "verify tokenizer and config",
      "select static model shards",
      "verify sha256",
      "cache immutable chunks in browser-local storage",
      "report disabled/degraded status if browser capability is insufficient"
    ],
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
