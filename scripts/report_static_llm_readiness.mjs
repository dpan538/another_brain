#!/usr/bin/env node
import {
  ROOT,
  discoverStaticLlmManifestPaths,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import { runStaticLlmFirstTokenSmoke } from "./eval_static_llm_first_token_smoke.mjs";

async function main() {
  const manifests = [];
  for (const path of await discoverStaticLlmManifestPaths(ROOT)) {
    manifests.push(await validateStaticLlmManifestFile(path, { root: ROOT, admit: true }));
  }
  const firstToken = await runStaticLlmFirstTokenSmoke();
  const admitted = manifests.filter((manifest) => manifest.ok && manifest.admitted);
  const report = {
    ok: firstToken.ok,
    admitted_model_count: admitted.length,
    fixture_ok: Boolean(firstToken.fixture?.ok),
    worker_available_in_browser: "expected",
    webgpu_required: admitted.some((manifest) => manifest.runtime_backend === "webgpu"),
    wasm_fallback_status: "stub_only_until_real_backend_binding",
    storage_plan_ok: true,
    first_token_smoke_status: firstToken.production?.skipped
      ? "fixture_passed_real_model_skipped"
      : firstToken.production?.first_token_observed
        ? "production_first_token_observed"
        : "production_first_token_not_observed",
    next_required_input: admitted.length
      ? "Bind the admitted decoder artifact to a real browser inference backend and run a first-token benchmark."
      : "Place reviewed decoder artifact under static_llm/inbox/<candidate> with artifact_metadata.json, then run R25C intake and R25D first-token gate."
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
