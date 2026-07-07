import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("value and aesthetic questions get light style surfaces, not generic service tone", () => {
  const value = classifyAnswerRoute({ user_input: "你怎么看价值判断", evidence_status: "none" });
  assert.equal(value.route, "value_surface");
  assert.equal(value.use_model_draft, false);
  assert.match(value.final_answer, /价值|立场|证据|关系|代价/);

  const aesthetic = classifyAnswerRoute({ user_input: "你会怎么判断审美问题", evidence_status: "none" });
  assert.equal(aesthetic.route, "aesthetic_surface");
  assert.equal(aesthetic.use_model_draft, false);
  assert.match(aesthetic.final_answer, /审美|克制|结构|好看|判断/);
  assert.doesNotMatch(`${value.final_answer}\n${aesthetic.final_answer}`, /通用客服|generic assistant/i);
});
