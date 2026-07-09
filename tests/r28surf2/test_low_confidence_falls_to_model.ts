import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";
import { matchR28Surf2Intent } from "../../src/browser_runtime/router/r28surf2_fuzzy_matcher.ts";

test("low-confidence open questions fall through to q4/RAG route", () => {
  const input = "法国首都是哪里，顺便讲一下历史背景";
  const match = matchR28Surf2Intent(input);
  assert.equal(match.intent, "unknown_open_question");

  const route = classifyAnswerRoute({
    user_input: input,
    evidence_status: "sufficient",
    model_output: "巴黎是法国首都。",
    evidence_packet: {
      evidence_status: "sufficient",
      retrieved_evidence: [{ title: "local fact card", text: "Paris is the capital of France." }]
    }
  });
  assert.equal(route.route, "rag_grounded_answer");
  assert.equal(route.use_model_draft, true);
});
