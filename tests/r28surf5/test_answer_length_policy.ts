import test from "node:test";
import assert from "node:assert/strict";
import { answerVisibleCharCount, applyAnswerLengthPolicy } from "../../src/browser_runtime/router/answer_length_policy.ts";

test("R28SURF5 length policy trims by category", () => {
  const long = "我会把它看成边界问题。这里有很多解释。还有很多延伸。再继续就会变成说明书。最后一句也不需要。";
  const greeting = applyAnswerLengthPolicy("你好，我在。可以直接问。", "greeting");
  const abstract = applyAnswerLengthPolicy(long, "abstract_value_fallback");
  assert.equal(greeting.length_policy.sentence_count, 1);
  assert.ok(answerVisibleCharCount(greeting.text) <= 20);
  assert.ok(answerVisibleCharCount(abstract.text) <= 160);
  assert.ok(abstract.length_policy.sentence_count <= 4);
});
