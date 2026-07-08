import test from "node:test";
import assert from "node:assert/strict";
import {
  abstractValueFallbackSurface,
  inferAbstractValueFallbackCategory
} from "../../src/browser_runtime/router/abstract_value_surfaces.ts";
import { classifyOpenQuestionRoute } from "../../src/browser_runtime/router/open_question_route.ts";

test("beauty question routes to aesthetic and fallback infers category without explicit category", () => {
  const route = classifyOpenQuestionRoute("什么是美？");
  assert.equal(route.category, "aesthetic_question");
  assert.equal(route.route, "aesthetic_question");
  assert.equal(route.should_attempt_q4, true);

  assert.equal(inferAbstractValueFallbackCategory("什么是美？"), "aesthetic");
  assert.equal(inferAbstractValueFallbackCategory("漂亮和难看怎么判断？"), "aesthetic");

  const answer = abstractValueFallbackSurface("什么是美？");
  assert.match(answer, /美/);
  assert.doesNotMatch(answer, /客服|产品模型|chain-of-thought|hidden prompt/i);
});

test("fallback helper infers relation and language categories from input", () => {
  assert.equal(inferAbstractValueFallbackCategory("关系里最重要的是什么？"), "relation_value");
  assert.equal(inferAbstractValueFallbackCategory("语言有什么意义？"), "language_meaning");
  assert.match(abstractValueFallbackSurface("关系里最重要的是什么？"), /关系|边界|承诺/);
  assert.match(abstractValueFallbackSurface("语言有什么意义？"), /语言|意义|词典/);
});
