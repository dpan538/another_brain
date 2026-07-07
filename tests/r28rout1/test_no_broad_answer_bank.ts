import test from "node:test";
import assert from "node:assert/strict";
import { MICRO_INTENTS } from "../../src/browser_runtime/router/intent_taxonomy.ts";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("micro router stays bounded and does not become a broad answer bank", () => {
  assert.ok(MICRO_INTENTS.length <= 12);
  const surfaced = applyAnswerSurfacePolicy({ user_input: "写一段关于量子力学的介绍", evidence_status: "sufficient", model_output: "模型草稿" });
  assert.notEqual(surfaced.route, "capability_surface");
  assert.notEqual(surfaced.route, "identity_surface");
  assert.equal(surfaced.answer_bank, undefined);
  assert.equal(surfaced.use_model_draft, true);
});
