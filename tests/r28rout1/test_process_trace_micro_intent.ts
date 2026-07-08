import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("browser runtime exposes micro-intent process trace markers", () => {
  const runtime = readFileSync("web/another_brain_chat/browser_runtime.js", "utf8");
  for (const marker of ["greeting_surface", "identity_surface", "origin_surface", "capability_surface", "micro_intent_fast_path", "router_surface"]) {
    assert.match(runtime, new RegExp(marker));
  }
  assert.doesNotMatch(runtime, /chain of thought/i);
});
