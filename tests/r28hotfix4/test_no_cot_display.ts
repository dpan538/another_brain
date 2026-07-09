import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { abstractValueFallbackSurface } from "../../src/browser_runtime/router/abstract_value_surfaces.ts";

const html = readFileSync("web/another_brain_chat/index.html", "utf8");
const app = readFileSync("web/another_brain_chat/app.js", "utf8");

test("public UI and fallback surfaces do not display hidden CoT labels", () => {
  assert.doesNotMatch(html, /chain-of-thought|hidden prompt|system prompt/i);
  assert.doesNotMatch(app, /chain-of-thought|hidden prompt|system prompt/i);
  assert.doesNotMatch(abstractValueFallbackSurface("你如何看待生与死？", { category: "abstract_value_question" }), /chain-of-thought|hidden prompt|system prompt/i);
});
