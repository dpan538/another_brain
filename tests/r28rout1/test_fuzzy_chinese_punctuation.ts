import test from "node:test";
import assert from "node:assert/strict";
import { matchMicroIntent } from "../../src/browser_runtime/router/fuzzy_intent_matcher.ts";

test("normalizes Chinese punctuation for fuzzy micro-intent matching", () => {
  assert.equal(matchMicroIntent("你就是鳄鱼？！").intent, "identity_are_you_crocodile");
  assert.equal(matchMicroIntent("你是不是另一个大脑？").intent, "boundary_are_you_ai");
  assert.equal(matchMicroIntent("你可以帮我什么？").intent, "capability_what_can_you_do");
});
