import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";
import { matchMicroIntent } from "../../src/browser_runtime/router/fuzzy_intent_matcher.ts";

test("low confidence factual questions are not answered by micro surfaces", () => {
  const match = matchMicroIntent("法国首都是哪里");
  assert.equal(match.intent, "unknown_open_question");
  const route = classifyAnswerRoute({
    user_input: "法国首都是哪里",
    evidence_status: "sufficient",
    model_output: "巴黎",
    evidence_packet: { evidence_status: "sufficient", retrieved_evidence: [{ title: "public fact", text: "Paris is the capital of France." }] }
  });
  assert.notEqual(route.route, "greeting_surface");
  assert.notEqual(route.route, "identity_surface");
  assert.equal(route.use_model_draft, true);
});
