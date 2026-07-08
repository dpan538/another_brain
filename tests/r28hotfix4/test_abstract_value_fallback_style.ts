import test from "node:test";
import assert from "node:assert/strict";
import { abstractValueFallbackSurface } from "../../src/browser_runtime/router/abstract_value_surfaces.ts";

test("abstract fallback style is concise and judgmental without service tone", () => {
  const answer = abstractValueFallbackSurface("什么是美？", { category: "aesthetic_question" });
  assert.ok(answer.length < 180);
  assert.match(answer, /美/);
  assert.doesNotMatch(answer, /很高兴为您服务|作为AI|客服|产品模型/);
});
