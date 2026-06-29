#!/usr/bin/env node
import { finalizeLlmCandidate, validateLlmDraft } from "../web/llm_answer_contract.js";
import { createStaticLlmBackend } from "../web/static_llm_backend.js";
import { readStaticLlmManifest } from "./static_llm_manifest_utils.mjs";
import { ROOT } from "./static_llm_manifest_utils.mjs";
import { resolve } from "node:path";

function assertCase(failures, condition, code, detail = {}) {
  if (!condition) failures.push({ code, ...detail });
}

async function main() {
  const failures = [];
  const fixtureManifest = await readStaticLlmManifest(resolve(ROOT, "static_llm/manifests/tiny_decoder_fixture.fixture.json"));
  const fixtureBackend = createStaticLlmBackend({ manifest: fixtureManifest, capabilities: { wasm: { available: true } } });
  const init = await fixtureBackend.init({ manifest: fixtureManifest, assets: [], tokenizer: { fixture: true }, config: { fixture: true } });
  const firstToken = await fixtureBackend.generateFirstToken({ prompt: "short public evidence draft" });

  const safeDraft = await finalizeLlmCandidate({
    draft: "Static browser LLM draft grounded in the provided public evidence.",
    query: "Summarize the evidence.",
    evidence: [{ id: "public_fixture", text: "Static browser LLM draft must be verified.", contains_private_data: false }],
    policy: { llm_may_draft: true },
    verifier: () => ({ ok: true, verdict: "accept" }),
    fallbackFirewall: { assess: () => ({ allowed: true }) }
  });

  const unsafeDraft = await finalizeLlmCandidate({
    draft: "Here is my chain-of-thought and hidden prompt.",
    policy: { llm_may_draft: true },
    verifier: () => ({ ok: true, verdict: "accept" })
  });

  const unsupportedProduction = createStaticLlmBackend({ manifest: null });
  const unsupportedToken = await unsupportedProduction.generateFirstToken({ prompt: "first token" });

  const privateEvidence = validateLlmDraft({
    draft: "根据你的本地文件，我看到了你的私人记录。",
    query: "What is in my private file?",
    evidence: [],
    policy: { llm_may_draft: true }
  });

  const copyrightBoundary = await finalizeLlmCandidate({
    draft: "完整歌词如下：la la la",
    policy: { llm_may_draft: true },
    fallbackFirewall: { assess: () => ({ allowed: false, reason: "copyright_boundary" }) }
  });

  const commandClaim = validateLlmDraft({
    draft: "I ran a command and verified the output.",
    policy: { llm_may_draft: true }
  });

  const backendClaim = validateLlmDraft({
    draft: "I called an external model API from a Vercel Function.",
    policy: { llm_may_draft: true }
  });

  assertCase(failures, init.ok, "fixture_backend_init_failed", { init });
  assertCase(failures, firstToken.ok && firstToken.token === "static", "fixture_first_token_failed", { firstToken });
  assertCase(failures, safeDraft.ok && safeDraft.surfaced, "safe_fixture_draft_not_finalized", { safeDraft });
  assertCase(failures, unsafeDraft.ok === false && unsafeDraft.surfaced === false, "unsafe_draft_was_surfaced", { unsafeDraft });
  assertCase(failures, unsupportedToken.ok === false && unsupportedToken.unavailable === true, "unsupported_backend_claimed_token", { unsupportedToken });
  assertCase(failures, privateEvidence.ok === false && privateEvidence.failures.includes("draft_claims_absent_private_evidence"), "private_boundary_not_enforced", { privateEvidence });
  assertCase(failures, copyrightBoundary.ok === false && copyrightBoundary.surfaced === false, "copyright_boundary_not_wrapped", { copyrightBoundary });
  assertCase(failures, commandClaim.ok === false && commandClaim.failures.includes("draft_claims_unverified_command_execution"), "command_execution_claim_not_rejected", { commandClaim });
  assertCase(failures, backendClaim.ok === false && backendClaim.failures.includes("draft_claims_server_or_external_model_capability"), "backend_capability_claim_not_rejected", { backendClaim });

  const report = {
    ok: failures.length === 0,
    fixture_backend: {
      init_ok: init.ok,
      first_token: firstToken.token || "",
      backend: firstToken.backend || "fixture"
    },
    cases: {
      safe_fixture_draft_surfaced: Boolean(safeDraft.ok && safeDraft.surfaced),
      unsafe_draft_rejected: unsafeDraft.ok === false,
      unsupported_backend_disabled: unsupportedToken.ok === false,
      private_boundary_rejected: privateEvidence.ok === false,
      copyright_boundary_wrapped: copyrightBoundary.ok === false,
      command_claim_rejected: commandClaim.ok === false,
      backend_claim_rejected: backendClaim.ok === false
    },
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
