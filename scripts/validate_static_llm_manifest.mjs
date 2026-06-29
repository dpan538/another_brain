#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ROOT,
  discoverStaticLlmManifestPaths,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import { STATIC_LLM_POLICY, normalizeRepoPath } from "./static_llm_policy.mjs";

function parseArgs(argv) {
  const out = { manifests: [], admit: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") out.manifests.push(resolve(ROOT, argv[++index]));
    else if (arg === "--admit") out.admit = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const schemaPath = resolve(ROOT, STATIC_LLM_POLICY.manifestSchemaPath);
  JSON.parse(await readFile(schemaPath, "utf8"));

  const paths = args.manifests.length ? args.manifests : await discoverStaticLlmManifestPaths(ROOT);
  const results = [];
  for (const path of paths) {
    results.push(await validateStaticLlmManifestFile(path, { root: ROOT, admit: args.admit }));
  }

  const failures = results.flatMap((result) =>
    result.failures.map((failure) => ({ file: result.file, ...failure }))
  );
  const report = {
    ok: failures.length === 0,
    schema: normalizeRepoPath(STATIC_LLM_POLICY.manifestSchemaPath),
    manifest_count: results.length,
    admitted_manifest_count: results.filter((result) => result.admitted).length,
    example_manifest_count: results.filter((result) => result.example).length,
    manifests: results,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
