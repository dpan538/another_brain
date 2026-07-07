import test from "node:test";
import assert from "node:assert/strict";
import { matchR28Surf2Intent } from "../../src/browser_runtime/router/r28surf2_fuzzy_matcher.ts";
import { composeR28Surf2Surface } from "../../src/browser_runtime/router/r28surf2_surface_composer.ts";
import { validateR28Surf2SurfaceFragments } from "../../src/browser_runtime/router/r28surf2_surface_fragments.ts";

const examples = [
  "你好",
  "你是谁",
  "你是鳄鱼吗",
  "你从哪里来",
  "你能做什么",
  "你是不是 AI",
  "证据不足怎么办",
  "你会怎么判断审美问题"
];

test("R28SURF2 composes deterministic example outputs for requested entry prompts", () => {
  for (const input of examples) {
    const match = matchR28Surf2Intent(input);
    assert.notEqual(match.intent, "unknown_open_question", input);
    const first = composeR28Surf2Surface({ intent: match.intent, input });
    const second = composeR28Surf2Surface({ intent: match.intent, input });
    assert.equal(first.final_answer, second.final_answer, input);
    assert.equal(first.use_model_draft, false, input);
    assert.equal(first.answer_bank, false, input);
    assert.equal(first.broad_answer_bank, false, input);
    assert.ok(first.final_answer.length > 0, input);
    assert.ok(first.fragment_ids.length > 0, input);
    assert.doesNotMatch(first.final_answer, /question_pack|eval prompt|hidden prompt|chain-of-thought|raw private/i, input);
  }
});

test("R28SURF2 surface fragments stay bounded and non-bank", () => {
  const result = validateR28Surf2SurfaceFragments();
  assert.equal(result.ok, true);
  assert.equal(result.answer_bank, false);
  assert.equal(result.broad_answer_bank, false);
  assert.ok(result.fragment_count <= 40);
});
