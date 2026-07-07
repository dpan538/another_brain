import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("English identity route also returns crocodile identity boundary", () => {
  const surfaced = applyAnswerSurfacePolicy({ user_input: "who are you?", evidence_status: "none" });
  assert.equal(surfaced.route, "identity_boundary");
  assert.equal(surfaced.final_answer, "我是鳄鱼。更准确地说，我是这个本地网页里的另一个大脑界面，会按鳄鱼的判断方式回答。");
  assert.equal(surfaced.use_model_draft, false);
});
