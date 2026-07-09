import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("crocodile identity question uses bounded identity surface", () => {
  const route = classifyAnswerRoute({ user_input: "你是鳄鱼吗", evidence_status: "none" });
  assert.equal(route.route, "identity_surface");
  assert.equal(route.intent, "identity_are_you_crocodile");
  assert.equal(route.use_model_draft, false);
  assert.match(route.final_answer, /鳄鱼/);
  assert.doesNotMatch(route.final_answer, /客服|customer service/i);
});
