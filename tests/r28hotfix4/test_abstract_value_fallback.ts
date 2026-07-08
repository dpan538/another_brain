import test from "node:test";
import assert from "node:assert/strict";
import { abstractValueFallbackSurface, isAbstractValueFallbackCompliant } from "../../src/browser_runtime/router/abstract_value_surfaces.ts";
import { routeAbstractValueQuestion } from "../../src/browser_runtime/router/abstract_value_route.ts";

test("life and death fallback is short, bounded, and non-product", () => {
  const answer = abstractValueFallbackSurface("你如何看待生与死？", { category: "abstract_value_question" });
  assert.match(answer, /边界问题/);
  assert.match(answer, /有限时间/);
  assert.equal(isAbstractValueFallbackCompliant(answer), true);
  assert.doesNotMatch(answer, /产品模型|admission|chain-of-thought|思维链/i);
});

test("abstract route package is not a broad answer bank", () => {
  const route = routeAbstractValueQuestion("关系里最重要的是什么？");
  assert.equal(route.answer_bank, false);
  assert.equal(route.broad_answer_bank, false);
  assert.equal(route.should_attempt_q4, true);
});
