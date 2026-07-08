import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";
import { validateSurfaceLibrary } from "../../src/browser_runtime/router/surface_library.ts";

test("R28SURF5 does not answer broad questions from surfaces", () => {
  const library = validateSurfaceLibrary();
  assert.equal(library.broad_answer_bank, false);
  assert.equal(library.categories.length, 16);
  const broad = applyAnswerSurfacePolicy({
    user_input: "请系统介绍量子力学、法国历史和所有浏览器 API",
    evidence_status: "sufficient",
    model_output: "模型草稿",
    evidence_packet: { evidence_status: "sufficient", retrieved_evidence: [{ title: "local evidence", text: "draft evidence" }] }
  });
  assert.equal(broad.use_model_draft, true);
  assert.equal(broad.broad_answer_bank, false);
  assert.notEqual(broad.route, "capability_surface");
  assert.notEqual(broad.surface_category, "capability");
});
