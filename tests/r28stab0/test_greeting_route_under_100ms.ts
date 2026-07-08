import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("greeting route stays under 100ms and bypasses q4 generation", () => {
  let maxMs = 0;
  let surfaced = null;
  for (let index = 0; index < 120; index += 1) {
    const started = process.hrtime.bigint();
    surfaced = applyAnswerSurfacePolicy({ user_input: "你好", evidence_status: "none", model_output: "" });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    maxMs = Math.max(maxMs, elapsedMs);
  }
  assert.equal(surfaced.route, "greeting_surface");
  assert.equal(surfaced.fallback_used, false);
  assert.equal(surfaced.final_answer_source, "router_surface");
  assert.match(surfaced.final_answer, /你好|我在|直接问|本地证据/);
  assert.ok(maxMs < 100, `greeting max latency ${maxMs}ms`);
});
