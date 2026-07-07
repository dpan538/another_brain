import test from "node:test";
import assert from "node:assert/strict";
import { R28SURF2_INTENTS } from "../../src/browser_runtime/router/r28surf2_intents.ts";
import { R28SURF2_SURFACE_FRAGMENTS } from "../../src/browser_runtime/router/r28surf2_surface_fragments.ts";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("R28SURF2 stays a bounded router surface layer, not a broad answer bank", () => {
  const fragmentCount = Object.values(R28SURF2_SURFACE_FRAGMENTS).flat().length;
  assert.ok(R28SURF2_INTENTS.length <= 16);
  assert.ok(fragmentCount <= 40);

  const broad = applyAnswerSurfacePolicy({
    user_input: "请系统介绍量子力学、法国历史和所有浏览器 API",
    evidence_status: "sufficient",
    model_output: "模型草稿",
    evidence_packet: { evidence_status: "sufficient", retrieved_evidence: [{ title: "local evidence", text: "draft evidence" }] }
  });
  assert.equal(broad.use_model_draft, true);
  assert.notEqual(broad.route, "value_surface");
  assert.notEqual(broad.route, "aesthetic_surface");
});
