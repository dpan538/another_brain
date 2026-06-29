#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import {
  createStaticLlmDraftGenerator,
  getStaticLlmRuntimeStatus,
  loadStaticLlmManifest,
  validateSameOriginAssetUrl
} from "../web/static_llm_runtime.js";
import { buildLlmInputPacket, finalizeLlmCandidate, validateLlmDraft } from "../web/llm_answer_contract.js";
import { finalizeWithFallbackFirewall } from "../web/fallback_firewall.js";
import {
  discoverStaticLlmManifestPaths,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPTS = resolve(ROOT, "evals/r25_static_llm_admission/prompts.jsonl");

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function makeStaticOnlyScope(fetchLog) {
  return {
    location: { origin: "https://efishother.com" },
    fetch: async (url) => {
      fetchLog.push(String(url));
      if (/^(https?:)?\/\//i.test(String(url)) && !String(url).startsWith("https://efishother.com/")) {
        throw new Error(`external fetch blocked: ${url}`);
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };
}

async function main() {
  const prompts = await readJsonl(PROMPTS);
  const failures = [];
  const fetchLog = [];
  const scope = makeStaticOnlyScope(fetchLog);

  const profileStatus = await loadStaticLlmManifest("hobby_static_llm_lite", { scope });
  if (profileStatus.enabled !== false || profileStatus.reason !== "admitted_manifest_absent") {
    failures.push({ code: "runtime_should_be_disabled_without_admitted_manifest", profileStatus });
  }

  const manifests = await discoverStaticLlmManifestPaths(ROOT);
  const manifestResults = [];
  for (const path of manifests) {
    const normal = await validateStaticLlmManifestFile(path, { root: ROOT });
    const admittedMode = await validateStaticLlmManifestFile(path, { root: ROOT, admit: true });
    manifestResults.push({ normal, admittedMode });
    if (normal.example && admittedMode.ok) failures.push({ code: "example_manifest_admitted", file: normal.file });
  }

  const external = validateSameOriginAssetUrl("https://example.com/static_llm/assets/model.bin", scope);
  if (external.ok) failures.push({ code: "external_asset_url_allowed" });

  const generator = createStaticLlmDraftGenerator();
  const draft = await generator.generateDraft(buildLlmInputPacket({ query: "test", retrievedEvidence: [] }));
  if (draft.ok !== false || draft.unavailable !== true) failures.push({ code: "draft_generator_should_be_unavailable", draft });

  const draftValidation = validateLlmDraft({ draft: "This is a normal answer." });
  if (draftValidation.ok !== false || !draftValidation.failures.includes("static_llm_draft_disabled_by_policy")) {
    failures.push({ code: "draft_validation_should_be_disabled_by_default", draftValidation });
  }

  const riskyFinalized = finalizeWithFallbackFirewall({
    query: "夏目漱石是谁",
    candidateAnswer: "你要问哪一边？",
    intent: "static_llm_test",
    route: "static_llm_test"
  });
  if (riskyFinalized.route !== "fallback_firewall" || riskyFinalized.firewall?.allowed !== false) {
    failures.push({ code: "r24_fallback_firewall_did_not_rewrite_bad_fallback_shape", riskyFinalized });
  }

  const llmFinalized = await finalizeLlmCandidate({ draft: "This is a normal answer." });
  if (llmFinalized.ok !== false || llmFinalized.reason !== "llm_draft_rejected_before_surface") {
    failures.push({ code: "llm_contract_should_reject_disabled_draft", llmFinalized });
  }

  if (fetchLog.some((url) => /^(https?:)?\/\//i.test(url) && !url.startsWith("https://efishother.com/"))) {
    failures.push({ code: "external_fetch_logged", fetchLog });
  }

  const report = {
    ok: failures.length === 0,
    prompts: prompts.length,
    runtime_status: getStaticLlmRuntimeStatus(),
    manifest_results: manifestResults.map((item) => ({
      file: item.normal.file,
      normal_ok: item.normal.ok,
      admitted_mode_ok: item.admittedMode.ok,
      example: item.normal.example,
      admitted: item.normal.admitted
    })),
    backend_calls: 0,
    external_fetches: fetchLog.filter((url) => /^(https?:)?\/\//i.test(url) && !url.startsWith("https://efishother.com/")),
    fetch_log: fetchLog,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
