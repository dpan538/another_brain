import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("open question preserves q4 draft when q4/RAG output is ready", () => {
  const draft = "我会把它看成有限性问题：生不是空白开始，死也不是漂亮句号。人能做的是留下判断、关系和作品。";
  const routed = applyAnswerSurfacePolicy({
    user_input: "你如何看待生与死？",
    evidence_status: "sufficient",
    model_output: draft,
    evidence_packet: {
      evidence_status: "sufficient",
      retrieved_evidence: [{ title: "local abstract anchor", text: "生死 有限 判断 关系 作品" }]
    }
  });
  assert.equal(routed.route, "abstract_value_question");
  assert.equal(routed.use_model_draft, true);
  assert.equal(routed.final_answer_source, "model_draft");
  assert.equal(routed.final_answer, draft);
});
