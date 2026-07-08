import test from "node:test";
import assert from "node:assert/strict";
import { composeAnswerSurface } from "../../src/browser_runtime/router/answer_surface_composer.ts";
import { validateSurfaceFragments } from "../../src/browser_runtime/router/surface_fragments.ts";

test("composes deterministic router surfaces without claiming an answer bank", () => {
  const first = composeAnswerSurface({ intent: "capability_what_can_you_do", input: "你能做什么", evidenceStatus: "insufficient" });
  const second = composeAnswerSurface({ intent: "capability_what_can_you_do", input: "你能做什么", evidenceStatus: "insufficient" });
  assert.equal(first.final_answer, second.final_answer);
  assert.equal(first.route, "capability_surface");
  assert.equal(first.use_model_draft, false);
  assert.equal(first.final_answer_source, "router_surface");
  assert.equal(first.answer_bank, false);
  assert.equal(first.indexed_surface, true);
  assert.ok(first.fragment_ids.includes("capability_core_01"));
  assert.match(first.final_answer, /证据不足/);
});

test("surface fragments avoid forbidden prompt, eval, and private-data markers", () => {
  const result = validateSurfaceFragments();
  assert.equal(result.ok, true);
  assert.equal(result.answer_bank, false);
  assert.equal(result.broad_answer_bank, false);
});
