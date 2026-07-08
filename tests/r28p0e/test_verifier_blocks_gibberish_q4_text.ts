import test from "node:test";
import assert from "node:assert/strict";

test("verifier blocks replacement-character and mixed-script q4 gibberish while preserving q4 token evidence", async () => {
  const runtime = await import(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url).href);
  const evidencePacket = {
    evidence_status: "sufficient",
    retrieved_evidence: [
      { title: "local evidence a", text: "本地证据片段一。" },
      { title: "local evidence b", text: "本地证据片段二。" }
    ]
  };
  const result = runtime.verifyDraft("� become約翰如果证据不足如果证据不足им询", evidencePacket);

  assert.equal(result.passed, false);
  assert.equal(result.fallback_recommended, true);
  assert.ok(result.failures.includes("bad_token_suppressed") || result.failures.includes("low_confidence_gibberish") || result.failures.includes("repetition_guard"));
});
